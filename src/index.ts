import { Events, ChatInputCommandInteraction } from "discord.js";
import "dotenv/config";
import client from "./client";
import { initDb } from "./db";
import { handleSaluda } from "./commands/saluda";
import { handleRanking } from "./commands/ranking";
import { handleApostar } from "./commands/apostar";
import { handlePon, handleCola, handleSkip, handleStop, handlePausa, handleSigue } from "./commands/music";
import { handleVoiceStateUpdate, startVoiceTicker } from "./events/voiceTracker";

client.once(Events.ClientReady, (bot) => {
  console.log(`[TorrenteBot] Logged in as ${bot.user.tag}`);
});

// ─── Voice state tracking (pesetas) ──────────────────────────────────────────
startVoiceTicker(client);

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

// ─── Slash command handler ────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const i = interaction as ChatInputCommandInteraction;

  try {
    switch (i.commandName) {
      case "saluda":   await handleSaluda(i);  break;
      case "pesetas":  await handleRanking(i); break;
      case "apostar":  await handleApostar(i); break;
      case "pon":      await handlePon(i);     break;
      case "cola":     await handleCola(i);    break;
      case "skip":     await handleSkip(i);    break;
      case "stop":     await handleStop(i);    break;
      case "pausa":    await handlePausa(i);   break;
      case "sigue":    await handleSigue(i);   break;
    }
  } catch (err) {
    console.error(`[TorrenteBot] Error handling /${i.commandName}:`, err);
    const msg = { content: "Ocurrió un error ejecutando el comando.", ephemeral: true };
    if (i.deferred || i.replied) {
      await i.editReply(msg).catch(() => {});
    } else {
      await i.reply(msg).catch(() => {});
    }
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
