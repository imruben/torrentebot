import { Guild, Role } from "discord.js";
import client from "../client";
import { getTopUser } from "../db";

const FARY_ROLE_NAME = "El Fary";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Finds the "El Fary" role, creating it if it doesn't exist.
// Always fetches roles from Discord to avoid stale cache.
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

  // Fetch all members fresh so role caches are up to date
  const members = await guild.members.fetch();

  // Remove the role from anyone who has it but isn't the top user
  for (const [memberId, member] of members) {
    if (member.roles.cache.has(role.id) && (!top || memberId !== top.user_id)) {
      await member.roles.remove(role, "TorrenteBot: lost top pesetas spot");
      console.log(`[FaryRole] Removed from ${member.user.tag}`);
    }
  }

  // Assign the role to the top user if they don't already have it
  if (top) {
    const topMember = members.get(top.user_id);
    if (!topMember) {
      console.warn(`[FaryRole] Top user ${top.user_id} not found in guild members`);
      return;
    }
    if (!topMember.roles.cache.has(role.id)) {
      await topMember.roles.add(role, "TorrenteBot: richest member");
      console.log(
        `[FaryRole] Assigned to ${topMember.user.tag} (${top.balance.toLocaleString("es-ES")} pesetas)`
      );
    } else {
      console.log(`[FaryRole] ${topMember.user.tag} already has the role, no change needed`);
    }
  }
}
