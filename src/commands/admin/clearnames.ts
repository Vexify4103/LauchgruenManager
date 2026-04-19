import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { delay, ensureNicknamePermissions, ROLE_ACTION_DELAY_MS } from '../../lib/nicknames.js';
import { loadStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const clearNamesCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('clearnames')
		.setDescription('Resets the nicknames of all linked players (all teams) back to their default Discord username.')
		.addBooleanOption((o) => o.setName('confirm').setDescription('Really reset all nicknames?').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		if (!interaction.options.getBoolean('confirm', true)) {
			await interaction.reply({ embeds: [makeEmbed('info', 'Cancelled', 'No nicknames were cleared.')], flags: MessageFlags.Ephemeral });
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
		const stats = { cleared: 0, unchanged: 0, failed: 0 };

		for (const team of Object.values(storage.teams)) {
			for (const player of team.players.filter((p) => p.discordId)) {
				if (!player.discordId) continue;

				// Skip the guild owner — bots can never rename them
				if (player.discordId === interaction.guild.ownerId) {
					stats.failed++;
					continue;
				}

				let member;
				try {
					member = await interaction.guild.members.fetch(player.discordId);
				} catch {
					stats.failed++;
					continue;
				}

				// Skip members the bot cannot rename due to role hierarchy
				if (botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
					stats.failed++;
					continue;
				}

				// Already has no custom nickname — nothing to do
				if (member.nickname === null) {
					stats.unchanged++;
					continue;
				}

				try {
					await member.setNickname(null, `Fearless-Bot: Nickname cleared by clearnames`);
					stats.cleared++;
				} catch {
					stats.failed++;
				}

				await delay(ROLE_ACTION_DELAY_MS);
			}
		}

		const summary = `Cleared: **${stats.cleared}** · Unchanged: **${stats.unchanged}** · Failed: **${stats.failed}**`;
		await interaction.editReply({ embeds: [makeEmbed('success', 'All Nicknames Cleared', summary)] });
	},
};

export default clearNamesCommand;
