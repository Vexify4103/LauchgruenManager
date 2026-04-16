import { Collection } from 'discord.js';
import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { BotCommand } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadCommands(): Promise<BotCommand[]> {
	const commands: BotCommand[] = [];
	const commandsDir = __dirname;

	for (const category of readdirSync(commandsDir)) {
		const categoryPath = join(commandsDir, category);

		if (!statSync(categoryPath).isDirectory()) continue;

		for (const file of readdirSync(categoryPath)) {
			if (!file.endsWith('.js') && !file.endsWith('.ts')) continue;

			const filePath = join(categoryPath, file);
			const module = await import(pathToFileURL(filePath).href);
			const command: BotCommand = module.default;

			if (command?.data && 'execute' in command) {
				commands.push(command);
			} else {
				console.warn(`[commands] Skipping ${file} — missing data or execute`);
			}
		}
	}

	return commands;
}

let commandList: BotCommand[] = [];

export async function initCommands(): Promise<void> {
	commandList = await loadCommands();
	console.log(`[commands] Loaded ${commandList.length} command(s): ${commandList.map((c) => c.data.name).join(', ')}`);
}

export function getCommandData() {
	return commandList.map((c) => c.data.toJSON());
}

export function createCommandCollection(): Collection<string, BotCommand> {
	return new Collection(commandList.map((c) => [c.data.name, c]));
}
