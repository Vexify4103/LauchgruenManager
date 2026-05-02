import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const resetAllCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('resetall')
		.setDescription('Resets all Fearless lists and scanned matches.')
		.addBooleanOption((o) => o.setName('confirm').setDescription('Are you sure? This cannot be undone.').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		if (!interaction.options.getBoolean('confirm', true)) {
			await interaction.reply({ embeds: [makeEmbed('info', 'Cancelled', 'No reset performed.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const teamCount = await updateStorage((storage) => {
			let count = 0;
			for (const team of Object.values(storage.teams)) {
				team.playedChampions = [];
				count++;
			}
			storage.scannedMatches = [];
			storage.tournament.matches = [];
			return count;
		});

		await interaction.reply({ embeds: [makeEmbed('success', 'Everything reset', `Fearless lists cleared for all ${teamCount} teams, all match data reset.`)] });
	},
};

export default resetAllCommand;
