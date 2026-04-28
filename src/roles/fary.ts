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
import { getTopUser } from "../db";

const FARY_ROLE_NAME = "El Fary";
const ANNOUNCEMENT_CHANNEL_ID = "1181307409583591486";
const CORONACION_AUDIO = path.join(__dirname, "..", "..", "assets", "audio", "fary-coronacion.mp3");

// ─── In-memory: track who currently holds El Fary to detect real changes ─────
let currentFaryId: string | null = null;

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
    console.warn(`[FaryRole] Announcement channel ${ANNOUNCEMENT_CHANNEL_ID} not found or not a text channel`);
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

  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    console.log(`[FaryRole] ${member.user.tag} is not in a voice channel, skipping song`);
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
export async function updateFaryRole(guildId: string): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.warn(`[FaryRole] Guild ${guildId} not found in cache`);
    return;
  }

  const top = await getTopUser(guildId);
  const newTopId = top?.user_id ?? null;

  // Skip everything if the top user hasn't changed since last check
  if (newTopId === currentFaryId) return;

  console.log(`[FaryRole] El Fary changed: ${currentFaryId ?? "none"} → ${newTopId ?? "none"}`);

  const role = await getOrCreateFaryRole(guild);

  // Remove the role from anyone who holds it but is no longer the top user
  for (const [memberId, member] of role.members) {
    if (!top || memberId !== top.user_id) {
      await member.roles.remove(role, "TorrenteBot: lost top pesetas spot");
      console.log(`[FaryRole] Removed from ${member.user.tag}`);
    }
  }

  currentFaryId = newTopId;

  // Assign the role to the new top user
  if (top) {
    const topMember = await guild.members.fetch(top.user_id).catch(() => null);
    if (!topMember) {
      console.warn(`[FaryRole] Top user ${top.user_id} not found in guild`);
      return;
    }

    if (!topMember.roles.cache.has(role.id)) {
      await topMember.roles.add(role, "TorrenteBot: richest member");
      console.log(`[FaryRole] Assigned to ${topMember.user.tag} (${top.balance.toLocaleString("es-ES")} pesetas)`);
    }

    await sendAnnouncement(guild, topMember, top.balance);
    playCoronacionSong(topMember).catch((err) =>
      console.error("[FaryRole] Error playing song:", err.message)
    );
  }
}
