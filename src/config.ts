import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config();

function getEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing environment variable: ${name}`);
	return value;
}

function getBool(name: string, fallback: boolean): boolean {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	return /^(1|true|yes|on)$/i.test(raw.trim());
}

function getInt(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
	token: getEnv('DISCORD_TOKEN'),
	clientId: getEnv('DISCORD_CLIENT_ID'),
	guildId: getEnv('DISCORD_GUILD_ID'),
	riotApiKey: getEnv('RIOT_API_KEY'),
	riotPlatform: process.env.RIOT_PLATFORM ?? 'EUW1',
	riotRegion: process.env.RIOT_REGION ?? 'europe',
	storagePath: resolve(process.cwd(), process.env.STORAGE_PATH ?? 'data/storage.json'),

	autoscanEnabled: getBool('AUTOSCAN_ENABLED', false),
	autoscanIntervalSec: getInt('AUTOSCAN_INTERVAL_SEC', 120),
	autoscanMinPlayersPerTeam: getInt('AUTOSCAN_MIN_PLAYERS_PER_TEAM', 5),
	autoscanChannelId: process.env.AUTOSCAN_CHANNEL_ID?.trim() || null,

	tournamentRoleId: process.env.TOURNAMENT_ROLE_ID ?? '1476317147113193613',
	nicknameFormat: process.env.NICKNAME_FORMAT ?? '{gameName}',

	/** Category ID where team voice channels are created. */
	teamVoiceCategoryId: process.env.TEAM_VOICE_CATEGORY_ID ?? '1495405939065618544',
	/** Role ID required to use the "get tournament code" button (team captains). */
	captainRoleId: process.env.CAPTAIN_ROLE_ID ?? '1476998578084909077',
	/** Channel where /startmatch posts match embeds. */
	matchesChannelId: process.env.MATCHES_CHANNEL_ID?.trim() || null,
	/** Channel where admin command executions and errors are logged. */
	logChannelId: process.env.LOG_CHANNEL_ID?.trim() || null,
	/** Channel where match result stats embeds are posted after every scan. */
	resultsChannelId: process.env.RESULTS_CHANNEL_ID?.trim() || null,
	/** Callback URL registered with Riot's tournament-stub provider (any valid URL). */
	tournamentCallbackUrl: process.env.TOURNAMENT_CALLBACK_URL ?? 'https://example.com/riot-callback',
};
