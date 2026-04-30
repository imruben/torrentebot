import { Message, TextBasedChannel } from "discord.js";
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
// Helper to send to a channel without TS complaining about PartialGroupDMChannel
function sendToChannel(channel: Message["channel"], content: string): void {
  if ("send" in channel) {
    (channel as { send(content: string): Promise<unknown> }).send(content).catch(() => {});
  }
}

interface Song {
  title: string;
  url: string;        // Direct audio stream URL from yt-dlp
  requestedBy: string; // Username who requested
}

interface GuildMusicState {
  queue: Song[];
  player: ReturnType<typeof createAudioPlayer>;
  idleTimer: NodeJS.Timeout | null;
}

// ─── Per-guild state ──────────────────────────────────────────────────────────
const guildStates = new Map<string, GuildMusicState>();

const IDLE_TIMEOUT_MS = 120_000; // Leave voice after 2 min idle

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getOrCreateState(guildId: string): GuildMusicState {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      queue: [],
      player: createAudioPlayer(),
      idleTimer: null,
    });
  }
  return guildStates.get(guildId)!;
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
    const connection = getVoiceConnection(guildId);
    connection?.destroy();
    guildStates.delete(guildId);
  }, IDLE_TIMEOUT_MS);
}

const COOKIES_PATH = process.env.YTDLP_COOKIES_PATH ?? "/app/data/cookies.txt";

// Resolve a search query or URL → { title, originalUrl } using yt-dlp
// We only fetch title + the canonical YouTube URL (not the stream URL).
// The actual audio is streamed later by yt-dlp in playNext().
async function resolveWithYtDlp(query: string): Promise<{ title: string; url: string }> {
  const isUrl = /^https?:\/\//i.test(query);
  const target = isUrl ? query : `ytsearch1:${query}`;

  const args = [
    "--print", "title",
    "--print", "webpage_url",  // canonical YouTube URL, not the expiring stream URL
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
  if (lines.length < 2) {
    throw new Error("yt-dlp returned unexpected output");
  }

  const title = lines[0].trim();
  const url = lines[1].trim();

  return { title, url };
}

// Play the next song in the queue for a guild
function playNext(guildId: string, channel: Message["channel"]): void {
  const state = guildStates.get(guildId);
  if (!state) return;

  const song = state.queue[0];
  if (!song) {
    scheduleIdleLeave(guildId, state);
    return;
  }

  // yt-dlp downloads the audio and pipes it to stdout (-o -)
  // ffmpeg reads from stdin and converts to raw PCM for discord.js
  const ytdlpArgs = [
    "-o", "-",
    "-f", "bestaudio/best",
    "--no-playlist",
    "--quiet",
    "--js-runtimes", "node",
    "--extractor-args", "youtube:player_client=web",
    "--remote-components", "ejs:github",
  ];

  if (existsSync(COOKIES_PATH)) {
    ytdlpArgs.push("--cookies", COOKIES_PATH);
  }

  ytdlpArgs.push(song.url);

  const ytdlp = spawn("yt-dlp", ytdlpArgs, { stdio: ["ignore", "pipe", "pipe"] });

  const ffmpeg = spawn("ffmpeg", [
    "-i", "pipe:0",
    "-vn",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1",
  ], { stdio: ["pipe", "pipe", "pipe"] });

  // Pipe yt-dlp stdout → ffmpeg stdin
  ytdlp.stdout.pipe(ffmpeg.stdin);

  ytdlp.stderr.on("data", (d) => {
    const msg = d.toString().trim();
    if (msg) console.error(`[Music] yt-dlp: ${msg}`);
  });

  ffmpeg.stderr.on("data", (d) => {
    const msg = d.toString().trim();
    if (msg) console.log(`[Music] ffmpeg: ${msg.slice(0, 120)}`);
  });

  ytdlp.on("error", (err) => console.error(`[Music] yt-dlp spawn error:`, err));
  ffmpeg.on("error", (err) => console.error(`[Music] ffmpeg spawn error:`, err));

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw,
  });

  state.player.play(resource);
  console.log(`[Music] Playing: ${song.title}`);

  state.player.removeAllListeners(AudioPlayerStatus.Idle);
  state.player.once(AudioPlayerStatus.Idle, () => {
    state.queue.shift();
    playNext(guildId, channel);
  });

  state.player.removeAllListeners("error");
  state.player.on("error", (err) => {
    console.error(`[Music] Player error in guild ${guildId}:`, err);
    state.queue.shift();
    sendToChannel(channel, `Error reproduciendo la canción. Saltando...`);
    playNext(guildId, channel);
  });

  clearIdleTimer(state);
  sendToChannel(channel, `▶️ Reproduciendo: **${song.title}** (pedida por ${song.requestedBy})`);
}

