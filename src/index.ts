import { GatewayIntentBits } from 'discord.js';
import { createCommandCollection, initCommands } from './commands/index.js';
import { config } from './config.js';
import { registerEvents } from './events/index.js';
import { loadStorage } from './lib/storage.js';
import { BotClient } from './types.js';
import { wait } from './utils.js';

const MONGO_RETRY_INITIAL_MS = 5_000;
const MONGO_RETRY_MAX_MS = 60_000;
const DISCORD_LOGIN_RETRY_INITIAL_MS = 30_000;
const DISCORD_LOGIN_RETRY_MAX_MS = 5 * 60_000;
const DISCORD_SESSION_RESET_BUFFER_MS = 5_000;

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function waitForStorage(): Promise<void> {
	let delayMs = MONGO_RETRY_INITIAL_MS;

	for (;;) {
		try {
			await loadStorage();
			return;
		} catch (error) {
			console.error(`[startup] MongoDB unavailable: ${formatError(error)}. Retrying in ${Math.round(delayMs / 1000)}s.`);
			await wait(delayMs);
			delayMs = Math.min(delayMs * 2, MONGO_RETRY_MAX_MS);
		}
	}
}

function getDiscordSessionResetDelay(error: unknown): number | null {
	const message = formatError(error);
	const match = message.match(/resets at ([^\s]+)/i);
	if (!match) return null;

	const resetAt = Date.parse(match[1]);
	if (!Number.isFinite(resetAt)) return null;

	return Math.max(resetAt - Date.now() + DISCORD_SESSION_RESET_BUFFER_MS, DISCORD_LOGIN_RETRY_INITIAL_MS);
}

async function loginWithRetry(client: BotClient): Promise<void> {
	let delayMs = DISCORD_LOGIN_RETRY_INITIAL_MS;

	for (;;) {
		try {
			await client.login(config.token);
			return;
		} catch (error) {
			const resetDelayMs = getDiscordSessionResetDelay(error);
			const retryDelayMs = resetDelayMs ?? delayMs;
			console.error(`[startup] Discord login failed: ${formatError(error)}. Retrying in ${Math.round(retryDelayMs / 1000)}s.`);
			await wait(retryDelayMs);
			delayMs = Math.min(delayMs * 2, DISCORD_LOGIN_RETRY_MAX_MS);
		}
	}
}

const client = new BotClient({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates],
});

await waitForStorage();
await initCommands();

client.commands = createCommandCollection();

registerEvents(client);
await loginWithRetry(client);
