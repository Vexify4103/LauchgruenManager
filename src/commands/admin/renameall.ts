import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { delay, ensureNicknamePermissions, renamePlayer, ROLE_ACTION_DELAY_MS } from '../../lib/nicknames.js';
import { getApplicationByDiscordId } from '../../lib/applications.js';
import { loadStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const renameAllCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('renameall')
		.setDescription('Sets the nicknames of all linked players (all teams) to their in-game names.')
		.addBooleanOption((o) => o.setName('confirm').setDescription('Really rename everyone?').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		if (!interaction.options.getBoolean('confirm', true)) {
			await interaction.reply({ embeds: [makeEmbed('info', 'Cancelled', 'No rename performed.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const permError = await ensureNicknamePermissions(interaction.guild);
		if (permError) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Bot Permissions', permError)], flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply();
		const storage = await loadStorage();
		const botMember = await interaction.guild.members.fetchMe();
		const stats = { renamed: 0, unchanged: 0, failed: 0 };

		for (const team of Object.values(storage.teams)) {
			for (const player of team.players.filter((p) => p.discordId)) {
				const [gameName, tagLine] = player.riotId.split('#');
				if (!gameName || !tagLine || !player.discordId) continue;
				const application = await getApplicationByDiscordId(player.discordId);
				const res = await renamePlayer(interaction.guild, botMember, player.riotId, gameName, tagLine, player.discordId, application?.displayName);
				if (res.kind === 'renamed') stats.renamed++;
				else if (res.kind === 'unchanged') stats.unchanged++;
				else stats.failed++;
				await delay(ROLE_ACTION_DELAY_MS);
			}
		}

		const summary = `Renamed: **${stats.renamed}** · Unchanged: **${stats.unchanged}** · Failed: **${stats.failed}**`;
		await interaction.editReply({ embeds: [makeEmbed('success', 'All nicknames set', summary)] });
	},
};

export default renameAllCommand;
