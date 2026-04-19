import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { suggestTeams } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const resetTeamCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('resetteam')
		.setDescription('Setzt die Fearless-Liste eines Teams zurueck (loescht alle gesperrten Champions).')
		.addStringOption((o) => o.setName('team').setDescription('Teamname').setRequired(true).setAutocomplete(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true);
		if (focused.name === 'team') await suggestTeams(interaction, focused.value);
		else await interaction.respond([]);
	},

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Fehlende Rechte', 'Du brauchst `Manage Server` oder `Administrator`.')], flags: MessageFlags.Ephemeral });
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
			await interaction.reply({ embeds: [makeEmbed('error', 'Team nicht gefunden', `Kein Team \`${teamName}\`.`)], flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.reply({ embeds: [makeEmbed('success', 'Liste zurueckgesetzt', `Fearless-Liste von \`${result.team.name}\` geleert (${result.count} Champions entfernt).`)] });
	},
};

export default resetTeamCommand;
