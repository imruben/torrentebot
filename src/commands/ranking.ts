import { ChatInputCommandInteraction } from "discord.js";
import { getLeaderboard } from "../db";
import { SILENT } from "../utils";
import { torrente } from "../torrente";

export async function handleRanking(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return;

  await interaction.deferReply({ ...SILENT });

  const rows = await getLeaderboard(interaction.guild.id);

  if (rows.length === 0) {
    await interaction.editReply(torrente("ranking_empty"));
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];

  const lines = await Promise.all(
    rows.map(async (row, i) => {
      const medal = medals[i] ?? `**${i + 1}.**`;
      let name: string;
      try {
        const member = await interaction.guild!.members.fetch(row.user_id);
        name = member.displayName;
      } catch {
        name = `<@${row.user_id}>`;
      }
      return `${medal} ${name} — **${row.balance.toLocaleString("es-ES")} pesetas**`;
    })
  );

  await interaction.editReply(`${torrente("ranking_header")}\n\n${lines.join("\n")}`);
}
