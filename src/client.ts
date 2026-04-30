import { Client, GatewayIntentBits } from "discord.js";

// Shared client instance imported by modules that need to access Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    // GuildMembers is needed to fetch member display names in ranking
    GatewayIntentBits.GuildMembers,
  ],
});

export default client;
