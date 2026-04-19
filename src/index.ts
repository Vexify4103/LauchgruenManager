import { GatewayIntentBits } from 'discord.js';
import { createCommandCollection, initCommands } from './commands/index.js';
import { config } from './config.js';
import { registerEvents } from './events/index.js';
import { loadStorage } from './lib/storage.js';
import { BotClient } from './types.js';

const client = new BotClient({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

await loadStorage();
await initCommands();

client.commands = createCommandCollection();

registerEvents(client);

client.login(config.token).catch((error) => {
	console.error('Login fehlgeschlagen:', error);
	process.exitCode = 1;
});
