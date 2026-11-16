import { Events, ChatInputCommandInteraction, StringSelectMenuInteraction, ModalSubmitInteraction } from "discord.js";
import "dotenv/config";
import client from "./client";
import { initDb } from "./db";
import { handleAudio } from "./commands/audio";
import { handleRanking } from "./commands/ranking";
import { handleApostar } from "./commands/apostar";
import { handlePon, handleCola, handleSkip, handleStop, handlePausa, handleSigue, handleAutodj } from "./commands/music";
import { handleRuleta, handleRuletaSelect, handleRuletaModal } from "./commands/ruleta";
import { handleCookies } from "./commands/cookies";
import { commands } from "./commands/definitions";
import { handleVoiceStateUpdate, startVoiceTicker } from "./events/voiceTracker";
import { restoreCookies, startCookieSync, startYtDlpAutoUpdate } from "./ytdlp";

// A stray rejection (DB hiccup, Discord API error) must not take the whole bot down
process.on("unhandledRejection", (err) => {
  console.error("[TorrenteBot] Unhandled rejection:", err);
});

// Registers the slash commands so new/changed commands never need a manual `npm run deploy`.
// Updates whichever scope is already in use (global and/or per-guild) to avoid duplicates.
async function registerCommands(): Promise<void> {
  const app = client.application;
  if (!app) return;

  const guildsWithOwnCommands = [];
  for (const guild of client.guilds.cache.values()) {
    const existing = await guild.commands.fetch().catch(() => null);
    if (existing && existing.size > 0) guildsWithOwnCommands.push(guild);
  }

  const globalCommands = await app.commands.fetch();
  if (globalCommands.size > 0 || guildsWithOwnCommands.length === 0) {
    await app.commands.set(commands);
  }
  for (const guild of guildsWithOwnCommands) {
    await guild.commands.set(commands);
  }
  console.log(`[TorrenteBot] Slash commands registered (${commands.length})`);
}

client.once(Events.ClientReady, (bot) => {
  console.log(`[TorrenteBot] Logged in as ${bot.user.tag}`);
  registerCommands().catch((err) => console.error("[TorrenteBot] Failed to register commands:", err));
});

// ─── Voice state tracking (pesetas) ──────────────────────────────────────────
startVoiceTicker(client);

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

// ─── Slash command handler ────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const i = interaction as ChatInputCommandInteraction;
      switch (i.commandName) {
        case "audio":    await handleAudio(i);   break;
        case "pesetas":  await handleRanking(i); break;
        case "apostar":  await handleApostar(i); break;
        case "pon":      await handlePon(i);     break;
        case "cola":     await handleCola(i);    break;
        case "skip":     await handleSkip(i);    break;
        case "stop":     await handleStop(i);    break;
        case "pausa":    await handlePausa(i);   break;
        case "sigue":    await handleSigue(i);   break;
        case "autodj":   await handleAutodj(i);  break;
        case "ruleta":   await handleRuleta(i);  break;
        case "cookies":  await handleCookies(i); break;
      }
    } else if (interaction.isStringSelectMenu()) {
      const i = interaction as StringSelectMenuInteraction;
      if (i.customId === "ruleta_tipo") await handleRuletaSelect(i);
    } else if (interaction.isModalSubmit()) {
      const i = interaction as ModalSubmitInteraction;
      if (i.customId === "ruleta_numero_modal") await handleRuletaModal(i);
    }
  } catch (err) {
    console.error("[TorrenteBot] Error handling interaction:", err);
    const msg = { content: "Me cago en todo lo que se menea. Algo ha petao, chaval.", ephemeral: true };
    if ("deferred" in interaction && "replied" in interaction) {
      const i = interaction as ChatInputCommandInteraction;
      if (i.deferred || i.replied) {
        await i.editReply(msg).catch(() => {});
      } else {
        await i.reply(msg).catch(() => {});
      }
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

startYtDlpAutoUpdate();

initDb()
  .then(() => restoreCookies())
  .then(() => {
    startCookieSync();
    return client.login(token);
  })
  .catch((err) => {
    console.error("[TorrenteBot] Failed to initialize database:", err);
    process.exit(1);
  });
