require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error("Variables requises: DISCORD_TOKEN et CLIENT_ID.");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Affiche la liste des commandes.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Affiche ton argent et propose un depot.")
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(token);

async function main() {
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log("Commandes deployees sur le serveur (guild).");
      return;
    }

    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("Commandes deployees globalement.");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
