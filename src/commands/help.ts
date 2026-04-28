import {
  Message,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ComponentType,
} from "discord.js";
import { handleSaluda } from "./saluda";
import { handlePesetas } from "./pesetas";
import { handleRanking } from "./ranking";
import { handleAcepto, handleApostar } from "./apostar";

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
    .setPlaceholder("¿Qué quieres hacer?")
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
    content: "Elige un comando:",
    components: [row],
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 60_000,
    filter: (i) => i.user.id === message.author.id,
    max: 1,
  });

  collector.on("collect", async (interaction: StringSelectMenuInteraction) => {
    // Acknowledge the interaction silently so Discord doesn't show "interaction failed"
    await interaction.deferUpdate();

    // Delete the menu
    await reply.delete().catch(() => {});

    const selected = interaction.values[0];

    if (selected === "saluda") {
      await handleSaluda(message);
    } else if (selected === "pesetas") {
      await handlePesetas(message);
    } else if (selected === "ranking") {
      await handleRanking(message);
    } else if (selected === "acepto") {
      await handleAcepto(message);
    } else if (selected === "apostar") {
      await handleApostar(message);
    }
  });

  collector.on("end", (collected) => {
    // If nobody selected anything, disable the menu
    if (collected.size === 0) {
      const disabledMenu = new StringSelectMenuBuilder()
        .setCustomId("help_menu")
        .setPlaceholder("Menú expirado.")
        .setDisabled(true)
        .addOptions(COMMANDS.map((cmd) => ({ value: cmd.value, label: cmd.label })));

      const disabledRow =
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(disabledMenu);

      reply.edit({ content: "Elige un comando:", components: [disabledRow] }).catch(() => {});
    }
  });
}
