import type { ChatInputCommandInteraction, ClientEvents, Collection, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder } from 'discord.js';
import { Client } from 'discord.js';

export type BotCommand = {
	data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
	execute: (interaction: ChatInputCommandInteraction<'cached'>) => Promise<void>;
};

export type BotEvent<K extends keyof ClientEvents = keyof ClientEvents> = {
	name: K;
	once?: boolean;
	execute: (client: BotClient, ...args: ClientEvents[K]) => Promise<void> | void;
};

export class BotClient extends Client {
	public commands!: Collection<string, BotCommand>;
}
