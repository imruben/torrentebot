import { ChatInputCommandInteraction, Team } from "discord.js";
import { hasCookies, looksLikeCookiesFile, saveCookies, testYoutubeAccess } from "../ytdlp";

const MAX_COOKIES_BYTES = 1_000_000;

// Cookies are a logged-in Google session, so only the bot owner may replace them.
// Owner = owner of the Discord application (or any member of its team), plus OWNER_ID env (comma separated).
async function isBotOwner(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const userId = interaction.user.id;
  const extra = (process.env.OWNER_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (extra.includes(userId)) return true;

  const app = await interaction.client.application.fetch();
  const owner = app.owner;
  if (!owner) return false;
  if (owner instanceof Team) return owner.members.has(userId);
  return owner.id === userId;
}

// /cookies [archivo] — upload a cookies.txt for yt-dlp, or (no file) just test YouTube access
export async function handleCookies(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  if (!(await isBotOwner(interaction))) {
    await interaction.editReply("Esto solo lo toca el dueño del bot, pringao.");
    return;
  }

  const attachment = interaction.options.getAttachment("archivo");

  if (attachment) {
    if (attachment.size > MAX_COOKIES_BYTES) {
      await interaction.editReply("Ese archivo es demasiado gordo para ser un cookies.txt, fenómeno.");
      return;
    }

    const res = await fetch(attachment.url);
    if (!res.ok) {
      await interaction.editReply("No he podido descargar el archivo de Discord. Inténtalo otra vez.");
      return;
    }
    const content = await res.text();

    if (!looksLikeCookiesFile(content)) {
      await interaction.editReply(
        "Eso no parece un cookies.txt en formato Netscape. Expórtalo con la extensión " +
        "**Get cookies.txt LOCALLY** estando en youtube.com y súbelo tal cual."
      );
      return;
    }

    await saveCookies(content);
  }

  const test = await testYoutubeAccess();
  const cookiesState = hasCookies() ? "con cookies" : "sin cookies";
  const saved = attachment ? "✅ Cookies guardadas (también en la base de datos, sobreviven a redeploys).\n" : "";

  if (test.ok) {
    await interaction.editReply(`${saved}✅ YouTube funciona (${cookiesState}).`);
  } else {
    await interaction.editReply(
      `${saved}❌ YouTube NO deja reproducir (${cookiesState}):\n\`\`\`${test.detail}\`\`\`\n` +
      (attachment
        ? "Las cookies no valen: expórtalas otra vez desde una ventana de incógnito (ver README)."
        : "Sube un cookies.txt nuevo con `/cookies archivo:` (ver README). Mientras tanto tiro de SoundCloud.")
    );
  }
}
