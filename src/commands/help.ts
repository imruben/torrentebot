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
import { handlePon, handleCola, handleSkip, handleStop, handlePausa, handleSigue } from "./music";

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
  {
    value: "pon",
    label: "!torrente pon <canción o URL>",
    description: "Pon una canción o añádela a la cola",
    emoji: "🎵",
  },
  {
    value: "cola",
    label: "!torrente cola",
    description: "Muestra la cola de música",
    emoji: "📋",
  },
  {
    value: "skip",
    label: "!torrente skip",
    description: "Salta la canción actual",
    emoji: "⏭️",
  },
  {
    value: "stop",
    label: "!torrente stop",
    description: "Para la música y el bot sale del canal",
    emoji: "⏹️",
  },
  {
    value: "pausa",
    label: "!torrente pausa",
    description: "Pausa la reproducción",
    emoji: "⏸️",
  },
  {
    value: "sigue",
    label: "!torrente sigue",
    description: "Reanuda la reproducción",
    emoji: "▶️",
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
    } else if (selected === "pon") {
      await handlePon(message, "");
    } else if (selected === "cola") {
      await handleCola(message);
    } else if (selected === "skip") {
      await handleSkip(message);
    } else if (selected === "stop") {
      await handleStop(message);
    } else if (selected === "pausa") {
      await handlePausa(message);
    } else if (selected === "sigue") {
      await handleSigue(message);
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
