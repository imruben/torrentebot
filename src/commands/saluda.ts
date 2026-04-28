import { Message } from "discord.js";
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

const GREETING_FILE = path.join(__dirname, "..", "..", "assets", "audio", "greeting.mp3");

export async function handleSaluda(message: Message): Promise<void> {
  const member = message.member;
  if (!member) return;

  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    await message.reply("Tienes que estar en un canal de voz primero.");
    return;
  }

  if (!fs.existsSync(GREETING_FILE)) {
    await message.reply("No se encontró el audio. Añade `assets/audio/greeting.mp3`.");
    return;
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
  } catch {
    connection.destroy();
    await message.reply("No pude unirme al canal de voz.");
    return;
  }

  const player = createAudioPlayer();
  const resource = createAudioResource(GREETING_FILE);

  connection.subscribe(player);
  player.play(resource);

  player.on(AudioPlayerStatus.Idle, () => {
    connection.destroy();
  });

  player.on("error", (err) => {
    console.error("[TorrenteBot] Audio player error:", err);
    connection.destroy();
  });
}
