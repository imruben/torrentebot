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
import { torrente } from "../torrente";

const AUDIO_FILES: Record<string, string> = {
  pajillas: path.join(__dirname, "..", "..", "assets", "audio", "greeting.mp3"),
  lol: path.join(__dirname, "..", "..", "assets", "audio", "perdio_su_vida_en_el_lol.mp3"),
};

export async function handleAudio(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  const voiceChannel = member?.voice.channel as VoiceBasedChannel | null;

  if (!voiceChannel) {
    await interaction.reply({ content: torrente("error_no_voice"), ephemeral: true });
    return;
  }

  const clip = interaction.options.getString("clip", true);
  const audioFile = AUDIO_FILES[clip];

  if (!audioFile || !fs.existsSync(audioFile)) {
    await interaction.reply({ content: torrente("error_generic"), ephemeral: true });
    return;
  }

  await interaction.reply({ content: torrente("audio_joining"), ...SILENT });

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
  } catch {
    connection.destroy();
    await interaction.editReply(torrente("error_voice_connect"));
    return;
  }

  const player = createAudioPlayer();
  const resource = createAudioResource(audioFile);

  connection.subscribe(player);
  player.play(resource);

  await interaction.editReply(torrente("audio_playing"));

  player.on(AudioPlayerStatus.Idle, () => connection.destroy());
  player.on("error", (err) => {
    console.error("[TorrenteBot] Audio player error:", err);
    connection.destroy();
  });
}
