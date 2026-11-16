import { REST, Routes } from "discord.js";
import "dotenv/config";
import { commands } from "./commands/definitions";



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
