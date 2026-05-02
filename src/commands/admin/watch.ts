import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getAutoscanStatus, runOnePoll, setAutoscanEnabled } from '../../lib/autoscan.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import type { BotCommand } from '../../types.js';

const watchCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('watch')
		.setDescription('Controls the auto-scan (Fearless).')
		.addSubcommand((sub) => sub.setName('status').setDescription('Shows the current auto-scan status.'))
		.addSubcommand((sub) => sub.setName('start').setDescription('Starts the auto-scan.'))
		.addSubcommand((sub) => sub.setName('stop').setDescription('Stops the auto-scan.'))
		.addSubcommand((sub) => sub.setName('poll').setDescription('Manually runs a single poll cycle.'))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const sub = interaction.options.getSubcommand(true);

		if (sub === 'status') {
			const s = getAutoscanStatus();
			const lines = [
				`**Status:** ${s.running ? '🟢 Running' : '🔴 Stopped'}`,
				`**Interval:** ${s.intervalSec}s`,
				`**Min. players/team:** ${s.minPlayersPerTeam}`,
				`**Notification Channel:** ${s.channelId ? `<#${s.channelId}>` : '*not set*'}`,
				`**Last poll:** ${s.lastPollAt ? `<t:${Math.floor(s.lastPollAt.getTime() / 1000)}:R>` : '*never run*'}`,
				`**Last error:** ${s.lastPollError ?? '*none*'}`,
			];
			await interaction.reply({ embeds: [makeEmbed('info', '🤖 Auto-Scan Status', lines.join('\n'))], flags: MessageFlags.Ephemeral });
			return;
		}

		if (sub === 'start') {
			setAutoscanEnabled(true, interaction.client);
			await interaction.reply({ embeds: [makeEmbed('success', 'Auto-Scan started', 'The bot is now polling automatically for new matches.')], flags: MessageFlags.Ephemeral });
			return;
		}

		if (sub === 'stop') {
			setAutoscanEnabled(false, interaction.client);
			await interaction.reply({ embeds: [makeEmbed('info', 'Auto-Scan stopped', 'Polling paused.')], flags: MessageFlags.Ephemeral });
			return;
		}

		if (sub === 'poll') {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			const result = await runOnePoll(interaction.client);
			const lines = [
				`**Processed:** ${result.processed}`,
				`**New matches:** ${result.newMatches.length > 0 ? result.newMatches.join(', ') : '*none*'}`,
				`**Errors:** ${result.errors.length > 0 ? result.errors.slice(0, 3).join('\n') : '*none*'}`,
			];
			await interaction.editReply({ embeds: [makeEmbed('info', 'Poll completed', lines.join('\n'))] });
		}
	},
};

export default watchCommand;
