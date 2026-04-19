import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const resetAllCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('resetall')
		.setDescription('Setzt alle Fearless-Listen und gescannten Matches zurueck.')
		.addBooleanOption((o) => o.setName('confirm').setDescription('Sicher? Das kann nicht rueckgaengig gemacht werden.').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Fehlende Rechte', 'Du brauchst `Manage Server` oder `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		if (!interaction.options.getBoolean('confirm', true)) {
			await interaction.reply({ embeds: [makeEmbed('info', 'Abgebrochen', 'Kein Reset durchgefuehrt.')], flags: MessageFlags.Ephemeral });
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

		await interaction.reply({ embeds: [makeEmbed('success', 'Alles zurueckgesetzt', `Fearless-Listen aller ${teamCount} Teams geleert, alle Matches-Daten zurueckgesetzt.`)] });
	},
};

export default resetAllCommand;
