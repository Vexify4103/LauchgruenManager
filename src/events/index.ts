import type { ClientEvents } from 'discord.js';
import type { BotClient, BotEvent } from '../types.js';
import clientReadyEvent from './clientReady.js';
import interactionCreateEvent from './interactionCreate.js';

function registerEvent<K extends keyof ClientEvents>(client: BotClient, event: BotEvent<K>): void {
	if (event.once) {
		client.once(event.name, (...args: ClientEvents[K]) => event.execute(client, ...args));
		return;
	}

	client.on(event.name, (...args: ClientEvents[K]) => event.execute(client, ...args));
}

export function registerEvents(client: BotClient): void {
	registerEvent(client, clientReadyEvent);
	registerEvent(client, interactionCreateEvent);
}
