import {
  ChatInputCommandInteraction,
  Collection,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ButtonInteraction,
  TextChannel,
} from "discord.js";
import { getBalance, transferPesetas } from "../db";
import { updateFaryRole } from "../roles/fary";
import { SILENT } from "../utils";

// ─── Pending bets store ───────────────────────────────────────────────────────
interface PendingBet {
  challengerId: string;
  challengedId: string;
  guildId: string;
  amount: number;
  expiresAt: number;
  channelId: string;
}

const pendingBets = new Collection<string, PendingBet>();
const BET_TIMEOUT_MS = 60_000;
const PRESET_AMOUNTS = [100, 500, 1000, 5000];

// ─── Internal: resolve a bet ──────────────────────────────────────────────────
async function resolveBet(
  bet: PendingBet,
  sendResult: (content: string) => Promise<unknown>
): Promise<void> {
  const challengerWins = Math.random() < 0.5;
  const winnerId = challengerWins ? bet.challengerId : bet.challengedId;
  const loserId = challengerWins ? bet.challengedId : bet.challengerId;

  const { fromBalance: loserNewBalance, toBalance: winnerNewBalance } = await transferPesetas(
    bet.guildId,
    loserId,
    winnerId,
    bet.amount
  );

  await sendResult(
    `🎲 **¡Resultado de la apuesta!**\n\n` +
      `🏆 <@${winnerId}> gana **${bet.amount.toLocaleString("es-ES")} pesetas** → ahora tiene **${winnerNewBalance.toLocaleString("es-ES")}**\n` +
      `💸 <@${loserId}> pierde **${bet.amount.toLocaleString("es-ES")} pesetas** → ahora tiene **${loserNewBalance.toLocaleString("es-ES")}**`
  );

  await updateFaryRole(bet.guildId).catch((err) =>
    console.error("[FaryRole] Error updating after bet:", err)
  );
}

// ─── Internal: post the challenge message with Accept button ──────────────────
async function postBetChallenge(
  interaction: ChatInputCommandInteraction,
  challengedId: string,
  amount: number
): Promise<void> {
  const guild = interaction.guild!;

  const [challengerBalance, challengedBalance] = await Promise.all([
    getBalance(guild.id, interaction.user.id),
    getBalance(guild.id, challengedId),
  ]);

  if (challengerBalance < amount) {
    await interaction.editReply(
      `No tienes suficientes pesetas. Tienes **${challengerBalance.toLocaleString("es-ES")} pesetas**.`
    );
    return;
  }

  if (challengedBalance < amount) {
    const challenged = await guild.members.fetch(challengedId).catch(() => null);
    const name = challenged?.displayName ?? `<@${challengedId}>`;
    await interaction.editReply(
      `${name} no tiene suficientes pesetas (tiene **${challengedBalance.toLocaleString("es-ES")}**).`
    );
    return;
  }

  const betKey = `${guild.id}:${challengedId}`;
  if (pendingBets.has(betKey)) {
    await interaction.editReply(`<@${challengedId}> ya tiene una apuesta pendiente.`);
    return;
  }

  const bet: PendingBet = {
    challengerId: interaction.user.id,
    challengedId,
    guildId: guild.id,
    amount,
    expiresAt: Date.now() + BET_TIMEOUT_MS,
    channelId: interaction.channelId,
  };

  pendingBets.set(betKey, bet);

  const acceptButton = new ButtonBuilder()
    .setCustomId(`bet_accept:${betKey}`)
    .setLabel("✅ Aceptar apuesta")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptButton);

  const challengeMsg = await interaction.editReply({
    content:
      `🎲 <@${challengedId}>, **<@${interaction.user.id}> te reta a apostar ${amount.toLocaleString("es-ES")} pesetas**.\n` +
      `Tienes **60 segundos** para aceptar.`,
    components: [row],
  });

  const collector = challengeMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: BET_TIMEOUT_MS,
    filter: (i) => i.user.id === challengedId,
    max: 1,
  });

  collector.on("collect", async (btnInteraction: ButtonInteraction) => {
    const currentBet = pendingBets.get(betKey);
    if (!currentBet) {
      await btnInteraction.update({ content: "❌ Esta apuesta ya no está disponible.", components: [] });
      return;
    }

    pendingBets.delete(betKey);

    await btnInteraction.update({
      content: `🎲 **<@${currentBet.challengerId}> vs <@${currentBet.challengedId}>** — ¡Decidiendo...!`,
      components: [],
    });

    await resolveBet(currentBet, (content) => {
      const channel = btnInteraction.channel;
      if (channel instanceof TextChannel) return channel.send({ content, ...SILENT });
      return Promise.resolve();
    });
  });

  collector.on("end", (collected) => {
    if (pendingBets.get(betKey) && collected.size === 0) {
      pendingBets.delete(betKey);
      const disabledButton = new ButtonBuilder()
        .setCustomId(`bet_accept:${betKey}`)
        .setLabel("⏰ Expirada")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

      challengeMsg
        .edit({
          content: `⏰ La apuesta de **${amount.toLocaleString("es-ES")} pesetas** entre <@${interaction.user.id}> y <@${challengedId}> ha expirado.`,
          components: [new ActionRowBuilder<ButtonBuilder>().addComponents(disabledButton)],
        })
        .catch(() => {});
    }
  });
}

