import { Client, GatewayIntentBits } from "discord.js";

// Shared client instance imported by modules that need to access Discord
// (e.g. role management triggered from DB-level events like bets or voice ticks)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

export default client;
