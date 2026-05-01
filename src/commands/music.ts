import { ChatInputCommandInteraction, GuildMember, Message, TextChannel, VoiceChannel } from "discord.js";
import { SILENT } from "../utils";
import { torrente } from "../torrente";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
  StreamType,
  entersState,
} from "@discordjs/voice";
import { execFile, spawn } from "child_process";
import { existsSync } from "fs";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ─── Types ────────────────────────────────────────────────────────────────────
interface Song {
  title: string;
  url: string;
  requestedBy: string; // "autodj" for auto-queued songs
}

interface GuildMusicState {
  queue: Song[];
  player: ReturnType<typeof createAudioPlayer>;
  idleTimer: NodeJS.Timeout | null;
  activeProcesses: ReturnType<typeof spawn>[];
  textChannelId: string;
  // Auto-DJ
  autoDj: boolean;
  lastPlayedUrl: string | null;
  recentlyPlayed: string[]; // last 10 URLs to avoid repeats
  // Vote skip — reference to the current "now playing" message
  nowPlayingMessage: Message | null;
  voteSkipCollector: import("discord.js").ReactionCollector | null;
}

// ─── Per-guild state ──────────────────────────────────────────────────────────
const guildStates = new Map<string, GuildMusicState>();

const IDLE_TIMEOUT_MS = 120_000;
const COOKIES_PATH = process.env.YTDLP_COOKIES_PATH ?? "/app/data/cookies.txt";
const RECENTLY_PLAYED_LIMIT = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getOrCreateState(guildId: string, textChannelId: string): GuildMusicState {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      queue: [],
      player: createAudioPlayer(),
      idleTimer: null,
      activeProcesses: [],
      textChannelId,
      autoDj: false,
      lastPlayedUrl: null,
      recentlyPlayed: [],
      nowPlayingMessage: null,
      voteSkipCollector: null,
    });
  }
  return guildStates.get(guildId)!;
}

function killActiveProcesses(state: GuildMusicState): void {
  for (const proc of state.activeProcesses) {
    try { proc.kill("SIGKILL"); } catch { /* already dead */ }
  }
  state.activeProcesses = [];
}

function clearIdleTimer(state: GuildMusicState): void {
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
}

function scheduleIdleLeave(guildId: string, state: GuildMusicState): void {
  clearIdleTimer(state);
  state.idleTimer = setTimeout(() => {
    getVoiceConnection(guildId)?.destroy();
    guildStates.delete(guildId);
  }, IDLE_TIMEOUT_MS);
}

// Stop the vote-skip reaction collector for the current song
function clearVoteSkip(state: GuildMusicState): void {
  state.voteSkipCollector?.stop();
  state.voteSkipCollector = null;
  state.nowPlayingMessage = null;
}

// ─── Now-playing message + vote skip ─────────────────────────────────────────
async function sendNowPlaying(
  client: import("discord.js").Client,
  guildId: string,
  state: GuildMusicState,
  song: Song
): Promise<void> {
  const channel = client.channels.cache.get(state.textChannelId);
  if (!channel?.isTextBased() || !("send" in channel)) return;

  const label = song.requestedBy === "autodj"
    ? torrente("now_playing_autodj", { title: song.title })
    : torrente("now_playing", { title: song.title, requestedBy: song.requestedBy });

  let msg: Message;
  try {
    msg = await (channel as TextChannel).send({ content: label, ...SILENT });
  } catch {
    return;
  }

  state.nowPlayingMessage = msg;

  // Add skip reaction
  try {
    await msg.react("⏭️");
  } catch {
    return;
  }

  // Count humans in the voice channel for threshold
  const connection = getVoiceConnection(guildId);
  const voiceChannelId = connection?.joinConfig.channelId;
  const voiceChannel = voiceChannelId
    ? (client.channels.cache.get(voiceChannelId) as VoiceChannel | null)
    : null;

  const humanCount = voiceChannel?.members.filter((m) => !m.user.bot).size ?? 1;
  const threshold = Math.ceil(humanCount / 2);

  const collector = msg.createReactionCollector({
    filter: (reaction, user) => reaction.emoji.name === "⏭️" && !user.bot,
    // Stop when song ends via idle event
  });

  state.voteSkipCollector = collector;

  collector.on("collect", async () => {
    const votes = collector.collected.get("⏭️")?.count ?? 0;
    // Subtract 1 for the bot's own reaction
    const userVotes = Math.max(0, votes - 1);

    if (userVotes >= threshold) {
      collector.stop("voted");
      const skippedTitle = state.queue[0]?.title ?? "canción actual";
      killActiveProcesses(state);
      state.player.stop();
      try {
        await msg.edit({ content: torrente("vote_skip", { title: skippedTitle, votes: String(userVotes), threshold: String(threshold) }) });
      } catch { /* message may be deleted */ }
    }
  });
}

