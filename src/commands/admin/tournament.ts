import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { loadStorage, updateStorage } from '../../lib/storage.js';
import type { BotCommand, TournamentMode } from '../../types.js';

const MODE_LABEL: Record<TournamentMode, string> = {
	fearless: '⚔️ Fearless Draft',
	standard: '📊 Standard',
};

const MODE_DESC: Record<TournamentMode, string> = {
	fearless: 'Champions played per team are tracked and locked for future games.',
	standard: 'Only match stats are posted. No champion tracking.',
};

const tournamentCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('tournament')
		.setDescription('Configure and inspect the active tournament.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator)
		.addSubcommand((sub) =>
			sub
				.setName('start')
				.setDescription('Set up a new tournament (name + mode). Does not affect registered teams.')
				.addStringOption((o) => o.setName('name').setDescription('Tournament name shown in status and embeds.').setRequired(true))
				.addStringOption((o) =>
					o.setName('mode')
						.setDescription('fearless = track champion bans per team · standard = stats only')
						.setRequired(true)
						.addChoices(
							{ name: '⚔️ Fearless Draft — track played champions', value: 'fearless' },
							{ name: '📊 Standard — stats only, no champion tracking',  value: 'standard' }
						)
				)
				.addBooleanOption((o) =>
					o.setName('reset_matches')
						.setDescription('Clear all previous match history and Riot tournament codes? (default: false)')
						.setRequired(false)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName('status')
				.setDescription('Show the current tournament configuration and stats.')
		),

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const sub = interaction.options.getSubcommand();

		// ── /tournament start ────────────────────────────────────────────────
		if (sub === 'start') {
			const name        = interaction.options.getString('name', true).trim();
			const mode        = interaction.options.getString('mode', true) as TournamentMode;
			const resetMatches = interaction.options.getBoolean('reset_matches') ?? false;

			await interaction.deferReply();

			await updateStorage((storage) => {
				storage.tournament.name = name;
				storage.tournament.mode = mode;

				if (resetMatches) {
					storage.tournament.matches    = [];
					storage.tournament.providerId  = undefined;
					storage.tournament.tournamentId = undefined;
					storage.scannedMatches         = [];
				}
			});

			const resetNote = resetMatches
				? '\n\n> Match history, scanned matches and Riot tournament codes have been reset.'
				: '';

			await interaction.editReply({
				embeds: [
					makeEmbed(
						'success',
						`Tournament set up — ${name}`,
						`**Mode:** ${MODE_LABEL[mode]}\n${MODE_DESC[mode]}${resetNote}`
					),
				],
			});
			return;
		}

		// ── /tournament status ───────────────────────────────────────────────
		if (sub === 'status') {
			const storage = await loadStorage();
			const { tournament, teams, scannedMatches } = storage;

			const name    = tournament.name ?? '*Not set — use `/tournament start` first.*';
			const mode    = tournament.mode ?? 'fearless';
			const matches = tournament.matches.length;
			const scanned = scannedMatches.length;
			const teamCount = Object.keys(teams).length;
			const playerCount = Object.values(teams).reduce((s, t) => s + t.players.length, 0);
			const riotReady = tournament.tournamentId !== undefined;

			const lines = [
				`**Name**     ${name}`,
				`**Mode**     ${MODE_LABEL[mode]}`,
				``,
				`**Teams**    ${teamCount} registered · ${playerCount} players`,
				`**Matches**  ${matches} started · ${scanned} scanned`,
				`**Riot API** ${riotReady ? `✅ Tournament ID \`${tournament.tournamentId}\`` : '⏳ Initialised on first code request'}`,
			];

			await interaction.reply({
				embeds: [makeEmbed('info', '🏆 Tournament Status', lines.join('\n'))],
			});
		}
	},
};

export default tournamentCommand;
