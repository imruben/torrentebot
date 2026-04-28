import { Guild, GuildMember, Role } from "discord.js";
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
import client from "../client";
import { getTopUser, getFaryHolder, setFaryHolder, clearFaryHolder } from "../db";

const FARY_ROLE_NAME = "El Fary";
const ANNOUNCEMENT_CHANNEL_ID = "1181307409583591486";
const CORONACION_AUDIO = path.join(__dirname, "..", "..", "assets", "audio", "fary-coronacion.mp3");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateFaryRole(guild: Guild): Promise<Role> {
  const roles = await guild.roles.fetch();
  const existing = roles.find((r) => r.name === FARY_ROLE_NAME);
  if (existing) return existing;

  const created = await guild.roles.create({
    name: FARY_ROLE_NAME,
    color: 0xffd700,
    reason: "TorrenteBot: role for the richest member",
  });

  console.log(`[FaryRole] Created role "${FARY_ROLE_NAME}" in ${guild.name}`);
  return created;
}

async function sendAnnouncement(guild: Guild, newFary: GuildMember, balance: number): Promise<void> {
  const channel = guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
  if (!channel?.isTextBased()) {
    console.warn(`[FaryRole] Announcement channel ${ANNOUNCEMENT_CHANNEL_ID} not found or not text`);
    return;
  }
  await channel.send(
    `👑 ¡**${newFary.displayName}** es ahora **El Fary** del servidor con **${balance.toLocaleString("es-ES")} pesetas**! 🎸`
  );
}

async function playCoronacionSong(member: GuildMember): Promise<void> {
  if (!fs.existsSync(CORONACION_AUDIO)) {
    console.warn("[FaryRole] fary-coronacion.mp3 not found in assets/audio/, skipping");
    return;
  }

  // Use the member's voice channel if they're in one, otherwise pick the first
  // populated voice channel in the guild, and as a last resort any voice channel
  const guild = member.guild;
  const voiceChannel =
    member.voice.channel ??
    guild.channels.cache
      .filter((c) => c.isVoiceBased() && c.members.filter((m) => !m.user.bot).size > 0)
      .first() ??
    guild.channels.cache.filter((c) => c.isVoiceBased()).first();

  if (!voiceChannel?.isVoiceBased()) {
    console.warn("[FaryRole] No voice channel available in guild, skipping song");
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
    console.warn("[FaryRole] Failed to join voice channel for coronación song");
    return;
  }

  const resource = createAudioResource(CORONACION_AUDIO);
  const player = createAudioPlayer();

  connection.subscribe(player);
  player.play(resource);

  player.on(AudioPlayerStatus.Idle, () => {
    connection.destroy();
    console.log("[FaryRole] Coronación song finished, left voice channel");
  });

  player.on("error", (err) => {
    console.error("[FaryRole] Audio error during coronación song:", err.message);
    connection.destroy();
  });
}

// ─── Main update function ─────────────────────────────────────────────────────
// Always reads the real current holder from the DB — survives bot restarts.
// Removes the role from the old holder by their ID (no bulk member fetch needed).
export async function updateFaryRole(guildId: string): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.warn(`[FaryRole] Guild ${guildId} not found in cache`);
    return;
  }

  const [top, currentHolderId] = await Promise.all([
    getTopUser(guildId),
    getFaryHolder(guildId),
  ]);

  const newTopId = top?.user_id ?? null;

  // Nothing to do if the top user hasn't changed
  if (newTopId === currentHolderId) return;

  console.log(`[FaryRole] Updating: ${currentHolderId ?? "none"} → ${newTopId ?? "none"}`);

  const role = await getOrCreateFaryRole(guild);

  // Remove the role from the previous holder by fetching only that member
  if (currentHolderId) {
    const oldMember = await guild.members.fetch(currentHolderId).catch(() => null);
    if (oldMember) {
      await oldMember.roles.remove(role, "TorrenteBot: lost top pesetas spot").catch(() => {});
      console.log(`[FaryRole] Removed from ${oldMember.user.tag}`);
    } else {
      console.warn(`[FaryRole] Old holder ${currentHolderId} not found in guild, skipping removal`);
    }
  }

  // Update DB to reflect new state
  if (newTopId) {
    await setFaryHolder(guildId, newTopId);
  } else {
    await clearFaryHolder(guildId);
  }

  // Assign the role to the new top user
  if (!top || !newTopId) return;

  const topMember = await guild.members.fetch(newTopId).catch(() => null);
  if (!topMember) {
    console.warn(`[FaryRole] New top user ${newTopId} not found in guild`);
    return;
  }

  await topMember.roles.add(role, "TorrenteBot: richest member");
  console.log(`[FaryRole] Assigned to ${topMember.user.tag} (${top.balance.toLocaleString("es-ES")} pesetas)`);

  await sendAnnouncement(guild, topMember, top.balance);
  playCoronacionSong(topMember).catch((err) =>
    console.error("[FaryRole] Error playing song:", err.message)
  );
}
