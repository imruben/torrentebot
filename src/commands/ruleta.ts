import {
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { SILENT } from "../utils";
import { torrente } from "../torrente";
import { getBalance, addPesetas } from "../db";

// ─── GIF URLs (placeholders — replace with your own) ─────────────────────────
const GIF_SPINNING = "https://media1.tenor.com/m/KBqDWHqGlhIAAAAd/roulette-casino.gif";
const GIF_WIN      = "https://media1.tenor.com/m/Do3RI9mHBcUAAAAd/casino-win.gif";
const GIF_LOSE     = "https://media1.tenor.com/m/TUzqV3oiXVkAAAAd/casino-lose.gif";

// ─── Roulette constants ───────────────────────────────────────────────────────
const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

type BetType = "color_rojo" | "color_negro" | "par" | "impar" | "mitad_baja" | "mitad_alta" | "docena_1" | "docena_2" | "docena_3" | "numero";

interface BetTypeConfig {
  label: string;
  description: string;
  multiplier: number;
}

const BET_TYPES: Record<BetType, BetTypeConfig> = {
  color_rojo:  { label: "🔴 Rojo",      description: "Números rojos · paga 2x",       multiplier: 2 },
  color_negro: { label: "⚫ Negro",      description: "Números negros · paga 2x",      multiplier: 2 },
  par:         { label: "2️⃣ Par",        description: "Número par (no 0) · paga 2x",  multiplier: 2 },
  impar:       { label: "1️⃣ Impar",      description: "Número impar · paga 2x",       multiplier: 2 },
  mitad_baja:  { label: "⬇️ Bajos 1-18", description: "Del 1 al 18 · paga 2x",        multiplier: 2 },
  mitad_alta:  { label: "⬆️ Altos 19-36",description: "Del 19 al 36 · paga 2x",       multiplier: 2 },
  docena_1:    { label: "1️⃣ 1ª docena",  description: "Del 1 al 12 · paga 3x",        multiplier: 3 },
  docena_2:    { label: "2️⃣ 2ª docena",  description: "Del 13 al 24 · paga 3x",       multiplier: 3 },
  docena_3:    { label: "3️⃣ 3ª docena",  description: "Del 25 al 36 · paga 3x",       multiplier: 3 },
  numero:      { label: "🎯 Número exacto", description: "Un número del 0 al 36 · paga 36x", multiplier: 36 },
};

// ─── Pending bets (userId → { amount, guildId }) ──────────────────────────────
// Cleared once the spin resolves or the menu expires
interface PendingBet {
  amount: number;
  guildId: string;
  userId: string;
}
const pendingBets = new Map<string, PendingBet>();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function zoneLabel(n: number): string {
  if (n === 0) return "verde 0";
  const color = RED_NUMBERS.has(n) ? "rojo" : "negro";
  const parity = n % 2 === 0 ? "par" : "impar";
  const range = n <= 18 ? "bajo" : "alto";
  const docena = n <= 12 ? "1ª docena" : n <= 24 ? "2ª docena" : "3ª docena";
  return `${color}, ${parity}, ${range}, ${docena}`;
}

function checkWin(betType: BetType, betValue: number | null, result: number): boolean {
  if (result === 0) {
    // Zero only wins on exact number bet
    return betType === "numero" && betValue === 0;
  }
  switch (betType) {
    case "color_rojo":  return RED_NUMBERS.has(result);
    case "color_negro": return !RED_NUMBERS.has(result);
    case "par":         return result % 2 === 0;
    case "impar":       return result % 2 !== 0;
    case "mitad_baja":  return result >= 1 && result <= 18;
    case "mitad_alta":  return result >= 19 && result <= 36;
    case "docena_1":    return result >= 1 && result <= 12;
    case "docena_2":    return result >= 13 && result <= 24;
    case "docena_3":    return result >= 25 && result <= 36;
    case "numero":      return betValue === result;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Spin logic (shared by select and modal) ──────────────────────────────────
async function executeSpin(
  interaction: StringSelectMenuInteraction | ModalSubmitInteraction,
  bet: PendingBet,
  betType: BetType,
  betValue: number | null // only used for "numero"
): Promise<void> {
  const { amount, guildId, userId } = bet;
  const cfg = BET_TYPES[betType];

  // Deduct the bet immediately
  await addPesetas(guildId, userId, -amount);

  // Show spinning GIF
  await interaction.editReply({
    content: `${torrente("roulette_spinning")}\n${GIF_SPINNING}`,
  });

  // Suspense delay
  await sleep(4000);

  // Spin the wheel
  const result = Math.floor(Math.random() * 37); // 0–36
  const zone = zoneLabel(result);
  const won = checkWin(betType, betValue, result);

  if (won) {
    const profit = amount * cfg.multiplier;
    await addPesetas(guildId, userId, profit);
    const newBalance = await getBalance(guildId, userId);
    await interaction.editReply({
      content:
        torrente("roulette_win", {
          number: String(result),
          zone,
          profit: profit.toLocaleString("es-ES"),
        }) +
        `\n*Saldo: ${newBalance.toLocaleString("es-ES")} pesetas*\n${GIF_WIN}`,
    });
  } else {
    const newBalance = await getBalance(guildId, userId);
    await interaction.editReply({
      content:
        torrente("roulette_lose", {
          number: String(result),
          zone,
          amount: amount.toLocaleString("es-ES"),
        }) +
        `\n*Saldo: ${newBalance.toLocaleString("es-ES")} pesetas*\n${GIF_LOSE}`,
    });
  }

  pendingBets.delete(userId);
}

// ─── Command handler ──────────────────────────────────────────────────────────
export async function handleRuleta(interaction: ChatInputCommandInteraction): Promise<void> {
  const amount = interaction.options.getInteger("cantidad", true);
  const guildId = interaction.guild!.id;
  const userId = interaction.user.id;

  const balance = await getBalance(guildId, userId);

  if (balance < amount) {
    await interaction.reply({
      content: torrente("roulette_no_funds", {
        amount: amount.toLocaleString("es-ES"),
        balance: balance.toLocaleString("es-ES"),
      }),
      ephemeral: true,
    });
    return;
  }

  // Store pending bet state
  pendingBets.set(userId, { amount, guildId, userId });

  // Build bet type select menu
  const options = (Object.entries(BET_TYPES) as [BetType, BetTypeConfig][]).map(
    ([value, cfg]) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(cfg.label)
        .setDescription(cfg.description)
        .setValue(value)
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ruleta_tipo")
    .setPlaceholder("¿A qué apostamos, fenómeno?")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

  await interaction.reply({
    content: torrente("roulette_pick", { amount: amount.toLocaleString("es-ES") }),
    components: [row],
    ...SILENT,
  });

  // Auto-expire after 60s — clear pending bet and disable menu
  setTimeout(async () => {
    if (pendingBets.has(userId)) {
      pendingBets.delete(userId);
      await interaction.editReply({ components: [] }).catch(() => {});
    }
  }, 60_000);
}

// ─── Select menu handler ──────────────────────────────────────────────────────
export async function handleRuletaSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const userId = interaction.user.id;
  const bet = pendingBets.get(userId);

  if (!bet) {
    await interaction.reply({ content: "Esta apuesta ya ha expirado, desgraciado. Vuelve a empezar.", ephemeral: true });
    return;
  }

  const betType = interaction.values[0] as BetType;

  if (betType === "numero") {
    // Show modal to enter a number
    const modal = new ModalBuilder()
      .setCustomId("ruleta_numero_modal")
      .setTitle("¿A qué número, fenómeno?");

    const input = new TextInputBuilder()
      .setCustomId("ruleta_numero_input")
      .setLabel("Número (0–36)")
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(2)
      .setPlaceholder("Escribe un número del 0 al 36")
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  // For all other bet types, go straight to spinning
  await interaction.deferUpdate();
  await executeSpin(interaction, bet, betType, null);
}

// ─── Modal handler ────────────────────────────────────────────────────────────
export async function handleRuletaModal(interaction: ModalSubmitInteraction): Promise<void> {
  const userId = interaction.user.id;
  const bet = pendingBets.get(userId);

  if (!bet) {
    await interaction.reply({ content: "Esta apuesta ya ha expirado, desgraciado. Vuelve a empezar.", ephemeral: true });
    return;
  }

  const raw = interaction.fields.getTextInputValue("ruleta_numero_input").trim();
  const num = parseInt(raw, 10);

  if (isNaN(num) || num < 0 || num > 36) {
    await interaction.reply({ content: torrente("roulette_invalid_number"), ephemeral: true });
    pendingBets.delete(userId);
    return;
  }

  await interaction.deferUpdate();
  await executeSpin(interaction, bet, "numero", num);
}
