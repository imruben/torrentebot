import { Guild, Role } from "discord.js";
import client from "../client";
import { getTopUser } from "../db";

const FARY_ROLE_NAME = "El Fary";

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

  // Remove the role from anyone who currently holds it but is not the top user.
  // role.members uses the cached member list for this role — no bulk fetch needed.
  for (const [memberId, member] of role.members) {
    if (!top || memberId !== top.user_id) {
      await member.roles.remove(role, "TorrenteBot: lost top pesetas spot");
      console.log(`[FaryRole] Removed from ${member.user.tag}`);
    }
  }

  // Assign the role to the top user. Fetch only that single member by ID.
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
    } else {
      console.log(`[FaryRole] ${topMember.user.tag} already has the role, no change needed`);
    }
  }
}
