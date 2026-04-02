import { REST, Routes } from 'discord.js';
import { commandData } from '../commands/index.js';
import { config } from '../config.js';

export async function deployGuildCommands(): Promise<void> {
	const rest = new REST({ version: '10' }).setToken(config.token);

	await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
		body: commandData,
	});
}
