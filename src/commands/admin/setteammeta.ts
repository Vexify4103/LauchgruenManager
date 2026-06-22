import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { suggestTeams, suggestVerifiedUsers } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, updateStorage } from '../../lib/storage.js';
import { getVerifiedAccountByDiscordId } from '../../lib/verifiedAccounts.js';
import type { BotCommand, TeamCaptain, TeamMeta } from '../../types.js';

/**
 * Curated accent gradients — match the Web app's default palette so admins
 * don't have to memorise Tailwind class strings. The `color` is the dominant
 * Tailwind shade hex (the "from-" colour), used to tint the success embed.
 */
const ACCENTS: Array<{ label: string; tailwind: string; color: number }> = [
	{ label: 'Lime / Emerald', tailwind: 'from-lime-300/24 via-emerald-400/12 to-cyan-400/10', color: 0xbef264 },
	{ label: 'Amber / Orange', tailwind: 'from-amber-300/24 via-orange-400/12 to-emerald-400/10', color: 0xfcd34d },
	{ label: 'Yellow / Lime', tailwind: 'from-yellow-200/22 via-lime-400/12 to-emerald-400/10', color: 0xfef08a },
	{ label: 'Rose / Orange', tailwind: 'from-rose-300/22 via-orange-400/12 to-amber-300/10', color: 0xfda4af },
	{ label: 'Sky / Cyan', tailwind: 'from-sky-300/22 via-cyan-400/12 to-emerald-400/10', color: 0x7dd3fc },
	{ label: 'Fuchsia / Rose', tailwind: 'from-fuchsia-300/18 via-rose-400/10 to-emerald-400/10', color: 0xf0abfc },
	{ label: 'Red / Rose', tailwind: 'from-red-300/22 via-rose-400/12 to-fuchsia-400/10', color: 0xfca5a5 },
	{ label: 'Orange / Red', tailwind: 'from-orange-300/22 via-red-400/12 to-rose-400/10', color: 0xfdba74 },
];

const ACCENT_CHOICES = ACCENTS.map((a) => ({ name: a.label, value: a.tailwind }));

function accentColor(tailwind: string | undefined): number | null {
	if (!tailwind) return null;
	return ACCENTS.find((a) => a.tailwind === tailwind)?.color ?? null;
}

function accentLabel(tailwind: string | undefined): string | null {
	if (!tailwind) return null;
	return ACCENTS.find((a) => a.tailwind === tailwind)?.label ?? null;
}

const setTeamMetaCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('setteammeta')
		.setDescription('Sets the tournament metadata (group, seed, captain, accent) shown on the Web app for a team.')
		.addStringOption((o) => o.setName('team').setDescription('Team name').setRequired(true).setAutocomplete(true))
		.addStringOption((o) =>
			o.setName('group').setDescription('Group letter for the round-robin stage').addChoices({ name: 'Group A', value: 'A' }, { name: 'Group B', value: 'B' })
		)
		.addIntegerOption((o) => o.setName('seed').setDescription('Seed within the group (1–4)').setMinValue(1).setMaxValue(4))
		.addStringOption((o) => o.setName('captain').setDescription('Verified player (autocompletes from web-verified Riot accounts)').setAutocomplete(true))
		.addStringOption((o) =>
			o
				.setName('accent')
				.setDescription('Accent gradient for the team card')
				.addChoices(...ACCENT_CHOICES)
		)
		.addBooleanOption((o) => o.setName('clear').setDescription('Wipe all tournament metadata for this team instead of setting it'))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true);
		if (focused.name === 'team') {
			await suggestTeams(interaction, focused.value);
		} else if (focused.name === 'captain') {
			await suggestVerifiedUsers(interaction, focused.value);
		} else {
			await interaction.respond([]);
		}
	},

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({
				embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const teamName = interaction.options.getString('team', true);
		const group = interaction.options.getString('group') as 'A' | 'B' | null;
		const seed = interaction.options.getInteger('seed');
		const captainDiscordId = interaction.options.getString('captain');
		const accent = interaction.options.getString('accent');
		const clear = interaction.options.getBoolean('clear') ?? false;

		if (!clear && group === null && seed === null && captainDiscordId === null && accent === null) {
			await interaction.reply({
				embeds: [makeEmbed('error', 'Nothing to update', 'Provide at least one of `group`, `seed`, `captain`, `accent` — or set `clear:true` to wipe the metadata.')],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// `clear:true` wipes ALL metadata. Combining it with other fields is
		// almost always a user mistake (we'd silently drop the other inputs).
		if (clear && (group !== null || seed !== null || captainDiscordId !== null || accent !== null)) {
			await interaction.reply({
				embeds: [
					makeEmbed(
						'error',
						'Conflicting options',
						'`clear:true` wipes all metadata — running it together with `group` / `seed` / `captain` / `accent` is ambiguous. Run them in two separate commands: clear first, then set.'
					),
				],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Resolve captain via the Web's verified-Riot collection BEFORE we touch
		// storage, so we can fail fast with a clear error instead of half-writing.
		let captain: TeamCaptain | null = null;
		if (captainDiscordId) {
			const verified = await getVerifiedAccountByDiscordId(captainDiscordId);
			if (!verified) {
				await interaction.reply({
					embeds: [
						makeEmbed(
							'error',
							'Captain not verified',
							`<@${captainDiscordId}> has not verified their Riot account on the Web app. ` +
								`They need to visit \`/tournament/apply\`, sign in with Discord, and complete the profile-icon verification flow first.`
						),
					],
					flags: MessageFlags.Ephemeral,
				});
				return;
			}
			// Try to pull a friendly username from the guild cache; fall back to id.
			const member = interaction.guild?.members.cache.get(verified.discordId);
			const username = member?.user?.username;
			captain = {
				discordId: verified.discordId,
				discordUsername: username,
				riotId: verified.riotId,
				puuid: verified.puuid,
				assignedAt: new Date().toISOString(),
			};
		}

		const result = await updateStorage((storage) => {
			const team = findTeam(storage, teamName);
			if (!team) return { kind: 'no-team' as const };

			if (clear) {
				const removed = team.meta ?? null;
				delete team.meta;
				return { kind: 'cleared' as const, team, removed };
			}

			// Conflict check on (group, seed) slot
			const nextGroup = (group ?? team.meta?.group) as 'A' | 'B' | undefined;
			const nextSeed = seed ?? team.meta?.seed;
			if (nextGroup && nextSeed !== undefined && nextSeed !== null) {
				for (const other of Object.values(storage.teams)) {
					if (other === team) continue;
					if (other.meta?.group === nextGroup && other.meta?.seed === nextSeed) {
						return {
							kind: 'conflict' as const,
							group: nextGroup,
							seed: nextSeed,
							otherTeam: other.name,
						};
					}
				}
			}

			// Conflict check on captain — same discord user can't captain two teams
			if (captain) {
				for (const other of Object.values(storage.teams)) {
					if (other === team) continue;
					if (other.meta?.captain?.discordId === captain.discordId) {
						return {
							kind: 'captain-conflict' as const,
							otherTeam: other.name,
							captainTag: captain.discordUsername ?? captain.discordId,
						};
					}
				}
			}

			const nextMeta: TeamMeta = { ...(team.meta ?? {}) };
			if (group !== null) nextMeta.group = group;
			if (seed !== null) nextMeta.seed = seed ?? undefined;
			if (captain !== null) nextMeta.captain = captain;
			if (accent !== null) nextMeta.accent = accent || undefined;
			team.meta = nextMeta;
			return { kind: 'updated' as const, team, meta: nextMeta };
		});

		switch (result.kind) {
			case 'no-team':
				await interaction.reply({
					embeds: [makeEmbed('error', 'Team not found', `No team named \`${teamName}\`.`)],
					flags: MessageFlags.Ephemeral,
				});
				return;
			case 'conflict':
				await interaction.reply({
					embeds: [
						makeEmbed(
							'error',
							'Seed already taken',
							`Group ${result.group} seed ${result.seed} is already claimed by \`${result.otherTeam}\`. Re-seed that team first, or pick a different slot.`
						),
					],
					flags: MessageFlags.Ephemeral,
				});
				return;
			case 'captain-conflict':
				await interaction.reply({
					embeds: [
						makeEmbed(
							'error',
							'Captain already assigned',
							`**${result.captainTag}** already captains \`${result.otherTeam}\`. Clear that team's captain first if you want to move them.`
						),
					],
					flags: MessageFlags.Ephemeral,
				});
				return;
			case 'cleared': {
				const summary = result.removed ? `Removed: ${formatMeta(result.removed)}` : 'No metadata was set.';
				await interaction.reply({
					embeds: [makeEmbed('success', `Cleared meta for ${result.team.name}`, summary)],
				});
				return;
			}
			case 'updated': {
				const embed = makeEmbed('success', `Updated meta for ${result.team.name}`, formatMeta(result.meta));
				const tint = accentColor(result.meta.accent);
				if (tint !== null) embed.setColor(tint);
				await interaction.reply({ embeds: [embed] });
			}
		}
	},
};

function formatMeta(meta: TeamMeta): string {
	const parts: string[] = [];
	if (meta.group) parts.push(`**Group:** ${meta.group}`);
	if (meta.seed !== undefined) parts.push(`**Seed:** ${meta.seed}`);
	if (meta.captain) {
		parts.push(`**Captain:** <@${meta.captain.discordId}> · \`${meta.captain.riotId}\``);
	}
	if (meta.accent) {
		const label = accentLabel(meta.accent) ?? meta.accent;
		parts.push(`**Accent:** ${label}`);
	}
	return parts.length > 0 ? parts.join('\n') : '_(empty)_';
}

export default setTeamMetaCommand;
