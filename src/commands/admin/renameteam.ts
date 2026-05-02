import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { suggestTeams } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { delay, ensureNicknamePermissions, renamePlayer, ROLE_ACTION_DELAY_MS } from '../../lib/nicknames.js';
import { findTeam, loadStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const renameTeamCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('renameteam')
		.setDescription('Sets the Discord nicknames of all linked players in a team to their in-game names.')
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
		const storage = await loadStorage();
		const team = findTeam(storage, teamName);

		if (!team) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Team not found', `No team named \`${teamName}\`.`)], flags: MessageFlags.Ephemeral });
			return;
		}

		const permError = await ensureNicknamePermissions(interaction.guild);
		if (permError) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Bot Permissions', permError)], flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply();
		const botMember = await interaction.guild.members.fetchMe();
		const linked = team.players.filter((p) => p.discordId);

		if (linked.length === 0) {
			await interaction.editReply({ embeds: [makeEmbed('info', 'Nothing to do', 'No player in this team has a Discord link.')] });
			return;
		}

		const stats = { renamed: 0, unchanged: 0, failed: 0, skipped: 0 };
		for (const player of linked) {
			const [gameName, tagLine] = player.riotId.split('#');
			if (!gameName || !tagLine || !player.discordId) { stats.skipped++; continue; }
			const res = await renamePlayer(interaction.guild, botMember, player.riotId, gameName, tagLine, player.discordId);
			if (res.kind === 'renamed') stats.renamed++;
			else if (res.kind === 'unchanged') stats.unchanged++;
			else stats.failed++;
			await delay(ROLE_ACTION_DELAY_MS);
		}

		const summary = `Renamed: **${stats.renamed}** · Unchanged: **${stats.unchanged}** · Failed: **${stats.failed}**`;
		await interaction.editReply({ embeds: [makeEmbed('success', `Nicknames: ${team.name}`, summary)] });
	},
};

export default renameTeamCommand;
