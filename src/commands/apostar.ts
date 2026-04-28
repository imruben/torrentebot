import {
  Message,
  Collection,
  TextChannel,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ButtonInteraction,
} from "discord.js";
import { getBalance, transferPesetas } from "../db";
import { updateFaryRole } from "../roles/fary";

// ─── Pending bets store ───────────────────────────────────────────────────────
// Key: `${guildId}:${challengedUserId}`
interface PendingBet {
  challengerId: string;
  challengedId: string;
  guildId: string;
  amount: number;
  expiresAt: number;
}

const pendingBets = new Collection<string, PendingBet>();
const BET_TIMEOUT_MS = 60_000;

const PRESET_AMOUNTS = [100, 500, 1000, 5000];

// ─── Internal: resolve a bet (coin flip + transfer + announce result) ─────────
async function resolveBet(
  bet: PendingBet,
  replyTarget: { reply: (content: string) => Promise<unknown> }
): Promise<void> {
  const challengerWins = Math.random() < 0.5;
  const winnerId = challengerWins ? bet.challengerId : bet.challengedId;
  const loserId = challengerWins ? bet.challengedId : bet.challengerId;

  // transferPesetas(loserId, winnerId) → fromBalance = loser's new balance, toBalance = winner's new balance
  const { fromBalance: loserNewBalance, toBalance: winnerNewBalance } = await transferPesetas(
    bet.guildId,
    loserId,
    winnerId,
    bet.amount
  );

  await replyTarget.reply(
    `🎲 **¡Resultado de la apuesta!**\n\n` +
      `🏆 <@${winnerId}> gana **${bet.amount.toLocaleString("es-ES")} pesetas** → ahora tiene **${winnerNewBalance.toLocaleString("es-ES")}**\n` +
      `💸 <@${loserId}> pierde **${bet.amount.toLocaleString("es-ES")} pesetas** → ahora tiene **${loserNewBalance.toLocaleString("es-ES")}**`
  );

  await updateFaryRole(bet.guildId).catch((err) =>
    console.error("[FaryRole] Error updating after bet:", err)
  );
}

// ─── Internal: validate and post the bet challenge with an Accept button ──────
async function postBetChallenge(
  message: Message,
  challengedId: string,
  amount: number
): Promise<void> {
  if (!message.guild) return;

  const [challengerBalance, challengedBalance] = await Promise.all([
    getBalance(message.guild.id, message.author.id),
    getBalance(message.guild.id, challengedId),
  ]);

  if (challengerBalance < amount) {
    await message.reply(
      `No tienes suficientes pesetas. Tienes **${challengerBalance.toLocaleString("es-ES")} pesetas**.`
    );
    return;
  }

  if (challengedBalance < amount) {
    const challenged = await message.guild.members.fetch(challengedId).catch(() => null);
    const name = challenged?.displayName ?? `<@${challengedId}>`;
    await message.reply(
      `${name} no tiene suficientes pesetas (tiene **${challengedBalance.toLocaleString("es-ES")}**).`
    );
    return;
  }

  const betKey = `${message.guild.id}:${challengedId}`;
  if (pendingBets.has(betKey)) {
    await message.reply(`<@${challengedId}> ya tiene una apuesta pendiente.`);
    return;
  }

  const bet: PendingBet = {
    challengerId: message.author.id,
    challengedId,
    guildId: message.guild.id,
    amount,
    expiresAt: Date.now() + BET_TIMEOUT_MS,
  };

  pendingBets.set(betKey, bet);

  // ── Build the challenge message with an Accept button ──────────────────────
  const acceptButton = new ButtonBuilder()
    .setCustomId(`bet_accept:${betKey}`)
    .setLabel("✅ Aceptar apuesta")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptButton);

  const challengeMsg = await message.reply({
    content:
      `🎲 <@${challengedId}>, **<@${message.author.id}> te reta a apostar ${amount.toLocaleString("es-ES")} pesetas**.\n` +
      `Tienes **60 segundos** para aceptar.`,
    components: [row],
  });

  // ── Button collector — only the challenged user can click ──────────────────
  const collector = challengeMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: BET_TIMEOUT_MS,
    filter: (i) => i.user.id === challengedId,
    max: 1,
  });

  collector.on("collect", async (interaction: ButtonInteraction) => {
    const currentBet = pendingBets.get(betKey);
    if (!currentBet) {
      await interaction.update({ content: "❌ Esta apuesta ya no está disponible.", components: [] });
      return;
    }

    pendingBets.delete(betKey);

    // Disable the button while resolving
    await interaction.update({
      content: `🎲 **<@${currentBet.challengerId}> vs <@${currentBet.challengedId}>** — ¡Decidiendo...!`,
      components: [],
    });

    await resolveBet(currentBet, {
      reply: (content) => {
        if (message.channel instanceof TextChannel) {
          return message.channel.send(content);
        }
        return Promise.resolve();
      },
    });
  });

  collector.on("end", (collected) => {
    const stillPending = pendingBets.get(betKey);
    if (stillPending && collected.size === 0) {
      // Timed out without being accepted
      pendingBets.delete(betKey);
      const disabledButton = new ButtonBuilder()
        .setCustomId(`bet_accept:${betKey}`)
        .setLabel("⏰ Expirada")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(disabledButton);

      challengeMsg
        .edit({
          content: `⏰ La apuesta de **${amount.toLocaleString("es-ES")} pesetas** entre <@${message.author.id}> y <@${challengedId}> ha expirado.`,
          components: [disabledRow],
        })
        .catch(() => {});
    }
  });
}

