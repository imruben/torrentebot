import { Message } from "discord.js";
import { getLeaderboard } from "../db";

export async function handleRanking(message: Message): Promise<void> {
  if (!message.guild) return;

  const rows = await getLeaderboard(message.guild.id);

  if (rows.length === 0) {
    await message.reply("Aún no hay nadie en el ranking.");
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];

  const lines = await Promise.all(
    rows.map(async (row, i) => {
      const medal = medals[i] ?? `**${i + 1}.**`;
      let name: string;
      try {
        const member = await message.guild!.members.fetch(row.user_id);
        name = member.displayName;
      } catch {
        name = `<@${row.user_id}>`;
      }
      return `${medal} ${name} — **${row.balance.toLocaleString("es-ES")} pesetas**`;
    })
  );

  await message.reply(`🏆 **Ranking de pesetas**\n\n${lines.join("\n")}`);
}
