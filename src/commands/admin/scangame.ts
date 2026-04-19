import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type MessageCreateOptions } from 'discord.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { normalizeMatchId } from '../../lib/riot.js';
import { buildScanMessage, scanMatch } from '../../lib/scanner.js';
import type { BotCommand } from '../../types.js';

const scanGameCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('scangame')
		.setDescription('Scannt ein Match und sperrt gespielte Champions (Fearless).')
		.addStringOption((o) => o.setName('id').setDescription('Match-ID, z.B. EUW1_1234567890 oder nur die Zahl').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Fehlende Rechte', 'Du brauchst `Manage Server` oder `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const rawId = interaction.options.getString('id', true);

		let matchId: string;
		try {
			matchId = normalizeMatchId(rawId);
		} catch (error) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Ungueltige Match-ID', error instanceof Error ? error.message : String(error))], flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply();

		const outcome = await scanMatch(matchId);
		const msg = buildScanMessage(outcome, { origin: 'manual' });

		if (!msg) {
			await interaction.editReply({ embeds: [makeEmbed('info', 'Nichts zu tun', 'Das Match wurde bereits verarbeitet.')] });
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
			console.log(`[scangame] ${outcome.matchId} verarbeitet. Teams: ${outcome.teamResults.map((b) => b.team.name).join(', ')}`);
		}
	},
};

export default scanGameCommand;