// ─── yt-dlp resolve ───────────────────────────────────────────────────────────
async function resolveWithYtDlp(query: string): Promise<{ title: string; url: string }> {
  const isUrl = /^https?:\/\//i.test(query);
  const target = isUrl ? query : `ytsearch1:${query}`;

  const args = [
    "--print", "title",
    "--print", "webpage_url",
    "--no-playlist",
    "--js-runtimes", "node",
    "--extractor-args", "youtube:player_client=web",
    "--remote-components", "ejs:github",
    "--skip-download",
  ];

  if (existsSync(COOKIES_PATH)) args.push("--cookies", COOKIES_PATH);
  args.push(target);

  const { stdout } = await execFileAsync("yt-dlp", args);
  const lines = stdout.trim().split("\n");
  if (lines.length < 2) throw new Error("yt-dlp returned unexpected output");

  return { title: lines[0].trim(), url: lines[1].trim() };
}

// ─── Auto-DJ: get related songs from YouTube Mix ──────────────────────────────
async function getRelatedSong(
  lastUrl: string,
  recentlyPlayed: string[]
): Promise<{ title: string; url: string } | null> {
  try {
    // Extract video ID from the canonical YouTube URL
    const match = lastUrl.match(/[?&]v=([^&]+)/);
    if (!match) return null;
    const videoId = match[1];

    // YouTube Mix for this video is RD<videoId>
    const mixUrl = `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`;

    const args = [
      "--print", "title",
      "--print", "webpage_url",
      "--flat-playlist",
      "--playlist-items", "2:8", // grab items 2–8 (skip item 1 = the song itself)
      "--js-runtimes", "node",
      "--extractor-args", "youtube:player_client=web",
      "--remote-components", "ejs:github",
    ];

    if (existsSync(COOKIES_PATH)) args.push("--cookies", COOKIES_PATH);
    args.push(mixUrl);

    const { stdout } = await execFileAsync("yt-dlp", args, { timeout: 30_000 });
    const lines = stdout.trim().split("\n").filter(Boolean);

    // Lines alternate: title, url, title, url, ...
    const candidates: { title: string; url: string }[] = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const title = lines[i].trim();
      const url = lines[i + 1].trim();
      if (url.startsWith("http") && !recentlyPlayed.includes(url)) {
        candidates.push({ title, url });
      }
    }

    if (candidates.length === 0) return null;

    // Pick a random candidate
    return candidates[Math.floor(Math.random() * candidates.length)];
  } catch (err) {
    console.error("[Music] Auto-DJ: failed to get related songs:", err);
    return null;
  }
}

