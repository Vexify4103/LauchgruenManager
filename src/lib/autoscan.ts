import type { Client, TextChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import { config } from '../config.js';
import { postMatchResult } from './matchResult.js';
import { fetchRecentMatchIds, RiotApiError } from './riot.js';
import { buildScanMessage, scanMatch } from './scanner.js';
import { loadStorage } from './storage.js';

type AutoscanState = {
	enabled: boolean;
	intervalMs: number;
	minPlayersPerTeam: number;
	sinceEpochSeconds: number;
	channelId: string | null;
	running: boolean;
	timer: NodeJS.Timeout | null;
	lastPollAt: Date | null;
	lastPollError: string | null;
	processedInLastPoll: number;
};

const state: AutoscanState = {
	enabled: config.autoscanEnabled,
	intervalMs: config.autoscanIntervalSec * 1000,
	minPlayersPerTeam: config.autoscanMinPlayersPerTeam,
	sinceEpochSeconds: Math.floor(Date.now() / 1000),
	channelId: config.autoscanChannelId,
	running: false,
	timer: null,
	lastPollAt: null,
	lastPollError: null,
	processedInLastPoll: 0,
};

export function getAutoscanStatus() {
	return {
		enabled: state.enabled,
		running: state.timer !== null,
		intervalSec: Math.round(state.intervalMs / 1000),
		minPlayersPerTeam: state.minPlayersPerTeam,
		channelId: state.channelId,
		sinceEpochSeconds: state.sinceEpochSeconds,
		lastPollAt: state.lastPollAt,
		lastPollError: state.lastPollError,
		processedInLastPoll: state.processedInLastPoll,
	};
}

async function resolveNotificationChannel(client: Client): Promise<TextChannel | null> {
	if (!state.channelId) return null;
	try {
		const channel = await client.channels.fetch(state.channelId);
		if (channel && channel.type === ChannelType.GuildText) return channel as TextChannel;
		return null;
	} catch {
		return null;
	}
}

export async function runOnePoll(client: Client): Promise<{ processed: number; newMatches: string[]; errors: string[] }> {
	if (state.running) return { processed: 0, newMatches: [], errors: ['Ein Poll laeuft bereits.'] };
	state.running = true;
	const errors: string[] = [];
	const newMatches: string[] = [];
	let processed = 0;

	try {
		const storage = await loadStorage();
		const teams = Object.values(storage.teams).filter((t) => t.players.length > 0);
		const seen = new Set<string>();
		const alreadyScanned = new Set(storage.scannedMatches);

		for (const team of teams) {
			const pivot = team.players[0];
			let matchIds: string[];
			try {
				matchIds = await fetchRecentMatchIds(pivot.puuid, { startTime: state.sinceEpochSeconds, count: 20 });
			} catch (error) {
				const message = error instanceof RiotApiError ? error.message : error instanceof Error ? error.message : String(error);
				errors.push(`[${team.name}] ${message}`);
				if (error instanceof RiotApiError && (error.status === 401 || error.status === 403)) {
					state.lastPollError = message;
					return { processed, newMatches, errors };
				}
				continue;
			}

			for (const matchId of matchIds) {
				if (seen.has(matchId) || alreadyScanned.has(matchId)) continue;
				seen.add(matchId);

				const outcome = await scanMatch(matchId, { minPlayersPerTeam: state.minPlayersPerTeam });
				processed++;

				if (outcome.kind === 'success') {
					newMatches.push(matchId);
					const channel = await resolveNotificationChannel(client);
					if (channel) {
						const msg = buildScanMessage(outcome, { origin: 'auto' });
						if (msg) {
							await channel.send(msg as Parameters<typeof channel.send>[0]).catch((err: unknown) => {
								console.warn('[autoscan] Konnte Ergebnis nicht posten:', err);
							});
						}
					}
					void postMatchResult(client, outcome);
				} else if (outcome.kind === 'riot-error') {
					errors.push(`[${matchId}] ${outcome.message}`);
				}
			}
		}

		state.lastPollAt = new Date();
		state.processedInLastPoll = processed;
		state.lastPollError = errors[0] ?? null;
		return { processed, newMatches, errors };
	} finally {
		state.running = false;
	}
}

export function startAutoscan(client: Client): void {
	if (!state.enabled) { console.log('[autoscan] Deaktiviert.'); return; }
	if (state.timer) return;
	console.log(`[autoscan] Startet alle ${Math.round(state.intervalMs / 1000)}s.`);

	state.timer = setTimeout(function recur() {
		void runOnePoll(client)
			.then(({ newMatches, errors }) => {
				if (newMatches.length > 0) console.log(`[autoscan] ${newMatches.length} neue Matches: ${newMatches.join(', ')}`);
				if (errors.length > 0) console.warn('[autoscan] Fehler:', errors.slice(0, 3));
			})
			.catch((err: unknown) => {
				console.error('[autoscan] Unerwarteter Fehler:', err);
				state.lastPollError = err instanceof Error ? err.message : String(err);
			})
			.finally(() => { state.timer = setTimeout(recur, state.intervalMs); });
	}, 5_000);
}

export function stopAutoscan(): void {
	if (state.timer) { clearTimeout(state.timer); state.timer = null; }
}

export function setAutoscanEnabled(enabled: boolean, client: Client): void {
	state.enabled = enabled;
	if (enabled) startAutoscan(client); else stopAutoscan();
}
