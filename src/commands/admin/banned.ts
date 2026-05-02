import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { suggestTeams } from '../../lib/autocomplete.js';
import { buildBannedContainer, makeEmbed, v2Reply } from '../../lib/embeds.js';
import { findTeam, loadStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const bannedCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('banned')
		.setDescription('Shows all banned champions of a team (Fearless list).')
		.addStringOption((o) => o.setName('team').setDescription('Team name').setRequired(true).setAutocomplete(true)),

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true);
		if (focused.name === 'team') await suggestTeams(interaction, focused.value);
		else await interaction.respond([]);
	},

	async execute(interaction) {
		const teamName = interaction.options.getString('team', true);
		const storage = await loadStorage();
		const team = findTeam(storage, teamName);

		if (!team) {
			await interaction.reply({
				embeds: [makeEmbed('error', 'Team not found', `No team named \`${teamName}\`.`)],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await interaction.reply(v2Reply(buildBannedContainer(team.name, team.players.length, team.playedChampions)));
	},
};

export default bannedCommand;