// ─── Playback ─────────────────────────────────────────────────────────────────
function playNext(guildId: string, client: import("discord.js").Client): void {
  const state = guildStates.get(guildId);
  if (!state) return;

  // Clear previous vote-skip collector
  clearVoteSkip(state);

  const song = state.queue[0];
  if (!song) {
    // Queue is empty — try Auto-DJ or go idle
    if (state.autoDj && state.lastPlayedUrl) {
      const lastUrl = state.lastPlayedUrl;
      const recentlyPlayed = [...state.recentlyPlayed];

      getRelatedSong(lastUrl, recentlyPlayed).then((related) => {
        const currentState = guildStates.get(guildId);
        if (!currentState || !currentState.autoDj) return; // stopped while fetching

        if (!related) {
          console.log("[Music] Auto-DJ: no related songs found, going idle");
          scheduleIdleLeave(guildId, currentState);
          return;
        }

        currentState.queue.push({
          title: related.title,
          url: related.url,
          requestedBy: "autodj",
        });

        playNext(guildId, client);
      });
    } else {
      scheduleIdleLeave(guildId, state);
    }
    return;
  }

  // Track last played + recently played for Auto-DJ
  state.lastPlayedUrl = song.url;
  state.recentlyPlayed.push(song.url);
  if (state.recentlyPlayed.length > RECENTLY_PLAYED_LIMIT) {
    state.recentlyPlayed.shift();
  }

  killActiveProcesses(state);

  const ytdlpArgs = [
    "-o", "-",
    "-f", "bestaudio/best",
    "--no-playlist",
    "--quiet",
    "--js-runtimes", "node",
    "--extractor-args", "youtube:player_client=web",
    "--remote-components", "ejs:github",
  ];

  if (existsSync(COOKIES_PATH)) ytdlpArgs.push("--cookies", COOKIES_PATH);
  ytdlpArgs.push(song.url);

  const ytdlp = spawn("yt-dlp", ytdlpArgs, { stdio: ["ignore", "pipe", "pipe"] });
  const ffmpeg = spawn("ffmpeg", [
    "-loglevel", "error",
    "-i", "pipe:0",
    "-vn", "-f", "s16le", "-ar", "48000", "-ac", "2",
    "pipe:1",
  ], { stdio: ["pipe", "pipe", "pipe"] });

  state.activeProcesses = [ytdlp, ffmpeg];

  ytdlp.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdin.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EPIPE") console.error("[Music] ffmpeg stdin error:", err);
  });
  ytdlp.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EPIPE") console.error("[Music] yt-dlp stdout error:", err);
  });
  ytdlp.stderr.on("data", (d) => { const m = d.toString().trim(); if (m) console.error(`[Music] yt-dlp: ${m}`); });
  ffmpeg.stderr.on("data", (d) => { const m = d.toString().trim(); if (m) console.log(`[Music] ffmpeg: ${m.slice(0, 120)}`); });
  ytdlp.on("error", (err: NodeJS.ErrnoException) => { if (err.code !== "EPIPE") console.error("[Music] yt-dlp spawn error:", err); });
  ffmpeg.on("error", (err: NodeJS.ErrnoException) => { if (err.code !== "EPIPE") console.error("[Music] ffmpeg spawn error:", err); });

  const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw });

  state.player.play(resource);
  console.log(`[Music] Playing: ${song.title}`);

  state.player.removeAllListeners(AudioPlayerStatus.Idle);
  state.player.once(AudioPlayerStatus.Idle, () => {
    state.queue.shift();
    playNext(guildId, client);
  });

  state.player.removeAllListeners("error");
  state.player.on("error", (err) => {
    console.error(`[Music] Player error in guild ${guildId}:`, err);
    state.queue.shift();
    const channel = client.channels.cache.get(state.textChannelId);
    if (channel?.isTextBased() && "send" in channel) {
      (channel as TextChannel).send({ content: torrente("error_generic"), ...SILENT }).catch(() => {});
    }
    playNext(guildId, client);
  });

  clearIdleTimer(state);

  // Send now-playing message with vote-skip reactor (async, don't block playback)
  sendNowPlaying(client, guildId, state, song).catch(() => {});
}

// ─── Command handlers ─────────────────────────────────────────────────────────

