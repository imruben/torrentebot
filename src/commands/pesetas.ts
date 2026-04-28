import { Message } from "discord.js";
import { getBalance } from "../db";

export async function handlePesetas(message: Message): Promise<void> {
  if (!message.guild) return;

  const balance = await getBalance(message.guild.id, message.author.id);
  await message.reply(
    `💰 **${message.author.displayName}** tiene **${balance.toLocaleString("es-ES")} pesetas**.`
  );
}
