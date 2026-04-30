import {
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import "dotenv/config";

const commands = [
  new SlashCommandBuilder()
    .setName("saluda")
    .setDescription("El bot entra al canal de voz, saluda y se va"),

  new SlashCommandBuilder()
    .setName("pesetas")
    .setDescription("Muestra tu saldo actual de pesetas"),

  new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Top 10 de pesetas del servidor"),

  new SlashCommandBuilder()
    .setName("apostar")
    .setDescription("Reta a alguien a una apuesta")
    .addUserOption((opt) =>
      opt.setName("rival").setDescription("Usuario al que quieres retar").setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName("cantidad").setDescription("Cantidad de pesetas a apostar").setMinValue(1).setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("pon")
    .setDescription("Pon una canción o añádela a la cola")
    .addStringOption((opt) =>
      opt.setName("cancion").setDescription("Nombre de la canción o URL de YouTube").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("cola")
    .setDescription("Muestra la cola de música"),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Salta la canción actual"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Para la música y el bot sale del canal"),

  new SlashCommandBuilder()
    .setName("pausa")
    .setDescription("Pausa la reproducción"),

  new SlashCommandBuilder()
    .setName("sigue")
    .setDescription("Reanuda la reproducción"),

  new SlashCommandBuilder()
    .setName("ayuda")
    .setDescription("Muestra todos los comandos disponibles"),
].map((cmd) => cmd.toJSON());

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // optional: deploy only to a specific guild (instant)

if (!token || !clientId) {
  console.error("DISCORD_TOKEN and CLIENT_ID must be set in .env");
  process.exit(1);
}

const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(`Registering ${commands.length} slash commands...`);

    if (guildId) {
      // Guild commands — instant, great for testing
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`Registered guild commands for guild ${guildId}`);
    } else {
      // Global commands — takes up to 1h to propagate
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log("Registered global commands");
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
