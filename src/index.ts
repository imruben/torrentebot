import { Client, Events, GatewayIntentBits, Message } from "discord.js";
import "dotenv/config";
import { initDb } from "./db";
import { handleSaluda } from "./commands/saluda";
import { handlePesetas } from "./commands/pesetas";
import { handleRanking } from "./commands/ranking";
import { handleApostar, handleAcepto } from "./commands/apostar";
import { handleVoiceStateUpdate, startVoiceTicker } from "./events/voiceTracker";

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

// ─── Voice state tracking (pesetas) ──────────────────────────────────────────
startVoiceTicker(client);

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

// ─── Message handler ─────────────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();
  const isMentioned = message.mentions.has(client.user!);

  if (!content.startsWith(PREFIX) && !isMentioned) return;

  // Parse subcommand: everything after "!torrente "
  const subcommand = content.startsWith(PREFIX)
    ? content.slice(PREFIX.length).trim()
    : "";

  if (subcommand.startsWith("saluda")) {
    await handleSaluda(message);
  } else if (subcommand.startsWith("pesetas")) {
    await handlePesetas(message);
  } else if (subcommand.startsWith("ranking")) {
    await handleRanking(message);
  } else if (subcommand.startsWith("apostar")) {
    await handleApostar(message);
  } else if (subcommand.startsWith("acepto")) {
    await handleAcepto(message);
  } else {
    // Fallback: mention or plain !torrente → random Fary quote
    await message.reply(randomResponse());
  }
});

// ─── Startup ──────────────────────────────────────────────────────────────────
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("[TorrenteBot] DISCORD_TOKEN is not set. Check your .env file.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("[TorrenteBot] DATABASE_URL is not set. Check your .env file.");
  process.exit(1);
}

initDb()
  .then(() => client.login(token))
  .catch((err) => {
    console.error("[TorrenteBot] Failed to initialize database:", err);
    process.exit(1);
  });
