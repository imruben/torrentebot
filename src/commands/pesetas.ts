import { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { getBalance } from "../db";

export async function handlePesetas(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return;

  const member = interaction.member as GuildMember;
  const balance = await getBalance(interaction.guild.id, interaction.user.id);

  await interaction.reply(
    `💰 **${member.displayName}** tiene **${balance.toLocaleString("es-ES")} pesetas**.`
  );
}
