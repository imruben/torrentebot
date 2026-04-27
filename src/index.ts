import { Client, Events, GatewayIntentBits, Message } from "discord.js";
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

// ─── Command prefix ───────────────────────────────────────────────────────────
const PREFIX = "!torrente";

// ─── Client setup ─────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (bot) => {
  console.log(`[TorrenteBot] Logged in as ${bot.user.tag}`);
});

client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore messages from bots (including itself)
  if (message.author.bot) return;

  const isMentioned = message.mentions.has(client.user!);
  const isCommand = message.content
    .trim()
    .toLowerCase()
    .startsWith(PREFIX.toLowerCase());

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
