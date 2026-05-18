import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { suggestTeams, suggestVerifiedUsers } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, updateStorage } from '../../lib/storage.js';
import { getVerifiedAccountByDiscordId } from '../../lib/verifiedAccounts.js';
import { getApplicationByDiscordId } from '../../lib/applications.js';
import type { BotCommand, StoredPlayer } from '../../types.js';

const ROLE_WHITELIST: ReadonlyArray<NonNullable<StoredPlayer['role']>> = [
	'Top',
	'Jungle',
	'Mid',
	'Bot',
	'Support',
	'Fill',
	'Sub',
];

function pickRole(preferred: string[] | undefined): StoredPlayer['role'] {
	if (!preferred) return undefined;
	const match = preferred.find((r) =>
		ROLE_WHITELIST.some((known) => known.toLowerCase() === r.trim().toLowerCase())
	);
	if (!match) return undefined;
	return ROLE_WHITELIST.find((r) => r.toLowerCase() === match.trim().toLowerCase());
}

const addPlayerCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('addplayer')
		.setDescription('Adds a player to a team using their Riot account verified on the Web app.')
		.addStringOption((o) =>
			o.setName('team').setDescription('Team name').setRequired(true).setAutocomplete(true)
		)
		.addStringOption((o) =>
			o
				.setName('player')
				.setDescription('Verified player (Discord + Riot ID)')
				.setRequired(true)
				.setAutocomplete(true)
		)
		.addStringOption((o) =>
			o
				.setName('role')
				.setDescription('Override role (defaults to the player\'s preferred role from their application)')
				.addChoices(
					...ROLE_WHITELIST.map((r) => ({ name: r, value: r }))
				)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true);
		if (focused.name === 'team') {
			await suggestTeams(interaction, focused.value);
		} else if (focused.name === 'player') {
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
		const discordId = interaction.options.getString('player', true);
		const roleOverride = interaction.options.getString('role') as StoredPlayer['role'] | null;

		await interaction.deferReply();

		const [verified, application] = await Promise.all([
			getVerifiedAccountByDiscordId(discordId),
			getApplicationByDiscordId(discordId),
		]);
		if (!verified) {
			await interaction.editReply({
				embeds: [
					makeEmbed(
						'error',
						'Player not verified',
						'That Discord user does not have a verified Riot account. They need to visit `/tournament/apply` on the Web app, sign in with Discord, and complete the profile-icon verification.'
					),
				],
			});
			return;
		}

		const result = await updateStorage((storage) => {
			const team = findTeam(storage, teamName);
			if (!team) return { kind: 'no-team' as const };

			// Already on a team? (by puuid OR by discordId — both should be unique)
			for (const t of Object.values(storage.teams)) {
				const byPuuid = t.players.find((p) => p.puuid === verified.puuid);
				const byDiscord = t.players.find((p) => p.discordId === verified.discordId);
				const existing = byPuuid ?? byDiscord;
				if (existing) {
					if (t.name === team.name) {
						return { kind: 'already-on-this-team' as const, team, riotId: existing.riotId };
					}
					return { kind: 'already-on-other-team' as const, otherTeam: t, riotId: existing.riotId };
				}
			}

			const role = roleOverride ?? pickRole(application?.preferredRoles);
			team.players.push({
				riotId: verified.riotId,
				puuid: verified.puuid,
				discordId: verified.discordId,
				...(role ? { role } : {}),
			});
			return { kind: 'added' as const, team, role };
		});

		switch (result.kind) {
			case 'no-team':
				await interaction.editReply({
					embeds: [makeEmbed('error', 'Team not found', `No team named \`${teamName}\`.`)],
				});
				return;
			case 'already-on-this-team':
				await interaction.editReply({
					embeds: [
						makeEmbed(
							'warning',
							'Already on this team',
							`\`${result.riotId}\` is already on \`${result.team.name}\`.`
						),
					],
				});
				return;
			case 'already-on-other-team':
				await interaction.editReply({
					embeds: [
						makeEmbed(
							'error',
							'Player already taken',
							`\`${result.riotId}\` is already on \`${result.otherTeam.name}\`.`
						),
					],
				});
				return;
			case 'added': {
				const roleSuffix = result.role ? ` · Role: **${result.role}**` : '';
				await interaction.editReply({
					embeds: [
						makeEmbed(
							'success',
							'Player added',
							`<@${verified.discordId}> · \`${verified.riotId}\` → \`${result.team.name}\`${roleSuffix}`
						),
					],
				});
			}
		}
	},
};

export default addPlayerCommand;