// ─── Interactive flow ─────────────────────────────────────────────────────────
async function handleApostarInteractive(message: Message): Promise<void> {
  if (!message.guild) return;

  // ── Step 1: pick opponent ──────────────────────────────────────────────────
  const userSelect = new UserSelectMenuBuilder()
    .setCustomId("apostar_user")
    .setPlaceholder("Elige a tu rival...");

  const row1 = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect);

  const reply = await message.reply({
    content: "🎲 **Apostar** — Elige a quién quieres retar:",
    components: [row1],
  });

  const userCollector = reply.createMessageComponentCollector({
    componentType: ComponentType.UserSelect,
    time: 60_000,
    filter: (i) => i.user.id === message.author.id,
    max: 1,
  });

  userCollector.on("collect", async (userInteraction) => {
    const targetUser = userInteraction.users.first();
    if (!targetUser) return;

    if (targetUser.id === message.author.id) {
      await userInteraction.update({ content: "❌ No puedes apostar contra ti mismo.", components: [] });
      return;
    }
    if (targetUser.bot) {
      await userInteraction.update({ content: "❌ No puedes apostar contra un bot.", components: [] });
      return;
    }

    // ── Step 2: pick amount ────────────────────────────────────────────────
    const challengerBalance = await getBalance(message.guild!.id, message.author.id);

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

    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(amountSelect);

    await userInteraction.update({
      content: `🎲 **Apostar contra ${targetUser.displayName}** — Elige la cantidad:`,
      components: [row2],
    });

    const amountCollector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60_000,
      filter: (i) => i.user.id === message.author.id,
      max: 1,
    });

    amountCollector.on("collect", async (amountInteraction) => {
      const selected = amountInteraction.values[0];

      if (selected === "custom") {
        await amountInteraction.update({
          content: `🎲 **Apostar contra ${targetUser.displayName}** — Escribe la cantidad en el chat:`,
          components: [],
        });

        if (!(message.channel instanceof TextChannel)) return;

        const msgCollector = message.channel.createMessageCollector({
          filter: (m) => m.author.id === message.author.id,
          time: 30_000,
          max: 1,
        });

        msgCollector.on("collect", async (amountMsg) => {
          const amount = parseInt(amountMsg.content.trim(), 10);
          await amountMsg.delete().catch(() => {});
          await reply.delete().catch(() => {});

          if (isNaN(amount) || amount <= 0) {
            await message.reply("❌ Cantidad no válida. Apuesta cancelada.");
            return;
          }

          await postBetChallenge(message, targetUser.id, amount);
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
      await postBetChallenge(message, targetUser.id, amount);
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

// ─── !torrente apostar ────────────────────────────────────────────────────────
export async function handleApostar(message: Message): Promise<void> {
  if (!message.guild) return;

  const mentioned = message.mentions.users.first();
  const args = message.content.trim().split(/\s+/);
  const amountArg = args[3];

  if (mentioned && amountArg) {
    const amount = parseInt(amountArg, 10);
    if (mentioned.id === message.author.id) {
      await message.reply("No puedes apostar contra ti mismo.");
      return;
    }
    if (mentioned.bot) {
      await message.reply("No puedes apostar contra un bot.");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      await message.reply("Indica una cantidad válida. Ej: `!torrente apostar @user 500`");
      return;
    }
    await postBetChallenge(message, mentioned.id, amount);
    return;
  }

  await handleApostarInteractive(message);
}

// ─── !torrente acepto — text fallback ────────────────────────────────────────
export async function handleAcepto(message: Message): Promise<void> {
  if (!message.guild) return;

  const betKey = `${message.guild.id}:${message.author.id}`;
  const bet = pendingBets.get(betKey);

  if (!bet) {
    await message.reply("No tienes ninguna apuesta pendiente.");
    return;
  }

  if (Date.now() > bet.expiresAt) {
    pendingBets.delete(betKey);
    await message.reply("La apuesta ha expirado.");
    return;
  }

  pendingBets.delete(betKey);

  await resolveBet(bet, message);
}
