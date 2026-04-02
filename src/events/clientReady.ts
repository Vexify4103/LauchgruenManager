import { ActivityType } from 'discord.js';
import { config } from '../config.js';
import { deployGuildCommands } from '../lib/deployCommands.js';
import type { BotEvent } from '../types.js';

const clientReadyEvent: BotEvent<'clientReady'> = {
	name: 'clientReady',
	once: true,
	async execute(client) {
		try {
			await deployGuildCommands();
			console.log(`Aktive Ziel-Guild: ${config.guildId}`);
			console.log('Guild-Slashcommands wurden beim Start synchronisiert.');
			console.log(`Bot eingeloggt als ${client.user?.tag ?? 'unbekannt'}`);

			client.user?.setPresence({
				status: 'online',
				activities: [
					{
						name: 'twitch.tv/lauchgruen',
						type: ActivityType.Watching,
					},
				],
			});
		} catch (error) {
			console.error('Fehler beim Synchronisieren der Guild-Slashcommands:', error);
			process.exitCode = 1;
		}
	},
};

export default clientReadyEvent;
