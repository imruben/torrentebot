import {
  Message,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ComponentType,
} from "discord.js";

const COMMANDS = [
  {
    value: "saluda",
    label: "!torrente saluda",
    description: "El bot entra al canal de voz, saluda y se va",
    emoji: "🎙️",
  },
  {
    value: "pesetas",
    label: "!torrente pesetas",
    description: "Muestra tu saldo actual de pesetas",
    emoji: "💰",
  },
  {
    value: "ranking",
    label: "!torrente ranking",
    description: "Top 10 de pesetas del servidor",
    emoji: "🏆",
  },
  {
    value: "apostar",
    label: "!torrente apostar @user <cantidad>",
    description: "Reta a alguien a una apuesta",
    emoji: "🎲",
  },
  {
    value: "acepto",
    label: "!torrente acepto",
    description: "Acepta una apuesta pendiente",
    emoji: "✅",
  },
];

export async function handleHelp(message: Message): Promise<void> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("help_menu")
    .setPlaceholder("Elige un comando para ver cómo usarlo…")
    .addOptions(
      COMMANDS.map((cmd) => ({
        value: cmd.value,
        label: cmd.label,
        description: cmd.description,
        emoji: cmd.emoji,
      }))
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  const reply = await message.reply({
    content: "**Comandos disponibles de TorrenteBot** — elige uno para ver más detalles:",
    components: [row],
  });

  // Listen for the interaction for 60 seconds, only from the user who triggered it
  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 60_000,
    filter: (i) => i.user.id === message.author.id,
  });

  collector.on("collect", async (interaction: StringSelectMenuInteraction) => {
    const selected = COMMANDS.find((cmd) => cmd.value === interaction.values[0]);
    if (!selected) return;

    const details: Record<string, string> = {
      saluda: [
        "**🎙️ !torrente saluda**",
        "El bot se une a tu canal de voz, reproduce el saludo y se va.",
        "",
        "**Uso:** `!torrente saluda`",
        "**Requisito:** Tienes que estar en un canal de voz.",
      ].join("\n"),

      pesetas: [
        "**💰 !torrente pesetas**",
        "Muestra tu saldo actual de pesetas.",
        "",
        "**Uso:** `!torrente pesetas`",
        "**Cómo ganar:** Estar en un canal de voz con al menos otra persona. Ganas **100 pesetas por minuto**.",
        "**Saldo inicial:** 1000 pesetas.",
      ].join("\n"),

      ranking: [
        "**🏆 !torrente ranking**",
        "Muestra el top 10 de usuarios con más pesetas en el servidor.",
        "",
        "**Uso:** `!torrente ranking`",
      ].join("\n"),

      apostar: [
        "**🎲 !torrente apostar**",
        "Reta a otro usuario a una apuesta. Si acepta, se decide al 50/50.",
        "",
        "**Uso:** `!torrente apostar @usuario <cantidad>`",
        "**Ejemplo:** `!torrente apostar @Pepe 500`",
        "**Reglas:**",
        "• Ambos deben tener suficientes pesetas.",
        "• Sin mínimo ni máximo — puedes apostar todo.",
        "• El retado tiene **60 segundos** para aceptar con `!torrente acepto`.",
        "• El ganador se lleva las pesetas del perdedor.",
      ].join("\n"),

      acepto: [
        "**✅ !torrente acepto**",
        "Acepta una apuesta que otro usuario te ha lanzado.",
        "",
        "**Uso:** `!torrente acepto`",
        "**Requisito:** Alguien te tiene que haber retado con `!torrente apostar`.",
        "**Tiempo límite:** 60 segundos desde el reto.",
      ].join("\n"),
    };

    await interaction.reply({
      content: details[selected.value] ?? "Comando no encontrado.",
      ephemeral: true,
    });
  });

  collector.on("end", async () => {
    // Disable the menu after timeout
    const disabledMenu = new StringSelectMenuBuilder()
      .setCustomId("help_menu")
      .setPlaceholder("Menú expirado.")
      .setDisabled(true)
      .addOptions(COMMANDS.map((cmd) => ({ value: cmd.value, label: cmd.label })));

    const disabledRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(disabledMenu);

    await reply.edit({ components: [disabledRow] }).catch(() => {});
  });
}
