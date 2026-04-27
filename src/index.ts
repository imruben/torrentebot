import { Client, Events, GatewayIntentBits, Message } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import path from "path";
import fs from "fs";
import "dotenv/config";

// ─── Bot responses ────────────────────────────────────────────────────────────
const RESPONSES: string[] = [
  "¡Viva el Fary!",
  "Soy el número uno.",
  "El Fary nunca muere.",
  "¡Arriba el rock and roll español!",
  "Como dijo el Fary: 'la vida es bella'.",
  "El Fary te manda saludos desde el más allá.",
];

function randomResponse(): string {
  return RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
}

// ─── Paths ────────────────────────────────────────────────────────────────────
const AUDIO_DIR = path.join(__dirname, "..", "assets", "audio");
const GREETING_FILE = path.join(AUDIO_DIR, "greeting.mp3");

// ─── Command prefix ───────────────────────────────────────────────────────────
const PREFIX = "!torrente";

// ─── Client setup ─────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once(Events.ClientReady, (bot) => {
  console.log(`[TorrenteBot] Logged in as ${bot.user.tag}`);
});

// ─── Voice greeting handler ──────────────────────────────────────────────────
async function handleSaluda(message: Message): Promise<void> {
  const member = message.member;
  if (!member) return;

  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    await message.reply("You need to be in a voice channel first.");
    return;
  }

  if (!fs.existsSync(GREETING_FILE)) {
    await message.reply("No greeting audio found. Add `assets/audio/greeting.mp3`.");
    return;
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
  } catch {
    connection.destroy();
    await message.reply("Failed to join the voice channel.");
    return;
  }

  const player = createAudioPlayer();
  const resource = createAudioResource(GREETING_FILE);

  connection.subscribe(player);
  player.play(resource);

  player.on(AudioPlayerStatus.Idle, () => {
    connection.destroy();
  });

  player.on("error", (err) => {
    console.error("[TorrenteBot] Audio player error:", err);
    connection.destroy();
  });
}

// ─── Message handler ─────────────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();
  const isMentioned = message.mentions.has(client.user!);

  // Handle !torrente saluda
  if (content.startsWith(`${PREFIX} saluda`)) {
    await handleSaluda(message);
    return;
  }

  // Handle mention or plain !torrente (text response)
  const isCommand = content.startsWith(PREFIX);
  if (!isMentioned && !isCommand) return;

  await message.reply(randomResponse());
});

// ─── Login ────────────────────────────────────────────────────────────────────
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("[TorrenteBot] DISCORD_TOKEN is not set. Check your .env file.");
  process.exit(1);
}

client.login(token);
