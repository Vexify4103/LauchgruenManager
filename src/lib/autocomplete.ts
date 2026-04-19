import type { AutocompleteInteraction } from 'discord.js';
import { findTeam, loadStorage } from './storage.js';

const LIMIT = 25;
const NAME_MAX = 100;

function clip(s: string): string {
	return s.length <= NAME_MAX ? s : s.slice(0, NAME_MAX - 1) + '…';
}

export async function suggestTeams(interaction: AutocompleteInteraction<'cached'>, focusedValue: string): Promise<void> {
	const storage = await loadStorage();
	const needle = focusedValue.trim().toLowerCase();
	const all = Object.values(storage.teams).map((t) => t.name);
	const filtered = needle ? all.filter((name) => name.toLowerCase().includes(needle)) : all;
	const sorted = filtered.sort((a, b) => {
		const ap = a.toLowerCase().startsWith(needle) ? 0 : 1;
		const bp = b.toLowerCase().startsWith(needle) ? 0 : 1;
		if (ap !== bp) return ap - bp;
		return a.localeCompare(b);
	});
	await interaction.respond(sorted.slice(0, LIMIT).map((name) => ({ name: clip(name), value: clip(name) })));
}

export async function suggestRiotIds(interaction: AutocompleteInteraction<'cached'>, focusedValue: string): Promise<void> {
	const storage = await loadStorage();
	const teamInput = interaction.options.getString('team') ?? '';
	const needle = focusedValue.trim().toLowerCase();
	const team = teamInput ? findTeam(storage, teamInput) : undefined;
	const pool: { riotId: string; teamName: string }[] = [];
	if (team) {
		for (const p of team.players) pool.push({ riotId: p.riotId, teamName: team.name });
	} else {
		for (const t of Object.values(storage.teams)) {
			for (const p of t.players) pool.push({ riotId: p.riotId, teamName: t.name });
		}
	}
	const filtered = needle ? pool.filter((e) => e.riotId.toLowerCase().includes(needle)) : pool;
	const sorted = filtered.sort((a, b) => {
		const ap = a.riotId.toLowerCase().startsWith(needle) ? 0 : 1;
		const bp = b.riotId.toLowerCase().startsWith(needle) ? 0 : 1;
		if (ap !== bp) return ap - bp;
		return a.riotId.localeCompare(b.riotId);
	});
	await interaction.respond(
		sorted.slice(0, LIMIT).map((e) => ({
			name: clip(team ? e.riotId : `${e.riotId}  ·  ${e.teamName}`),
			value: clip(e.riotId),
		}))
	);
}

export async function handleTeamOrRiotIdAutocomplete(interaction: AutocompleteInteraction<'cached'>): Promise<void> {
	const focused = interaction.options.getFocused(true);
	if (focused.name === 'team') { await suggestTeams(interaction, focused.value); return; }
	if (focused.name === 'riotid') { await suggestRiotIds(interaction, focused.value); return; }
	await interaction.respond([]);
}
