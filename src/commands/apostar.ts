import { Message, Collection, TextChannel } from "discord.js";
import { getBalance, transferPesetas } from "../db";

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

// ─── !torrente apostar @user <amount> ────────────────────────────────────────
export async function handleApostar(message: Message): Promise<void> {
  if (!message.guild) return;

  const args = message.content.trim().split(/\s+/);
  // args: ["!torrente", "apostar", "@user", "500"]

  const mentioned = message.mentions.users.first();
  if (!mentioned) {
    await message.reply("Debes mencionar a alguien. Ej: `!torrente apostar @user 500`");
    return;
  }

  if (mentioned.id === message.author.id) {
    await message.reply("No puedes apostar contra ti mismo.");
    return;
  }

  if (mentioned.bot) {
    await message.reply("No puedes apostar contra un bot.");
    return;
  }

  const amountArg = args[3];
  const amount = parseInt(amountArg, 10);
  if (!amountArg || isNaN(amount) || amount <= 0) {
    await message.reply("Indica una cantidad válida. Ej: `!torrente apostar @user 500`");
    return;
  }

  const [challengerBalance, challengedBalance] = await Promise.all([
    getBalance(message.guild.id, message.author.id),
    getBalance(message.guild.id, mentioned.id),
  ]);

  if (challengerBalance < amount) {
    await message.reply(
      `No tienes suficientes pesetas. Tienes **${challengerBalance.toLocaleString("es-ES")} pesetas**.`
    );
    return;
  }

  if (challengedBalance < amount) {
    await message.reply(
      `${mentioned.displayName} no tiene suficientes pesetas (tiene **${challengedBalance.toLocaleString("es-ES")}**).`
    );
    return;
  }

  const betKey = `${message.guild.id}:${mentioned.id}`;
  if (pendingBets.has(betKey)) {
    await message.reply(`${mentioned.displayName} ya tiene una apuesta pendiente.`);
    return;
  }

  pendingBets.set(betKey, {
    challengerId: message.author.id,
    challengedId: mentioned.id,
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
    `🎲 <@${mentioned.id}>, <@${message.author.id}> te reta a apostar **${amount.toLocaleString("es-ES")} pesetas**.\n` +
      `Escribe \`!torrente acepto\` en los próximos 60 segundos para aceptar.`
  );
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

  // 50/50 coin flip
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
}
