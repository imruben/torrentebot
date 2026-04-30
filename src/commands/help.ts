import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

export async function handleAyuda(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("🤖 Comandos de Torrente Bot")
    .setColor(0xf5a623)
    .addFields(
      {
        name: "💰 Pesetas",
        value: [
          "`/pesetas` — Muestra tu saldo",
          "`/ranking` — Top 10 del servidor",
          "`/apostar [rival] [cantidad]` — Reta a alguien (menú interactivo si no pones parámetros)",
        ].join("\n"),
      },
      {
        name: "🎵 Música",
        value: [
          "`/pon <canción o URL>` — Busca en YouTube y pone/encola",
          "`/cola` — Muestra la cola actual",
          "`/skip` — Salta la canción actual",
          "`/pausa` — Pausa la reproducción",
          "`/sigue` — Reanuda la reproducción",
          "`/stop` — Para todo y desconecta el bot",
        ].join("\n"),
      },
      {
        name: "🎙️ Voz",
        value: [
          "`/saluda` — El bot entra al canal, saluda y se va",
        ].join("\n"),
      }
    )
    .setFooter({ text: "Ganas 100 pesetas por minuto en el canal de voz (con 2+ personas). Bonus de 100.000 pesetas cada hora." });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
