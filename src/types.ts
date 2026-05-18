import type { AutocompleteInteraction, ChatInputCommandInteraction, ClientEvents, Collection, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import { Client } from 'discord.js';

export type BotCommand = {
	data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	execute: (interaction: ChatInputCommandInteraction<'cached'>) => Promise<void>;
	autocomplete?: (interaction: AutocompleteInteraction<'cached'>) => Promise<void>;
};

export type BotEvent<K extends keyof ClientEvents = keyof ClientEvents> = {
	name: K;
	once?: boolean;
	execute: (client: BotClient, ...args: ClientEvents[K]) => Promise<void> | void;
};

export class BotClient extends Client {
	public commands!: Collection<string, BotCommand>;
}

export type StoredPlayer = {
	riotId: string;
	puuid: string;
	discordId?: string;
	/** Preferred lane/role for the public team card. Pulled from the player's web application. */
	role?: 'Top' | 'Jungle' | 'Mid' | 'Bot' | 'Support' | 'Fill' | 'Sub';
};

/**
 * Reference to a verified Riot/Discord account, snapshotted at assignment
 * time so the team card keeps working even if the user later unlinks their
 * Riot account on the Web app.
 */
export type TeamCaptain = {
	discordId: string;
	discordUsername?: string;
	riotId: string;
	puuid: string;
	assignedAt: string;
};

/**
 * Web-tournament metadata for a team. The bot itself doesn't use any of this
 * (it just stores it alongside the team) — it's read by the Web app to render
 * the public tournament pages (groups, bracket, OBS overlay).
 *
 * If unset, the Web app falls back to sensible defaults.
 */
export type TeamMeta = {
	/** Group letter for the round-robin stage. */
	group?: 'A' | 'B';
	/** Seed within the group (1..4). */
	seed?: number;
	/** Tailwind gradient classes for the team accent stripe. */
	accent?: string;
	/** Captain — references a verified Riot account from the Web app. */
	captain?: TeamCaptain;
};

export type StoredTeam = {
	name: string;
	players: StoredPlayer[];
	playedChampions: string[];
	/** Discord role ID whose members can see/join the team voice channel. */
	roleId?: string;
	/** Voice channel ID created for this team. */
	voiceChannelId?: string;
	/** Optional tournament metadata used by the Web app. Set via admin tooling. */
	meta?: TeamMeta;
};

/** A single scheduled match within a round. */
export type StoredMatch = {
	id: string;
	round: number;
	teamAKey: string;
	teamBKey: string;
	/** Riot tournament code — generated on first captain button click. */
	tournamentCode?: string;
	/** Filled after a successful /scangame for this match. */
	riotMatchId?: string;
	/** Discord message ID of the match embed in the matches channel. */
	messageId?: string;
	channelId?: string;
	createdAt: number;
};

export type TournamentMode = 'fearless' | 'standard';

export type TournamentData = {
	providerId?: number;
	tournamentId?: number;
	matches: StoredMatch[];
	/** 'fearless' tracks played champions per team; 'standard' only posts stats. Defaults to 'fearless'. */
	mode?: TournamentMode;
	/** Human-readable name shown in status and embeds. */
	name?: string;
};

export type QueueEntry = {
	userId: string;
	/** Nickname before the bot renamed them; null means they had none. */
	originalNickname: string | null;
	/** The name shown after "#N | " — captured at join time. */
	displayName: string;
	joinedAt: number;
};

export type WaitingQueue = {
	channelId: string;
	entries: QueueEntry[];
};

export type Storage = {
	teams: Record<string, StoredTeam>;
	scannedMatches: string[];
	tournament: TournamentData;
	waitingQueue?: WaitingQueue;
};

export type RiotAccount = {
	puuid: string;
	gameName: string;
	tagLine: string;
};

export type RiotMatchParticipant = {
	puuid: string;
	championName: string;
	champLevel: number;
	teamId: number;
	win: boolean;
	// KDA
	kills: number;
	deaths: number;
	assists: number;
	// Stats
	totalDamageDealtToChampions: number;
	totalDamageTaken: number;
	goldEarned: number;
	totalMinionsKilled: number;
	neutralMinionsKilled: number;
	visionScore: number;
	// Multikills
	pentaKills: number;
	quadraKills: number;
	tripleKills: number;
	doubleKills: number;
	// Identity
	riotIdGameName?: string;
	riotIdTagline?: string;
	summonerName?: string;
};

export type RiotMatch = {
	metadata: {
		matchId: string;
		participants: string[];
	};
	info: {
		gameCreation: number;
		gameDuration: number;
		participants: RiotMatchParticipant[];
		queueId: number;
	};
};
