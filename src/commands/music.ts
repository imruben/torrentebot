import { Message, TextBasedChannel } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
  StreamType,
} from "@discordjs/voice";
import { execFile } from "child_process";
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

// Resolve a search query or URL to a { title, url } pair using yt-dlp
async function resolveWithYtDlp(query: string): Promise<{ title: string; url: string }> {
  // If the query is not already a URL, treat it as a search term
  const isUrl = /^https?:\/\//i.test(query);
  const target = isUrl ? query : `ytsearch1:${query}`;

  const { stdout } = await execFileAsync("yt-dlp", [
    "--print", "title",
    "--print", "url",
    "-f", "bestaudio[ext=webm]/bestaudio/best",
    "--no-playlist",
    "--js-runtimes", "node",
    target,
  ]);

  const lines = stdout.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("yt-dlp returned unexpected output");
  }

  // yt-dlp prints title then url (one per --print)
  const title = lines[0].trim();
  const url = lines[lines.length - 1].trim(); // last line is the stream URL

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

  const resource = createAudioResource(song.url, {
    inputType: StreamType.WebmOpus,
  });

  state.player.play(resource);

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
