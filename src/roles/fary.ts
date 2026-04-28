import { Guild, GuildMember, Role, TextChannel } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
} from "@discordjs/voice";
import ytdl from "@distube/ytdl-core";
import client from "../client";
import { getTopUser } from "../db";

const FARY_ROLE_NAME = "El Fary";
const FARY_SONG_URL = "https://www.youtube.com/watch?v=DkfPgvX1gOo";

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

// Sends the El Fary announcement to the guild system channel
async function sendAnnouncement(guild: Guild, newFary: GuildMember, balance: number): Promise<void> {
  const channel = guild.systemChannel;
  if (!channel) {
    console.warn("[FaryRole] No system channel set, skipping announcement");
    return;
  }

  await channel.send(
    `👑 ¡**${newFary.displayName}** es ahora **El Fary** del servidor con **${balance.toLocaleString("es-ES")} pesetas**! 🎸`
  );
}

// Joins the member's voice channel and plays the El Fary song, then leaves
async function playFarySong(member: GuildMember): Promise<void> {
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
    console.warn("[FaryRole] Failed to join voice channel for El Fary song");
    return;
  }

  const stream = ytdl(FARY_SONG_URL, {
    filter: "audioonly",
    quality: "highestaudio",
    highWaterMark: 1 << 25,
  });

  const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
  const player = createAudioPlayer();

  connection.subscribe(player);
  player.play(resource);

  player.on(AudioPlayerStatus.Idle, () => {
    connection.destroy();
    console.log("[FaryRole] El Fary song finished, left voice channel");
  });

  player.on("error", (err) => {
    console.error("[FaryRole] Audio error during El Fary song:", err.message);
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
  console.log(`[FaryRole] Top user: ${top?.user_id ?? "none"} (${top?.balance ?? 0} pesetas)`);

  const role = await getOrCreateFaryRole(guild);

  // Remove the role from anyone who holds it but is no longer the top user
  for (const [memberId, member] of role.members) {
    if (!top || memberId !== top.user_id) {
      await member.roles.remove(role, "TorrenteBot: lost top pesetas spot");
      console.log(`[FaryRole] Removed from ${member.user.tag}`);
    }
  }

  // Assign the role to the top user if they don't already have it
  if (top) {
    const topMember = await guild.members.fetch(top.user_id).catch(() => null);
    if (!topMember) {
      console.warn(`[FaryRole] Top user ${top.user_id} not found in guild`);
      return;
    }

    if (!topMember.roles.cache.has(role.id)) {
      await topMember.roles.add(role, "TorrenteBot: richest member");
      console.log(
        `[FaryRole] Assigned to ${topMember.user.tag} (${top.balance.toLocaleString("es-ES")} pesetas)`
      );

      // Announce the new El Fary and play the song
      await sendAnnouncement(guild, topMember, top.balance);
      playFarySong(topMember).catch((err) =>
        console.error("[FaryRole] Error playing song:", err.message)
      );
    } else {
      console.log(`[FaryRole] ${topMember.user.tag} already has the role, no change needed`);
    }
  }
}
