import { Guild, Role } from "discord.js";
import client from "../client";
import { getTopUser } from "../db";

const FARY_ROLE_NAME = "el fary";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Finds the "el fary" role, creating it if it doesn't exist
async function getOrCreateFaryRole(guild: Guild): Promise<Role> {
  const existing = guild.roles.cache.find(
    (r) => r.name.toLowerCase() === FARY_ROLE_NAME
  );
  if (existing) return existing;

  const created = await guild.roles.create({
    name: FARY_ROLE_NAME,
    color: 0xffd700, // gold
    reason: "TorrenteBot: role for the richest member",
  });

  console.log(`[FaryRole] Created role "${FARY_ROLE_NAME}" in ${guild.name}`);
  return created;
}

// ─── Main update function ─────────────────────────────────────────────────────

// Checks who has the most pesetas in a guild and assigns the "el fary" role to them.
// Removes it from anyone else who currently holds it.
// Call this after any pesetas balance change.
export async function updateFaryRole(guildId: string): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const top = await getTopUser(guildId);
  const role = await getOrCreateFaryRole(guild);

  // Fetch all members who currently have the role
  await guild.members.fetch();
  const currentHolders = guild.members.cache.filter((m) => m.roles.cache.has(role.id));

  // Remove the role from everyone who has it but shouldn't
  for (const [memberId, member] of currentHolders) {
    if (!top || memberId !== top.user_id) {
      await member.roles.remove(role, "TorrenteBot: lost top pesetas spot");
      console.log(`[FaryRole] Removed from ${member.user.tag}`);
    }
  }

  // Assign the role to the new top user if they don't have it already
  if (top) {
    const topMember = guild.members.cache.get(top.user_id);
    if (topMember && !topMember.roles.cache.has(role.id)) {
      await topMember.roles.add(role, "TorrenteBot: richest member");
      console.log(
        `[FaryRole] Assigned to ${topMember.user.tag} (${top.balance.toLocaleString("es-ES")} pesetas)`
      );
    }
  }
}
