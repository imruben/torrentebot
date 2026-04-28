import { VoiceState } from "discord.js";
import { addPesetas } from "../db";

// ─── Constants ────────────────────────────────────────────────────────────────
const PESETAS_PER_MINUTE = 100;

// ─── In-memory join tracker ───────────────────────────────────────────────────
// Key: `${guildId}:${userId}` — Value: timestamp of when they joined (ms)
const joinTimestamps = new Map<string, number>();

function trackKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

// Returns the number of non-bot members currently in a voice channel
function humanCount(state: VoiceState): number {
  if (!state.channel) return 0;
  return state.channel.members.filter((m) => !m.user.bot).size;
}

// Credits pesetas earned since join time, only if at least 2 humans were present
async function creditPesetas(
  guildId: string,
  userId: string,
  hadEnoughMembers: boolean
): Promise<void> {
  const key = trackKey(guildId, userId);
  const joinedAt = joinTimestamps.get(key);
  if (!joinedAt) return;

  joinTimestamps.delete(key);

  if (!hadEnoughMembers) return;

  const elapsedMs = Date.now() - joinedAt;
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes <= 0) return;

  const earned = minutes * PESETAS_PER_MINUTE;
  await addPesetas(guildId, userId, earned);
  console.log(`[Pesetas] +${earned} pesetas → ${userId} (${minutes} min in voice)`);
}

// ─── VoiceStateUpdate handler ─────────────────────────────────────────────────
export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState
): Promise<void> {
  const userId = newState.member?.user.id ?? oldState.member?.user.id;
  const guildId = newState.guild.id;

  if (!userId) return;

  // Ignore bots
  const member = newState.member ?? oldState.member;
  if (member?.user.bot) return;

  const leftChannel = oldState.channel;
  const joinedChannel = newState.channel;

  const movedChannels =
    leftChannel !== null && joinedChannel !== null && leftChannel.id !== joinedChannel.id;
  const joined = leftChannel === null && joinedChannel !== null;
  const left = leftChannel !== null && joinedChannel === null;

  if (joined) {
    // Start tracking — only if there's at least 1 other human (so 2 total including this user)
    const othersInChannel = joinedChannel!.members.filter(
      (m) => !m.user.bot && m.id !== userId
    ).size;

    if (othersInChannel >= 1) {
      joinTimestamps.set(trackKey(guildId, userId), Date.now());
    }

    // Also start tracking others already in the channel who weren't tracked yet
    // (they may have been alone before, now there are 2)
    if (othersInChannel === 1) {
      joinedChannel!.members.forEach((m) => {
        if (m.user.bot || m.id === userId) return;
        const key = trackKey(guildId, m.id);
        if (!joinTimestamps.has(key)) {
          joinTimestamps.set(key, Date.now());
        }
      });
    }
  } else if (left) {
    // Check how many humans remain after this user leaves
    const remainingHumans = leftChannel!.members.filter(
      (m) => !m.user.bot && m.id !== userId
    ).size;

    await creditPesetas(guildId, userId, true);

    // If only 1 human remains, stop tracking them (no longer 2+ in channel)
    if (remainingHumans === 1) {
      leftChannel!.members.forEach((m) => {
        if (m.user.bot) return;
        const key = trackKey(guildId, m.id);
        const joinedAt = joinTimestamps.get(key);
        if (!joinedAt) return;

        joinTimestamps.delete(key);
        const elapsedMs = Date.now() - joinedAt;
        const minutes = Math.floor(elapsedMs / 60_000);
        if (minutes > 0) {
          const earned = minutes * PESETAS_PER_MINUTE;
          addPesetas(guildId, m.id, earned).then(() => {
            console.log(
              `[Pesetas] +${earned} pesetas → ${m.id} (${minutes} min, channel dropped to 1)`
            );
          });
        }
      });
    }
  } else if (movedChannels) {
    // User switched channels — credit old channel, start fresh in new one
    const remainingInOld = leftChannel!.members.filter(
      (m) => !m.user.bot && m.id !== userId
    ).size;
    await creditPesetas(guildId, userId, remainingInOld >= 1);

    const othersInNew = joinedChannel!.members.filter(
      (m) => !m.user.bot && m.id !== userId
    ).size;
    if (othersInNew >= 1) {
      joinTimestamps.set(trackKey(guildId, userId), Date.now());
    }

    // Same 1-remaining logic for old channel
    if (remainingInOld === 1) {
      leftChannel!.members.forEach((m) => {
        if (m.user.bot) return;
        const key = trackKey(guildId, m.id);
        const joinedAt = joinTimestamps.get(key);
        if (!joinedAt) return;

        joinTimestamps.delete(key);
        const elapsedMs = Date.now() - joinedAt;
        const minutes = Math.floor(elapsedMs / 60_000);
        if (minutes > 0) {
          const earned = minutes * PESETAS_PER_MINUTE;
          addPesetas(guildId, m.id, earned).then(() => {
            console.log(
              `[Pesetas] +${earned} pesetas → ${m.id} (${minutes} min, channel dropped to 1)`
            );
          });
        }
      });
    }
  }
}
