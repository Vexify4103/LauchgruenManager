import type { ClientEvents } from 'discord.js';
import type { BotClient, BotEvent } from '../types.js';
import clientReadyEvent from './clientReady.js';
import interactionCreateEvent from './interactionCreate.js';
import voiceStateUpdateEvent from './voiceStateUpdate.js';

function registerEvent<K extends keyof ClientEvents>(client: BotClient, event: BotEvent<K>): void {
	const execute = (...args: ClientEvents[K]) => {
		void Promise.resolve(event.execute(client, ...args)).catch((error: unknown) => {
			console.error(`[event] ${String(event.name)} failed:`, error);
		});
	};

	if (event.once) {
		client.once(event.name, execute);
		return;
	}

	client.on(event.name, execute);
}

export function registerEvents(client: BotClient): void {
	registerEvent(client, clientReadyEvent);
	registerEvent(client, interactionCreateEvent);
	registerEvent(client, voiceStateUpdateEvent);
}
