import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { suggestTeams } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const resetTeamCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('resetteam')
		.setDescription("Resets a team's Fearless list (clears all banned champions).")
		.addStringOption((o) => o.setName('team').setDescription('Team name').setRequired(true).setAutocomplete(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true);
		if (focused.name === 'team') await suggestTeams(interaction, focused.value);
		else await interaction.respond([]);
	},

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const teamName = interaction.options.getString('team', true);

		const result = await updateStorage((storage) => {
			const team = findTeam(storage, teamName);
			if (!team) return { kind: 'no-team' as const };
			const count = team.playedChampions.length;
			team.playedChampions = [];
			return { kind: 'reset' as const, team, count };
		});

		if (result.kind === 'no-team') {
			await interaction.reply({ embeds: [makeEmbed('error', 'Team not found', `No team named \`${teamName}\`.`)], flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.reply({ embeds: [makeEmbed('success', 'List reset', `Fearless list for \`${result.team.name}\` cleared (${result.count} champions removed).`)] });
	},
};

export default resetTeamCommand;
