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
};

export type StoredTeam = {
	name: string;
	players: StoredPlayer[];
	playedChampions: string[];
	/** Discord role ID whose members can see/join the team voice channel. */
	roleId?: string;
	/** Voice channel ID created for this team. */
	voiceChannelId?: string;
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

export type TournamentData = {
	providerId?: number;
	tournamentId?: number;
	matches: StoredMatch[];
};

export type Storage = {
	teams: Record<string, StoredTeam>;
	scannedMatches: string[];
	tournament: TournamentData;
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
