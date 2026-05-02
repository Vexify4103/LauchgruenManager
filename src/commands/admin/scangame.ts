import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type MessageCreateOptions } from 'discord.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { postMatchResult } from '../../lib/matchResult.js';
import { normalizeMatchId } from '../../lib/riot.js';
import { buildScanMessage, scanMatch } from '../../lib/scanner.js';
import type { BotCommand } from '../../types.js';

const scanGameCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('scangame')
		.setDescription('Scans a match and bans played champions (Fearless).')
		.addStringOption((o) => o.setName('id').setDescription('Match ID, e.g. EUW1_1234567890 or just the number').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const rawId = interaction.options.getString('id', true);

		let matchId: string;
		try {
			matchId = normalizeMatchId(rawId);
		} catch (error) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Invalid match ID', error instanceof Error ? error.message : String(error))], flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply();

		const outcome = await scanMatch(matchId);
		const msg = buildScanMessage(outcome, { origin: 'manual' });

		if (!msg) {
			await interaction.editReply({ embeds: [makeEmbed('info', 'Nothing to do', 'This match has already been processed.')] });
			return;
		}

		if ('embeds' in msg && msg.embeds) {
			await interaction.editReply({ embeds: msg.embeds });
		} else if ('components' in msg && msg.components) {
			// Components v2 — editReply accepts components but not IsComponentsV2 flag via editReply;
			// delete the message and re-post as a follow-up instead
			await interaction.deleteReply();
			await interaction.followUp({ components: msg.components, flags: MessageFlags.IsComponentsV2 });
		}

		if (outcome.kind === 'success') {
			console.log(`[scangame] ${outcome.matchId} processed. Teams: ${outcome.teamResults.map((b) => b.team.name).join(', ')}`);
			void postMatchResult(interaction.client, outcome);
		}
	},
};

export default scanGameCommand;
