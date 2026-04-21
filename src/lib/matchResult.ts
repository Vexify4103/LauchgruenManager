import { ChannelType, ContainerBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, type Client } from 'discord.js';
import { config } from '../config.js';
import type { RiotMatchParticipant } from '../types.js';
import { loadStorage } from './storage.js';
import type { ScanOutcome } from './scanner.js';

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtNum(n: number): string {
	return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtDuration(sec: number): string {
	// Riot API returned ms in older game versions; normalise
	const s = sec > 10_000 ? Math.floor(sec / 1000) : sec;
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function kdaRatio(kills: number, deaths: number, assists: number): number {
	return deaths === 0 ? kills + assists : (kills + assists) / deaths;
}

function playerRow(p: RiotMatchParticipant, displayName: string): string {
	const kda = `${p.kills}/${p.deaths}/${p.assists}`;
	const cs = p.totalMinionsKilled + p.neutralMinionsKilled;
	return [
		displayName.slice(0, 13).padEnd(13),
		kda.padEnd(10),
		fmtNum(p.totalDamageDealtToChampions).padStart(8),
		String(cs).padStart(5),
		String(p.visionScore).padStart(4),
	].join('  ');
}

// ─── Components v2 helpers ────────────────────────────────────────────────────

function sep(large = false): SeparatorBuilder {
	return new SeparatorBuilder().setDivider(true).setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

function text(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchResultTeam = {
	name: string;
	won: boolean;
	participants: RiotMatchParticipant[];
	/** puuid → display Riot ID */
	riotIdMap: Map<string, string>;
};

// ─── Team block builder ───────────────────────────────────────────────────────

function buildTeamBlock(team: MatchResultTeam): string {
	const header = [
		'Champion'.padEnd(13),
		'KDA'.padEnd(10),
		'Dmg'.padStart(8),
		'CS'.padStart(5),
		'VS'.padStart(4),
	].join('  ');

	const rows = team.participants.map((p) => {
		const display = (team.riotIdMap.get(p.puuid) ?? p.riotIdGameName ?? p.puuid.slice(0, 8)).split('#')[0]!;
		return playerRow(p, display);
	});

	const totalDmg = team.participants.reduce((s, p) => s + p.totalDamageDealtToChampions, 0);
	const totalCs  = team.participants.reduce((s, p) => s + p.totalMinionsKilled + p.neutralMinionsKilled, 0);
	const k = team.participants.reduce((s, p) => s + p.kills, 0);
	const d = team.participants.reduce((s, p) => s + p.deaths, 0);
	const a = team.participants.reduce((s, p) => s + p.assists, 0);

	const footer = `Total  ·  Dmg: **${fmtNum(totalDmg)}**  ·  K/D/A: **${k}/${d}/${a}**  ·  CS: **${totalCs}**`;
	return `\`\`\`\n${header}\n${rows.join('\n')}\n\`\`\`\n${footer}`;
}

// ─── Highlights builder ───────────────────────────────────────────────────────

function buildHighlights(teams: MatchResultTeam[]): string {
	type Enriched = RiotMatchParticipant & { teamName: string; displayName: string; cs: number };

	const all: Enriched[] = teams.flatMap((t) =>
		t.participants.map((p) => ({
			...p,
			teamName: t.name,
			displayName: (t.riotIdMap.get(p.puuid) ?? p.riotIdGameName ?? p.puuid.slice(0, 8)).split('#')[0]!,
			cs: p.totalMinionsKilled + p.neutralMinionsKilled,
		}))
	);

	const lines: string[] = [];

	const topDmg    = all.reduce((a, b) => a.totalDamageDealtToChampions > b.totalDamageDealtToChampions ? a : b);
	const topKills  = all.reduce((a, b) => a.kills > b.kills ? a : b);
	const topKda    = all.reduce((a, b) => kdaRatio(a.kills, a.deaths, a.assists) > kdaRatio(b.kills, b.deaths, b.assists) ? a : b);
	const topVision = all.reduce((a, b) => a.visionScore > b.visionScore ? a : b);

	lines.push(`**Most damage**  ·  ${topDmg.championName} — ${topDmg.displayName} (${topDmg.teamName}) — ${fmtNum(topDmg.totalDamageDealtToChampions)}`);
	lines.push(`**Most kills**   ·  ${topKills.championName} — ${topKills.displayName} (${topKills.teamName}) — ${topKills.kills}`);
	lines.push(`**Best KDA**     ·  ${topKda.championName} — ${topKda.displayName} (${topKda.teamName}) — ${kdaRatio(topKda.kills, topKda.deaths, topKda.assists).toFixed(2)}  (${topKda.kills}/${topKda.deaths}/${topKda.assists})`);
	lines.push(`**Best vision**  ·  ${topVision.championName} — ${topVision.displayName} (${topVision.teamName}) — ${topVision.visionScore} vs`);

	// Multikills — highest tier only per player
	for (const p of all) {
		if (p.pentaKills > 0)                                              lines.push(`🎖️ **Penta Kill**   ·  ${p.championName} — ${p.displayName} (${p.teamName})`);
		else if (p.quadraKills > 0)                                        lines.push(`🎖️ **Quadra Kill**  ·  ${p.championName} — ${p.displayName} (${p.teamName})`);
		else if (p.tripleKills > 0)                                        lines.push(`🎖️ **Triple Kill**  ·  ${p.championName} — ${p.displayName} (${p.teamName})`);
	}

	return lines.join('\n');
}

// ─── Container builder ────────────────────────────────────────────────────────

export function buildMatchResultContainer(
	matchId: string,
	gameDurationSec: number,
	teams: MatchResultTeam[],
	round?: number
): ContainerBuilder {
	const winner = teams.find((t) => t.won);
	const loser  = teams.find((t) => !t.won);

	if (!winner || !loser) {
		return new ContainerBuilder()
			.setAccentColor(0x95a5a6)
			.addTextDisplayComponents(text(`### Match Result\n\`${matchId}\`\n*Kein eindeutiger Gewinner ermittelt.*`));
	}

	const roundStr = round !== undefined ? `Round ${round}  ·  ` : '';
	const header   = `### ⚔️  ${winner.name}  vs  ${loser.name}\n🏆  **${winner.name}** wins  ·  ${roundStr}${fmtDuration(gameDurationSec)}  ·  \`${matchId}\``;

	return new ContainerBuilder()
		.setAccentColor(0xf1c40f) // gold
		.addTextDisplayComponents(text(header))
		.addSeparatorComponents(sep())
		.addTextDisplayComponents(text(`🏆  **${winner.name}**  —  WIN`))
		.addTextDisplayComponents(text(buildTeamBlock(winner)))
		.addSeparatorComponents(sep(true))
		.addTextDisplayComponents(text(`**${loser.name}**  —  LOSS`))
		.addTextDisplayComponents(text(buildTeamBlock(loser)))
		.addSeparatorComponents(sep())
		.addTextDisplayComponents(text(`🏅  **Highlights**\n${buildHighlights(teams)}`));
}

// ─── Channel resolver ─────────────────────────────────────────────────────────

let resultsChannelCache: { send(opts: unknown): Promise<unknown> } | null | undefined = undefined;

async function getResultsChannel(client: Client) {
	if (resultsChannelCache !== undefined) return resultsChannelCache;
	if (!config.resultsChannelId) { resultsChannelCache = null; return null; }
	try {
		const ch = await client.channels.fetch(config.resultsChannelId);
		resultsChannelCache = ch?.type === ChannelType.GuildText ? ch : null;
	} catch {
		resultsChannelCache = null;
	}
	return resultsChannelCache;
}

// ─── Round lookup ─────────────────────────────────────────────────────────────

async function findRound(matchId: string, teamNames: string[]): Promise<number | undefined> {
	try {
		const storage = await loadStorage();
		const keys = new Set(teamNames.map((n) => n.toLowerCase()));
		const storedMatch = storage.tournament.matches.find(
			(m) => keys.has(m.teamAKey) && keys.has(m.teamBKey) && (!m.riotMatchId || m.riotMatchId === matchId)
		);
		return storedMatch?.round;
	} catch {
		return undefined;
	}
}

// ─── Public post function ─────────────────────────────────────────────────────

/** Post a match result embed to the results channel. Fire-and-forget safe. */
export async function postMatchResult(
	client: Client,
	outcome: Extract<ScanOutcome, { kind: 'success' }>
): Promise<void> {
	if (!config.resultsChannelId) return;

	try {
		const channel = await getResultsChannel(client);
		if (!channel) return;

		// Build MatchResultTeam[] by mapping stored players → API participants
		const teams: MatchResultTeam[] = [];

		for (const bucket of outcome.teamResults) {
			const participants: RiotMatchParticipant[] = [];
			const riotIdMap = new Map<string, string>();

			for (const stored of bucket.team.players) {
				const p = outcome.match.info.participants.find((ap) => ap.puuid === stored.puuid);
				if (p) {
					participants.push(p);
					riotIdMap.set(stored.puuid, stored.riotId);
				}
			}

			if (participants.length > 0) {
				teams.push({
					name: bucket.team.name,
					won: participants.some((p) => p.win),
					participants,
					riotIdMap,
				});
			}
		}

		if (teams.length < 2) return;

		const round = await findRound(outcome.matchId, teams.map((t) => t.name));
		const container = buildMatchResultContainer(outcome.matchId, outcome.match.info.gameDuration, teams, round);

		await (channel as { send(opts: unknown): Promise<unknown> }).send({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		});
	} catch (err) {
		console.warn('[matchResult] Konnte Match-Ergebnis nicht posten:', err);
	}
}
