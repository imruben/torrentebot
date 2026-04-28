import { Client, VoiceState } from "discord.js";
import { addPesetas } from "../db";
import { updateFaryRole } from "../roles/fary";

const PESETAS_PER_TICK = 100;
const TICK_INTERVAL_MS = 60_000;

// ─── Active voice sessions ────────────────────────────────────────────────────
// Key: `${guildId}:${userId}` — Value: channelId they are currently in
const voiceSessions = new Map<string, string>();

function sessionKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

// ─── Periodic tick ────────────────────────────────────────────────────────────
// Every minute, award pesetas to every user in a voice channel with 2+ humans
export function startVoiceTicker(client: Client): void {
  // On startup, populate sessions from current voice states so users already
  // in voice before the bot started are tracked immediately
  client.once("clientReady", () => {
    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased()) continue;
        const humans = channel.members.filter((m) => !m.user.bot);
        if (humans.size < 2) continue;
        for (const member of humans.values()) {
          voiceSessions.set(sessionKey(guild.id, member.id), channel.id);
          console.log(`[VoiceTracker] Resuming session: ${member.user.tag} in ${channel.name}`);
        }
      }
    }
  });

  setInterval(async () => {
    const updatedGuilds = new Set<string>();

    for (const [key, channelId] of voiceSessions) {
      const [guildId, userId] = key.split(":");
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;

      const channel = guild.channels.cache.get(channelId);
      if (!channel?.isVoiceBased()) continue;

      const humanCount = channel.members.filter((m) => !m.user.bot).size;
      if (humanCount < 2) continue;

      const newBalance = await addPesetas(guildId, userId, PESETAS_PER_TICK);
      console.log(
        `[Pesetas] +${PESETAS_PER_TICK} pesetas → ${userId} | balance: ${newBalance}`
      );
      updatedGuilds.add(guildId);
    }

    // Update the fary role once per guild where pesetas changed
    for (const guildId of updatedGuilds) {
      await updateFaryRole(guildId).catch((err) =>
        console.error("[FaryRole] Error updating after tick:", err)
      );
    }
  }, TICK_INTERVAL_MS);
}

// ─── VoiceStateUpdate handler ─────────────────────────────────────────────────
export function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const guildId = newState.guild.id;
  const userId = member.id;
  const key = sessionKey(guildId, userId);

  const leftChannel = oldState.channel;
  const joinedChannel = newState.channel;

  if (joinedChannel && (!leftChannel || leftChannel.id !== joinedChannel.id)) {
    // User joined or switched to a new channel — start/update their session
    voiceSessions.set(key, joinedChannel.id);
  } else if (!joinedChannel && leftChannel) {
    // User left voice entirely — remove session
    voiceSessions.delete(key);
  }
}