// ─── Command handlers ─────────────────────────────────────────────────────────

// !torrente pon <query or URL>
export async function handlePon(message: Message, args: string): Promise<void> {
  if (!args) {
    await message.reply("Usa: `!torrente pon <nombre de canción o URL>`");
    return;
  }

  const voiceChannel = message.member?.voice.channel;
  if (!voiceChannel) {
    await message.reply("Tienes que estar en un canal de voz primero.");
    return;
  }

  const guildId = message.guild!.id;
  const state = getOrCreateState(guildId);

  // Show searching message
  const searching = await message.reply(`Buscando **${args}**...`);

  let songInfo: { title: string; url: string };
  try {
    songInfo = await resolveWithYtDlp(args);
  } catch (err) {
    console.error("[Music] yt-dlp error:", err);
    await searching.edit("No encontré esa canción. Intenta con otra búsqueda o URL.");
    return;
  }

  const song: Song = {
    title: songInfo.title,
    url: songInfo.url,
    requestedBy: message.author.username,
  };

  state.queue.push(song);
  await searching.delete().catch(() => {});

  // Join voice if not already connected
  let connection = getVoiceConnection(guildId);
  if (!connection) {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: message.guild!.voiceAdapterCreator,
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      connection?.destroy();
      guildStates.delete(guildId);
    });

    connection.subscribe(state.player);

    // Wait for the connection to be ready before playing
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
      console.log("[Music] Voice connection is ready");
    } catch {
      console.error("[Music] Voice connection failed to become ready in 10s");
      connection.destroy();
      guildStates.delete(guildId);
      sendToChannel(message.channel, "Error: no pude conectarme al canal de voz.");
      return;
    }
  }

  // If player is idle (nothing playing), start now. Otherwise just enqueue.
  if (state.player.state.status === AudioPlayerStatus.Idle && state.queue.length === 1) {
    playNext(guildId, message.channel);
  } else if (state.queue.length > 1) {
    sendToChannel(message.channel, `✅ Añadida a la cola (#${state.queue.length}): **${song.title}**`);
  }
}

// !torrente cola
export async function handleCola(message: Message): Promise<void> {
  const guildId = message.guild!.id;
  const state = guildStates.get(guildId);

  if (!state || state.queue.length === 0) {
    await message.reply("La cola está vacía.");
    return;
  }

  const lines = state.queue.map((song, i) => {
    const prefix = i === 0 ? "▶️" : `${i + 1}.`;
    return `${prefix} **${song.title}** — pedida por ${song.requestedBy}`;
  });

  await message.reply(`**Cola de música:**\n${lines.join("\n")}`);
}

// !torrente skip
export async function handleSkip(message: Message): Promise<void> {
  const guildId = message.guild!.id;
  const state = guildStates.get(guildId);

  if (!state || state.queue.length === 0) {
    await message.reply("No hay nada reproduciéndose.");
    return;
  }

  const skipped = state.queue[0].title;
  state.player.stop(); // triggers the Idle event → playNext
  await message.reply(`⏭️ Saltando: **${skipped}**`);
}

// !torrente stop
export async function handleStop(message: Message): Promise<void> {
  const guildId = message.guild!.id;
  const state = guildStates.get(guildId);

  const connection = getVoiceConnection(guildId);
  if (!connection && !state) {
    await message.reply("No estoy reproduciendo nada.");
    return;
  }

  if (state) {
    clearIdleTimer(state);
    state.queue.length = 0;
    state.player.removeAllListeners();
    state.player.stop(true);
    guildStates.delete(guildId);
  }

  connection?.destroy();
  await message.reply("⏹️ Parado y desconectado.");
}

// !torrente pausa
export async function handlePausa(message: Message): Promise<void> {
  const guildId = message.guild!.id;
  const state = guildStates.get(guildId);

  if (!state || state.player.state.status !== AudioPlayerStatus.Playing) {
    await message.reply("No hay nada reproduciéndose.");
    return;
  }

  state.player.pause();
  await message.reply("⏸️ Pausado.");
}

// !torrente sigue
export async function handleSigue(message: Message): Promise<void> {
  const guildId = message.guild!.id;
  const state = guildStates.get(guildId);

  if (!state || state.player.state.status !== AudioPlayerStatus.Paused) {
    await message.reply("No hay nada pausado.");
    return;
  }

  state.player.unpause();
  await message.reply("▶️ Reanudando.");
}
