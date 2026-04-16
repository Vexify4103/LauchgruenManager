import { config } from './config.js';
import { createCommandCollection, initCommands } from './commands/index.js';
import { registerEvents } from './events/index.js';
import { BotClient } from './types.js';
import { GatewayIntentBits } from 'discord.js';

const client = new BotClient({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

await initCommands();

client.commands = createCommandCollection();

registerEvents(client);

client.login(config.token).catch((error) => {
	console.error('Login fehlgeschlagen:', error);
	process.exitCode = 1;
});
