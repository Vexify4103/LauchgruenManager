import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { suggestTeams, suggestVerifiedUsers } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, updateStorage } from '../../lib/storage.js';
import type { BotCommand, StoredPlayer } from '../../types.js';

const ROLE_CHOICES: Array<{ name: NonNullable<StoredPlayer['role']>; value: NonNullable<StoredPlayer['role']> }> = [
	{ name: 'Top', value: 'Top' },
	{ name: 'Jungle', value: 'Jungle' },
	{ name: 'Mid', value: 'Mid' },
	{ name: 'Bot', value: 'Bot' },
	{ name: 'Support', value: 'Support' },
	{ name: 'Fill', value: 'Fill' },
	{ name: 'Sub', value: 'Sub' },
];

const setPlayerRoleCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('setplayerrole')
		.setDescription('Changes the role of a player already on a team (for balance adjustments).')
		.addStringOption((o) => o.setName('team').setDescription('Team name').setRequired(true).setAutocomplete(true))
		.addStringOption((o) => o.setName('player').setDescription('Verified player on the team').setRequired(true).setAutocomplete(true))
		.addStringOption((o) =>
			o
				.setName('role')
				.setDescription('New role')
				.setRequired(true)
				.addChoices(...ROLE_CHOICES)
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
		const newRole = interaction.options.getString('role', true) as NonNullable<StoredPlayer['role']>;

		const result = await updateStorage((storage) => {
			const team = findTeam(storage, teamName);
			if (!team) return { kind: 'no-team' as const };
			const player = team.players.find((p) => p.discordId === discordId);
			if (!player) return { kind: 'not-on-team' as const, team };
			const previous = player.role;
			player.role = newRole;
			return { kind: 'updated' as const, team, player, previous };
		});

		switch (result.kind) {
			case 'no-team':
				await interaction.reply({
					embeds: [makeEmbed('error', 'Team not found', `No team named \`${teamName}\`.`)],
					flags: MessageFlags.Ephemeral,
				});
				return;
			case 'not-on-team':
				await interaction.reply({
					embeds: [makeEmbed('error', 'Player not on this team', `<@${discordId}> isn't on \`${result.team.name}\`. Use \`/addplayer\` first.`)],
					flags: MessageFlags.Ephemeral,
				});
				return;
			case 'updated': {
				const prev = result.previous ? `\`${result.previous}\` → ` : '';
				await interaction.reply({
					embeds: [makeEmbed('success', 'Role updated', `<@${discordId}> on \`${result.team.name}\`: ${prev}**${newRole}**`)],
				});
			}
		}
	},
};

export default setPlayerRoleCommand;
