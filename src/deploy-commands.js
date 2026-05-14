import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { fileURLToPath } from 'url';
import path from 'path';
import { readdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

for (const file of readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = await import(`./commands/${file}`);
  if (cmd.data) commands.push(cmd.data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

try {
  console.log(`⚓ Déploiement de ${commands.length} commandes slash...`);
  const data = await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log(`✅ ${data.length} commandes déployées avec succès sur le serveur.`);
} catch (err) {
  console.error(err);
}
