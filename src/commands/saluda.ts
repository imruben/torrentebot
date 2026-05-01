import { ChatInputCommandInteraction, GuildMember, VoiceBasedChannel } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import path from "path";
import fs from "fs";
import { SILENT } from "../utils";

const GREETING_FILE = path.join(__dirname, "..", "..", "assets", "audio", "greeting.mp3");

export async function handleSaluda(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  const voiceChannel = member?.voice.channel as VoiceBasedChannel | null;

  if (!voiceChannel) {
    await interaction.reply({ content: "Tienes que estar en un canal de voz primero.", ephemeral: true });
    return;
  }

  if (!fs.existsSync(GREETING_FILE)) {
    await interaction.reply({ content: "No se encontró el audio. Añade `assets/audio/greeting.mp3`.", ephemeral: true });
    return;
  }

  await interaction.reply({ content: "🎙️ Uniéndome al canal...", ...SILENT });

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
  } catch {
    connection.destroy();
    await interaction.editReply("No pude unirme al canal de voz.");
    return;
  }

  const player = createAudioPlayer();
  const resource = createAudioResource(GREETING_FILE);

  connection.subscribe(player);
  player.play(resource);

  await interaction.editReply("🎙️ ¡Saludando!");

  player.on(AudioPlayerStatus.Idle, () => connection.destroy());
  player.on("error", (err) => {
    console.error("[TorrenteBot] Audio player error:", err);
    connection.destroy();
  });
}
