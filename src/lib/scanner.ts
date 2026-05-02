import { fetchMatch, normalizeMatchId, RiotApiError } from './riot.js';
import { updateStorage } from './storage.js';
import { buildScanContainer, makeEmbed, v2Message, type ScanResultTeam } from './embeds.js';
import type { RiotMatch, RiotMatchParticipant, StoredTeam } from '../types.js';
import type { MessageCreateOptions } from 'discord.js';

export type TeamScanResult = {
	team: StoredTeam;
	newlyAdded: string[];
	alreadyKnown: string[];
	players: { riotId: string; championName: string }[];
};

export type ScanOutcome =
	| { kind: 'already-scanned'; matchId: string }
	| { kind: 'no-teams-matched'; matchId: string; match: RiotMatch; orphans: RiotMatchParticipant[] }
	| { kind: 'filtered-out'; matchId: string; reason: string }
	| { kind: 'success'; matchId: string; match: RiotMatch; teamResults: TeamScanResult[]; orphans: RiotMatchParticipant[] }
	| { kind: 'riot-error'; message: string };

export type ScanOptions = {
	minPlayersPerTeam?: number;
};

export async function scanMatch(matchId: string, options: ScanOptions = {}): Promise<ScanOutcome> {
	const minPlayersPerTeam = options.minPlayersPerTeam ?? 1;
	let match: RiotMatch;
	try {
		match = await fetchMatch(matchId);
	} catch (error) {
		if (error instanceof RiotApiError && error.status === 404) {
			const queriedId = (() => { try { return normalizeMatchId(matchId); } catch { return matchId; } })();
			return {
				kind: 'riot-error',
				message:
					`Match \`${queriedId}\` was not found by Riot (404).\n\n` +
					`Possible causes:\n` +
					`• **Custom Game without Tournament Code** — regular custom games do NOT appear in the Match-v5 API.\n` +
					`• **Wrong region** — the match ID prefix must match the platform (\`EUW1_\`, \`NA1_\`...).\n` +
					`• **Match too old** — Match-v5 data has a limited retention period.`,
			};
		}
		const message = error instanceof RiotApiError ? error.message : error instanceof Error ? error.message : 'Unknown error';
		return { kind: 'riot-error', message };
	}

	return updateStorage((storage) => {
		if (storage.scannedMatches.includes(match.metadata.matchId)) {
			return { kind: 'already-scanned' as const, matchId: match.metadata.matchId };
		}

		const puuidToTeam = new Map<string, StoredTeam>();
		for (const team of Object.values(storage.teams)) {
			for (const player of team.players) puuidToTeam.set(player.puuid, team);
		}

		const perTeam = new Map<string, TeamScanResult>();
		const orphans: RiotMatchParticipant[] = [];

		for (const participant of match.info.participants) {
			const team = puuidToTeam.get(participant.puuid);
			if (!team) { orphans.push(participant); continue; }

			let bucket = perTeam.get(team.name);
			if (!bucket) {
				bucket = { team, newlyAdded: [], alreadyKnown: [], players: [] };
				perTeam.set(team.name, bucket);
			}

			const riotId =
				participant.riotIdGameName && participant.riotIdTagline
					? `${participant.riotIdGameName}#${participant.riotIdTagline}`
					: (team.players.find((p) => p.puuid === participant.puuid)?.riotId ?? participant.summonerName ?? participant.puuid.slice(0, 8));

			bucket.players.push({ riotId, championName: participant.championName });

			const wouldBeNew = !team.playedChampions.includes(participant.championName) && !bucket.newlyAdded.includes(participant.championName);
			if (wouldBeNew) bucket.newlyAdded.push(participant.championName);
			else bucket.alreadyKnown.push(participant.championName);
		}

		if (perTeam.size === 0) {
			return { kind: 'no-teams-matched' as const, matchId: match.metadata.matchId, match, orphans };
		}

		if (minPlayersPerTeam > 1) {
			const maxPlayers = Math.max(...Array.from(perTeam.values()).map((b) => b.players.length));
			if (maxPlayers < minPlayersPerTeam) {
				return {
					kind: 'filtered-out' as const,
					matchId: match.metadata.matchId,
					reason: `No team has at least ${minPlayersPerTeam} players in the match (max: ${maxPlayers}).`,
				};
			}
		}

		// Only track Fearless champion bans in fearless mode (default when mode is unset)
		if ((storage.tournament.mode ?? 'fearless') === 'fearless') {
			for (const bucket of perTeam.values()) {
				for (const champ of bucket.newlyAdded) bucket.team.playedChampions.push(champ);
			}
		}
		storage.scannedMatches.push(match.metadata.matchId);

		return {
			kind: 'success' as const,
			matchId: match.metadata.matchId,
			match,
			teamResults: Array.from(perTeam.values()),
			orphans,
		};
	});
}

/**
 * Build a Components v2 scan result message. Returns null for outcomes that
 * should be suppressed in auto-poll mode.
 */
export function buildScanMessage(outcome: ScanOutcome, options: { origin?: 'manual' | 'auto' } = {}): (Pick<MessageCreateOptions, 'components' | 'flags'> & { embeds?: never }) | { embeds: ReturnType<typeof makeEmbed>[]; components?: never; flags?: never } | null {
	const { origin = 'manual' } = options;

	if (outcome.kind === 'riot-error') {
		return { embeds: [makeEmbed('error', 'Match could not be loaded', outcome.message)] };
	}

	if (outcome.kind === 'already-scanned') {
		if (origin === 'auto') return null;
		return {
			embeds: [makeEmbed('warning', 'Match already scanned',
				`\`${outcome.matchId}\` has already been processed. No champions will be added again.\nIf needed: manually remove the match ID from \`storage.json\` or use \`/resetteam\`.`)]
		};
	}

	if (outcome.kind === 'no-teams-matched') {
		if (origin === 'auto') return null;
		return {
			embeds: [makeEmbed('warning', 'No teams found',
				`No player from match \`${outcome.matchId}\` is assigned to a registered team.\nCreate teams with \`/createteam\` and \`/addplayer\`.`)]
		};
	}

	if (outcome.kind === 'filtered-out') {
		if (origin === 'auto') return null;
		return { embeds: [makeEmbed('info', 'Match skipped', `\`${outcome.matchId}\`: ${outcome.reason}`)] };
	}

	const teamResults: ScanResultTeam[] = outcome.teamResults.map((b) => ({
		teamName: b.team.name,
		newlyAdded: b.newlyAdded,
		alreadyKnown: b.alreadyKnown,
		players: b.players,
		totalBanned: b.team.playedChampions.length,
	}));

	const orphansMapped = outcome.orphans.map((p) => ({
		riotId: p.riotIdGameName && p.riotIdTagline ? `${p.riotIdGameName}#${p.riotIdTagline}` : (p.summonerName ?? p.puuid.slice(0, 8)),
		championName: p.championName,
	}));

	return v2Message(buildScanContainer(outcome.matchId, teamResults, orphansMapped, origin));
}
