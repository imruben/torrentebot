import { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { SILENT } from "../utils";
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
  requestedBy: string;
}

interface GuildMusicState {
  queue: Song[];
  player: ReturnType<typeof createAudioPlayer>;
  idleTimer: NodeJS.Timeout | null;
  // Active child processes for current song — killed on skip/stop
  activeProcesses: ReturnType<typeof spawn>[];
  // Text channel to send now-playing messages
  textChannelId: string;
}

// ─── Per-guild state ──────────────────────────────────────────────────────────
const guildStates = new Map<string, GuildMusicState>();

const IDLE_TIMEOUT_MS = 120_000;
const COOKIES_PATH = process.env.YTDLP_COOKIES_PATH ?? "/app/data/cookies.txt";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getOrCreateState(guildId: string, textChannelId: string): GuildMusicState {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      queue: [],
      player: createAudioPlayer(),
      idleTimer: null,
      activeProcesses: [],
      textChannelId,
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

function scheduleIdleLeave(guildId: string, state: GuildMusicState, client: import("discord.js").Client): void {
  clearIdleTimer(state);
  state.idleTimer = setTimeout(() => {
    getVoiceConnection(guildId)?.destroy();
    guildStates.delete(guildId);
  }, IDLE_TIMEOUT_MS);
}

// Send a message to the stored text channel for this guild (silent — no notification sound)
function sendToGuildChannel(client: import("discord.js").Client, channelId: string, content: string): void {
  const channel = client.channels.cache.get(channelId);
  if (channel?.isTextBased() && "send" in channel) {
    (channel as { send(opts: object): Promise<unknown> }).send({ content, ...SILENT }).catch(() => {});
  }
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

  if (existsSync(COOKIES_PATH)) {
    args.push("--cookies", COOKIES_PATH);
  }

  args.push(target);

  const { stdout } = await execFileAsync("yt-dlp", args);
  const lines = stdout.trim().split("\n");
  if (lines.length < 2) throw new Error("yt-dlp returned unexpected output");

  return { title: lines[0].trim(), url: lines[1].trim() };
}

// ─── Playback ─────────────────────────────────────────────────────────────────
function playNext(guildId: string, client: import("discord.js").Client): void {
  const state = guildStates.get(guildId);
  if (!state) return;

  const song = state.queue[0];
  if (!song) {
    scheduleIdleLeave(guildId, state, client);
    return;
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
    sendToGuildChannel(client, state.textChannelId, "Error reproduciendo la canción. Saltando...");
    playNext(guildId, client);
  });

  clearIdleTimer(state);
  sendToGuildChannel(client, state.textChannelId, `▶️ Reproduciendo: **${song.title}** (pedida por ${song.requestedBy})`);
}

// ─── Command handlers ─────────────────────────────────────────────────────────

export async function handlePon(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = interaction.options.getString("cancion", true);
  const member = interaction.member as GuildMember;
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({ content: "Tienes que estar en un canal de voz primero.", ephemeral: true });
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
    await interaction.editReply("No encontré esa canción. Intenta con otra búsqueda o URL.");
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
      await interaction.editReply("Error: no pude conectarme al canal de voz.");
      return;
    }
  }

  if (state.player.state.status === AudioPlayerStatus.Idle && state.queue.length === 1) {
    await interaction.editReply(`🔍 Encontrada: **${song.title}**`);
    playNext(guildId, interaction.client);
  } else {
    await interaction.editReply(`✅ Añadida a la cola (#${state.queue.length}): **${song.title}**`);
  }
}

export async function handleCola(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guild!.id;
  const state = guildStates.get(guildId);

  if (!state || state.queue.length === 0) {
    await interaction.reply({ content: "La cola está vacía.", ephemeral: true });
    return;
  }

  const lines = state.queue.map((song, i) => {
    const prefix = i === 0 ? "▶️" : `${i + 1}.`;
    return `${prefix} **${song.title}** — pedida por ${song.requestedBy}`;
  });

  await interaction.reply({ content: "**Cola de música:**\n" + lines.join("\n"), ...SILENT });
}

export async function handleSkip(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guild!.id;
  const state = guildStates.get(guildId);

  if (!state || state.queue.length === 0) {
    await interaction.reply({ content: "No hay nada reproduciéndose.", ephemeral: true });
    return;
  }

  const skipped = state.queue[0].title;
  killActiveProcesses(state);
  state.player.stop();
  await interaction.reply({ content: `⏭️ Saltando: **${skipped}**`, ...SILENT });
}

export async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guild!.id;
  const state = guildStates.get(guildId);
  const connection = getVoiceConnection(guildId);

  if (!connection && !state) {
    await interaction.reply({ content: "No estoy reproduciendo nada.", ephemeral: true });
    return;
  }

  if (state) {
    killActiveProcesses(state);
    clearIdleTimer(state);
    state.queue.length = 0;
    state.player.removeAllListeners();
    state.player.stop(true);
    guildStates.delete(guildId);
  }

  connection?.destroy();
  await interaction.reply({ content: "⏹️ Parado y desconectado.", ...SILENT });
}

export async function handlePausa(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guild!.id;
  const state = guildStates.get(guildId);

  if (!state || state.player.state.status !== AudioPlayerStatus.Playing) {
    await interaction.reply({ content: "No hay nada reproduciéndose.", ephemeral: true });
    return;
  }

  state.player.pause();
  await interaction.reply({ content: "⏸️ Pausado.", ...SILENT });
}

export async function handleSigue(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guild!.id;
  const state = guildStates.get(guildId);

  if (!state || state.player.state.status !== AudioPlayerStatus.Paused) {
    await interaction.reply({ content: "No hay nada pausado.", ephemeral: true });
    return;
  }

  state.player.unpause();
  await interaction.reply({ content: "▶️ Reanudando.", ...SILENT });
}
