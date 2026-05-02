import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { handleTeamOrRiotIdAutocomplete } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const removePlayerCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('removeplayer')
		.setDescription('Removes a player from a team.')
		.addStringOption((o) => o.setName('team').setDescription('Team name').setRequired(true).setAutocomplete(true))
		.addStringOption((o) => o.setName('riotid').setDescription("Player's Riot ID").setRequired(true).setAutocomplete(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	autocomplete: handleTeamOrRiotIdAutocomplete,

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const teamName = interaction.options.getString('team', true);
		const riotId = interaction.options.getString('riotid', true).trim();

		const result = await updateStorage((storage) => {
			const team = findTeam(storage, teamName);
			if (!team) return { kind: 'no-team' as const };

			const idx = team.players.findIndex((p) => p.riotId.toLowerCase() === riotId.toLowerCase());
			if (idx === -1) return { kind: 'not-found' as const, team };

			const [removed] = team.players.splice(idx, 1);
			return { kind: 'removed' as const, team, riotId: removed.riotId };
		});

		switch (result.kind) {
			case 'no-team':
				await interaction.reply({ embeds: [makeEmbed('error', 'Team not found', `No team named \`${teamName}\`.`)], flags: MessageFlags.Ephemeral });
				return;
			case 'not-found':
				await interaction.reply({ embeds: [makeEmbed('warning', 'Player not found', `\`${riotId}\` is not on \`${result.team.name}\`.`)], flags: MessageFlags.Ephemeral });
				return;
			case 'removed':
				await interaction.reply({ embeds: [makeEmbed('success', 'Player removed', `\`${result.riotId}\` has been removed from \`${result.team.name}\`.`)] });
		}
	},
};

export default removePlayerCommand;
