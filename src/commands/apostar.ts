import {
  Message,
  Collection,
  TextChannel,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  ComponentType,
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

// ─── Internal: validate and post the bet challenge ────────────────────────────
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

  pendingBets.set(betKey, {
    challengerId: message.author.id,
    challengedId,
    guildId: message.guild.id,
    amount,
    expiresAt: Date.now() + BET_TIMEOUT_MS,
  });

  // Auto-expire after 60s
  setTimeout(() => {
    const bet = pendingBets.get(betKey);
    if (bet) {
      pendingBets.delete(betKey);
      if (message.channel instanceof TextChannel) {
        message.channel
          .send(
            `⏰ La apuesta de **${bet.amount.toLocaleString("es-ES")} pesetas** entre <@${bet.challengerId}> y <@${bet.challengedId}> ha expirado.`
          )
          .catch(() => {});
      }
    }
  }, BET_TIMEOUT_MS);

  await message.reply(
    `🎲 <@${challengedId}>, <@${message.author.id}> te reta a apostar **${amount.toLocaleString("es-ES")} pesetas**.\n` +
      `Escribe \`!torrente acepto\` en los próximos 60 segundos para aceptar.`
  );
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
        // Ask the user to type a number in chat
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

      // Preset or all-in
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
// Direct path: !torrente apostar @user <amount>
// Interactive: !torrente apostar (no args)
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

// ─── !torrente acepto ─────────────────────────────────────────────────────────
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

  const challengerWins = Math.random() < 0.5;
  const winnerId = challengerWins ? bet.challengerId : bet.challengedId;
  const loserId = challengerWins ? bet.challengedId : bet.challengerId;

  const { fromBalance, toBalance } = await transferPesetas(
    bet.guildId,
    loserId,
    winnerId,
    bet.amount
  );

  const winnerNewBalance = winnerId === bet.challengerId ? toBalance : fromBalance;
  const loserNewBalance = loserId === bet.challengerId ? fromBalance : toBalance;

  await message.reply(
    `🎲 **¡Resultado de la apuesta!**\n\n` +
      `🏆 <@${winnerId}> gana **${bet.amount.toLocaleString("es-ES")} pesetas** → ahora tiene **${winnerNewBalance.toLocaleString("es-ES")}**\n` +
      `💸 <@${loserId}> pierde **${bet.amount.toLocaleString("es-ES")} pesetas** → ahora tiene **${loserNewBalance.toLocaleString("es-ES")}**`
  );

  await updateFaryRole(bet.guildId).catch((err) =>
    console.error("[FaryRole] Error updating after bet:", err)
  );
}
