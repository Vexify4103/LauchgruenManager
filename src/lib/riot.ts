import { config } from '../config.js';
import type { RiotAccount, RiotMatch } from '../types.js';

export class RiotApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly endpoint: string,
		message: string
	) {
		super(message);
		this.name = 'RiotApiError';
	}
}

async function riotGet<T>(url: string): Promise<T> {
	const response = await fetch(url, { headers: { 'X-Riot-Token': config.riotApiKey } });

	if (!response.ok) {
		let detail = '';
		try {
			const body = (await response.json()) as { status?: { message?: string } };
			detail = body.status?.message ?? '';
		} catch {
			/* ignore parse errors */
		}

		const message =
			response.status === 401 || response.status === 403
				? 'Riot API Key ist ungueltig oder abgelaufen.'
				: response.status === 404
					? 'Ressource bei Riot nicht gefunden.'
					: response.status === 429
						? 'Riot API Rate Limit erreicht — bitte kurz warten.'
						: `Riot API Fehler ${response.status}${detail ? `: ${detail}` : ''}`;

		throw new RiotApiError(response.status, url, message);
	}

	return (await response.json()) as T;
}

async function riotPost<T>(url: string, body: unknown): Promise<T> {
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'X-Riot-Token': config.riotApiKey,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		let detail = '';
		try {
			const b = (await response.json()) as { status?: { message?: string } };
			detail = b.status?.message ?? '';
		} catch {
			/* ignore */
		}
		throw new RiotApiError(response.status, url, `Riot API Fehler ${response.status}${detail ? `: ${detail}` : ''}`);
	}

	// Some endpoints return a plain number (provider/tournament ID)
	const text = await response.text();
	try {
		return JSON.parse(text) as T;
	} catch {
		return text as unknown as T;
	}
}

export function parseRiotId(input: string): { gameName: string; tagLine: string } {
	const trimmed = input.trim();
	const hashIndex = trimmed.lastIndexOf('#');
	if (hashIndex === -1 || hashIndex === trimmed.length - 1 || hashIndex === 0) {
		throw new Error(`Ungueltige Riot ID "${input}". Erwartet: Name#Tag`);
	}
	return { gameName: trimmed.slice(0, hashIndex), tagLine: trimmed.slice(hashIndex + 1) };
}

export function normalizeMatchId(input: string): string {
	const cleaned = input.trim();
	if (/^[A-Z0-9]+_\d+$/.test(cleaned)) return cleaned;
	if (/^\d+$/.test(cleaned)) return `${config.riotPlatform}_${cleaned}`;
	throw new Error(`Ungueltige Match-ID "${input}". Erwartet z.B. EUW1_1234567890 oder nur die Zahl.`);
}

export async function resolveRiotId(riotId: string): Promise<RiotAccount> {
	const { gameName, tagLine } = parseRiotId(riotId);
	const url = `https://${config.riotRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
	return riotGet<RiotAccount>(url);
}

export async function fetchMatch(matchId: string): Promise<RiotMatch> {
	const normalized = normalizeMatchId(matchId);
	const url = `https://${config.riotRegion}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(normalized)}`;
	return riotGet<RiotMatch>(url);
}

export type FetchRecentMatchIdsOptions = {
	startTime?: number;
	endTime?: number;
	queue?: number;
	type?: 'ranked' | 'normal' | 'tourney' | 'tutorial';
	start?: number;
	count?: number;
};

export async function fetchRecentMatchIds(puuid: string, options: FetchRecentMatchIdsOptions = {}): Promise<string[]> {
	const params = new URLSearchParams();
	if (options.startTime !== undefined) params.set('startTime', String(options.startTime));
	if (options.endTime !== undefined) params.set('endTime', String(options.endTime));
	if (options.queue !== undefined) params.set('queue', String(options.queue));
	if (options.type !== undefined) params.set('type', options.type);
	if (options.start !== undefined) params.set('start', String(options.start));
	params.set('count', String(options.count ?? 20));
	const url = `https://${config.riotRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`;
	return riotGet<string[]>(url);
}

export function formatRiotIdFromAccount(account: RiotAccount): string {
	return `${account.gameName}#${account.tagLine}`;
}

// ─── Tournament Stub API ────────────────────────────────────────────────────

const STUB_BASE = `https://${config.riotRegion}.api.riotgames.com`;

export async function createTournamentProvider(callbackUrl: string): Promise<number> {
	const regionMap: Record<string, string> = {
		europe: 'EUW',
		americas: 'NA',
		asia: 'KR',
		esports: 'EUW',
	};
	const region = regionMap[config.riotRegion] ?? 'EUW';
	const url = `${STUB_BASE}/lol/tournament-stub/v5/providers`;
	return riotPost<number>(url, { region, callbackUrl });
}

export async function createTournament(providerId: number, name: string): Promise<number> {
	const url = `${STUB_BASE}/lol/tournament-stub/v5/tournaments`;
	return riotPost<number>(url, { providerId, name });
}

export type TournamentCodeOptions = {
	tournamentId: number;
	allowedPuuids?: string[];
	count?: number;
	mapType?: string;
	pickType?: string;
	spectatorType?: string;
	teamSize?: number;
};

export async function generateTournamentCodes(options: TournamentCodeOptions): Promise<string[]> {
	const { tournamentId, allowedPuuids, count = 1, mapType = 'SUMMONERS_RIFT', pickType = 'TOURNAMENT_DRAFT', spectatorType = 'ALL', teamSize = 5 } = options;

	const params = new URLSearchParams({ count: String(count), tournamentId: String(tournamentId) });
	const url = `${STUB_BASE}/lol/tournament-stub/v5/codes?${params.toString()}`;
	const body: Record<string, unknown> = { mapType, pickType, spectatorType, teamSize };
	if (allowedPuuids && allowedPuuids.length > 0) {
		body['allowedSummonerIds'] = allowedPuuids;
	}
	return riotPost<string[]>(url, body);
}