// ─── /apostar ─────────────────────────────────────────────────────────────────
export async function handleApostar(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return;

  await interaction.deferReply({ ...SILENT });

  const rival = interaction.options.getUser("rival");
  const cantidad = interaction.options.getInteger("cantidad");

  if (rival && cantidad) {
    if (rival.id === interaction.user.id) {
      await interaction.editReply("No puedes apostar contra ti mismo.");
      return;
    }
    if (rival.bot) {
      await interaction.editReply("No puedes apostar contra un bot.");
      return;
    }
    await postBetChallenge(interaction, rival.id, cantidad);
    return;
  }

  // Interactive flow
  const userSelect = new UserSelectMenuBuilder()
    .setCustomId("apostar_user")
    .setPlaceholder("Elige a tu rival...");

  const reply = await interaction.editReply({
    content: "🎲 **Apostar** — Elige a quién quieres retar:",
    components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect)],
  });

  const userCollector = reply.createMessageComponentCollector({
    componentType: ComponentType.UserSelect,
    time: 60_000,
    filter: (i) => i.user.id === interaction.user.id,
    max: 1,
  });

  userCollector.on("collect", async (userInteraction) => {
    const targetUser = userInteraction.users.first();
    if (!targetUser) return;

    if (targetUser.id === interaction.user.id) {
      await userInteraction.update({ content: "❌ No puedes apostar contra ti mismo.", components: [] });
      return;
    }
    if (targetUser.bot) {
      await userInteraction.update({ content: "❌ No puedes apostar contra un bot.", components: [] });
      return;
    }

    const challengerBalance = await getBalance(interaction.guild!.id, interaction.user.id);

    const amountSelect = new StringSelectMenuBuilder()
      .setCustomId("apostar_amount")
      .setPlaceholder("Elige la cantidad...")
      .addOptions([
        ...PRESET_AMOUNTS.map((a) => ({
          value: String(a),
          label: `${a.toLocaleString("es-ES")} pesetas`,
          emoji: "💰",
        })),
        {
          value: "allin",
          label: "All-in 🎰",
          description: `Todo tu saldo (${challengerBalance.toLocaleString("es-ES")} pesetas)`,
          emoji: "🎰",
        },
        {
          value: "custom",
          label: "Cantidad personalizada",
          description: "Escribe la cantidad tú mismo",
          emoji: "✏️",
        },
      ]);

    await userInteraction.update({
      content: `🎲 **Apostar contra ${targetUser.displayName}** — Elige la cantidad:`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(amountSelect)],
    });

    const amountCollector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60_000,
      filter: (i) => i.user.id === interaction.user.id,
      max: 1,
    });

    amountCollector.on("collect", async (amountInteraction) => {
      const selected = amountInteraction.values[0];

      if (selected === "custom") {
        await amountInteraction.update({
          content: `🎲 **Apostar contra ${targetUser.displayName}** — Escribe la cantidad en el chat:`,
          components: [],
        });

        const channel = interaction.channel;
        if (!(channel instanceof TextChannel)) return;

        const msgCollector = channel.createMessageCollector({
          filter: (m) => m.author.id === interaction.user.id,
          time: 30_000,
          max: 1,
        });

        msgCollector.on("collect", async (amountMsg) => {
          const amount = parseInt(amountMsg.content.trim(), 10);
          await amountMsg.delete().catch(() => {});
          await reply.delete().catch(() => {});

          if (isNaN(amount) || amount <= 0) {
            await interaction.followUp({ content: "❌ Cantidad no válida. Apuesta cancelada.", ephemeral: true });
            return;
          }

          await postBetChallenge(interaction, targetUser.id, amount);
        });

        msgCollector.on("end", (collected) => {
          if (collected.size === 0) {
            reply.edit({ content: "⏰ Tiempo agotado. Apuesta cancelada.", components: [] }).catch(() => {});
          }
        });

        return;
      }

      const amount = selected === "allin" ? challengerBalance : parseInt(selected, 10);
      await amountInteraction.update({ content: "⏳", components: [] });
      await reply.delete().catch(() => {});
      await postBetChallenge(interaction, targetUser.id, amount);
    });

    amountCollector.on("end", (collected) => {
      if (collected.size === 0) {
        reply.edit({ content: "⏰ Tiempo agotado. Apuesta cancelada.", components: [] }).catch(() => {});
      }
    });
  });

  userCollector.on("end", (collected) => {
    if (collected.size === 0) {
      reply.edit({ content: "⏰ Tiempo agotado. Apuesta cancelada.", components: [] }).catch(() => {});
    }
  });
}