export async function handlePon(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = interaction.options.getString("cancion", true);
  const member = interaction.member as GuildMember;
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({ content: torrente("error_no_voice"), ephemeral: true });
    return;
  }

  await interaction.deferReply({ ...SILENT });

  const guildId = interaction.guild!.id;
  const state = getOrCreateState(guildId, interaction.channelId);

  let songInfo: { title: string; url: string };
  try {
    songInfo = await resolveWithYtDlp(query);
  } catch (err) {
    console.error("[Music] yt-dlp error:", err);
    await interaction.editReply(torrente("error_resolve"));
    return;
  }

  const song: Song = {
    title: songInfo.title,
    url: songInfo.url,
    requestedBy: interaction.user.username,
  };

  state.queue.push(song);

  let connection = getVoiceConnection(guildId);
  if (!connection) {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild!.voiceAdapterCreator,
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      connection?.destroy();
      guildStates.delete(guildId);
    });

    connection.subscribe(state.player);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
      console.log("[Music] Voice connection is ready");
    } catch {
      console.error("[Music] Voice connection failed to become ready in 10s");
      connection.destroy();
      guildStates.delete(guildId);
      await interaction.editReply(torrente("error_voice_connect"));
      return;
    }
  }

  if (state.player.state.status === AudioPlayerStatus.Idle && state.queue.length === 1) {
    await interaction.editReply(torrente("song_playing", { title: song.title }));
    playNext(guildId, interaction.client);
  } else {
    await interaction.editReply(torrente("song_added", { title: song.title }));
  }
}

export async function handleCola(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guild!.id;
  const state = guildStates.get(guildId);

  if (!state || state.queue.length === 0) {
    await interaction.reply({ content: torrente("queue_empty"), ephemeral: true });
    return;
  }

  const autoDjStatus = state.autoDj ? " 🤖 Auto-DJ activado" : "";
  const lines = state.queue.map((song, i) => {
    const prefix = i === 0 ? "▶️" : `${i + 1}.`;
    const by = song.requestedBy === "autodj" ? "Auto-DJ" : song.requestedBy;
    return `${prefix} **${song.title}** — pedida por ${by}`;
  });

  await interaction.reply({ content: `${torrente("queue_header")}${autoDjStatus}\n${lines.join("\n")}`, ...SILENT });
}

export async function handleSkip(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guild!.id;
  const state = guildStates.get(guildId);

  if (!state || state.queue.length === 0) {
    await interaction.reply({ content: torrente("error_no_music"), ephemeral: true });
    return;
  }

  const skipped = state.queue[0].title;
  killActiveProcesses(state);
  state.player.stop();
  await interaction.reply({ content: torrente("skip", { title: skipped }), ...SILENT });
}

export async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guild!.id;
  const state = guildStates.get(guildId);
  const connection = getVoiceConnection(guildId);

  if (!connection && !state) {
    await interaction.reply({ content: torrente("error_not_connected"), ephemeral: true });
    return;
  }

  if (state) {
    clearVoteSkip(state);
    killActiveProcesses(state);
    clearIdleTimer(state);
    state.queue.length = 0;
    state.autoDj = false;
    state.player.removeAllListeners();
    state.player.stop(true);
    guildStates.delete(guildId);
  }

  connection?.destroy();
  await interaction.reply({ content: torrente("stop"), ...SILENT });
}

export async function handlePausa(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guild!.id;
  const state = guildStates.get(guildId);

  if (!state || state.player.state.status !== AudioPlayerStatus.Playing) {
    await interaction.reply({ content: torrente("error_not_playing"), ephemeral: true });
    return;
  }

  state.player.pause();
  await interaction.reply({ content: torrente("pause"), ...SILENT });
}

export async function handleSigue(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guild!.id;
  const state = guildStates.get(guildId);

  if (!state || state.player.state.status !== AudioPlayerStatus.Paused) {
    await interaction.reply({ content: torrente("error_not_paused"), ephemeral: true });
    return;
  }

  state.player.unpause();
  await interaction.reply({ content: torrente("resume"), ...SILENT });
}

export async function handleAutodj(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guild!.id;
  const state = guildStates.get(guildId);

  if (!state) {
    await interaction.reply({ content: torrente("autodj_no_state"), ephemeral: true });
    return;
  }

  state.autoDj = !state.autoDj;

  await interaction.reply({
    content: state.autoDj ? torrente("autodj_on") : torrente("autodj_off"),
    ...SILENT,
  });
}
