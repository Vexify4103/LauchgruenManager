import { Collection } from 'discord.js';
import type { BotCommand } from '../types.js';
import turnierStartCommand from './admin/turnierstart.js';
import turnierStopCommand from './admin/turnierstop.js';

const commandList = [turnierStartCommand, turnierStopCommand];

export const commandData = commandList.map((command) => command.data.toJSON());

export function createCommandCollection(): Collection<string, BotCommand> {
	return new Collection(commandList.map((command) => [command.data.name, command]));
}
