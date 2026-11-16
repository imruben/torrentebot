import { SlashCommandBuilder } from "discord.js";

// Single source of truth for the slash commands. Registered automatically on
// startup (see index.ts) and by `npm run deploy`.
export const commands = [
  new SlashCommandBuilder()
    .setName("audio")
    .setDescription("Reproduce un audio en el canal de voz")
    .addStringOption((opt) =>
      opt
        .setName("clip")
        .setDescription("Audio a reproducir")
        .setRequired(true)
        .addChoices(
          { name: "pajillas", value: "pajillas" },
          { name: "lol", value: "lol" }
        )
    ),

  new SlashCommandBuilder()
    .setName("pesetas")
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
    .setName("autodj")
    .setDescription("Activa o desactiva el modo Auto-DJ"),

  new SlashCommandBuilder()
    .setName("ruleta")
    .setDescription("Apuesta pesetas en la ruleta")
    .addIntegerOption((opt) =>
      opt.setName("cantidad").setDescription("Pesetas a apostar").setMinValue(1).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("cookies")
    .setDescription("(Solo el dueño del bot) Sube el cookies.txt de YouTube o comprueba si YouTube funciona")
    .addAttachmentOption((opt) =>
      opt.setName("archivo").setDescription("cookies.txt exportado del navegador (vacío = solo comprobar)").setRequired(false)
    ),
].map((cmd) => cmd.toJSON());
