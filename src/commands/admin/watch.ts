import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getAutoscanStatus, runOnePoll, setAutoscanEnabled } from '../../lib/autoscan.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import type { BotCommand } from '../../types.js';

const watchCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('watch')
		.setDescription('Steuert den Auto-Scan (Fearless).')
		.addSubcommand((sub) => sub.setName('status').setDescription('Zeigt den aktuellen Auto-Scan-Status.'))
		.addSubcommand((sub) => sub.setName('start').setDescription('Startet den Auto-Scan.'))
		.addSubcommand((sub) => sub.setName('stop').setDescription('Stoppt den Auto-Scan.'))
		.addSubcommand((sub) => sub.setName('poll').setDescription('Fuehrt manuell einen einzelnen Poll-Durchlauf aus.'))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Fehlende Rechte', 'Du brauchst `Manage Server` oder `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const sub = interaction.options.getSubcommand(true);

		if (sub === 'status') {
			const s = getAutoscanStatus();
			const lines = [
				`**Status:** ${s.running ? '🟢 Laeuft' : '🔴 Gestoppt'}`,
				`**Intervall:** ${s.intervalSec}s`,
				`**Min. Spieler/Team:** ${s.minPlayersPerTeam}`,
				`**Notification Channel:** ${s.channelId ? `<#${s.channelId}>` : '*nicht gesetzt*'}`,
				`**Letzter Poll:** ${s.lastPollAt ? `<t:${Math.floor(s.lastPollAt.getTime() / 1000)}:R>` : '*noch nicht gelaufen*'}`,
				`**Letzter Fehler:** ${s.lastPollError ?? '*keiner*'}`,
			];
			await interaction.reply({ embeds: [makeEmbed('info', '🤖 Auto-Scan Status', lines.join('\n'))], flags: MessageFlags.Ephemeral });
			return;
		}

		if (sub === 'start') {
			setAutoscanEnabled(true, interaction.client);
			await interaction.reply({ embeds: [makeEmbed('success', 'Auto-Scan gestartet', 'Der Bot pollt nun automatisch nach neuen Matches.')], flags: MessageFlags.Ephemeral });
			return;
		}

		if (sub === 'stop') {
			setAutoscanEnabled(false, interaction.client);
			await interaction.reply({ embeds: [makeEmbed('info', 'Auto-Scan gestoppt', 'Polling pausiert.')], flags: MessageFlags.Ephemeral });
			return;
		}

		if (sub === 'poll') {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			const result = await runOnePoll(interaction.client);
			const lines = [
				`**Verarbeitet:** ${result.processed}`,
				`**Neue Matches:** ${result.newMatches.length > 0 ? result.newMatches.join(', ') : '*keine*'}`,
				`**Fehler:** ${result.errors.length > 0 ? result.errors.slice(0, 3).join('\n') : '*keine*'}`,
			];
			await interaction.editReply({ embeds: [makeEmbed('info', 'Poll abgeschlossen', lines.join('\n'))] });
		}
	},
};

export default watchCommand;
