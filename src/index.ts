import { Events, Message } from "discord.js";
import "dotenv/config";
import client from "./client";
import { initDb } from "./db";
import { handleSaluda } from "./commands/saluda";
import { handlePesetas } from "./commands/pesetas";
import { handleRanking } from "./commands/ranking";
import { handleApostar, handleAcepto } from "./commands/apostar";
import { handleHelp } from "./commands/help";
import { handlePon, handleCola, handleSkip, handleStop, handlePausa, handleSigue } from "./commands/music";
import { handleVoiceStateUpdate, startVoiceTicker } from "./events/voiceTracker";

// ─── Command prefix ───────────────────────────────────────────────────────────
const PREFIX = "!torrente";

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
  } else if (subcommand.startsWith("pon")) {
    const args = subcommand.slice("pon".length).trim();
    await handlePon(message, args);
  } else if (subcommand.startsWith("cola")) {
    await handleCola(message);
  } else if (subcommand.startsWith("skip")) {
    await handleSkip(message);
  } else if (subcommand.startsWith("stop")) {
    await handleStop(message);
  } else if (subcommand.startsWith("pausa")) {
    await handlePausa(message);
  } else if (subcommand.startsWith("sigue")) {
    await handleSigue(message);
  } else {
    // No subcommand or plain mention → show help menu
    await handleHelp(message);
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
