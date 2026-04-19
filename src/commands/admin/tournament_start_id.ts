import { PermissionFlagsBits, SlashCommandBuilder, type GuildMember } from 'discord.js';
import { config } from '../../config.js';
import { createTournamentEmbed, wrapTournament } from '../../lib/tournamentEmbeds.js';
import { ensureTournamentRole } from '../../lib/tournamentRole.js';
import type { BotCommand } from '../../types.js';
import { extractDiscordUserIds, loadRoleListInput, ROLE_ACTION_DELAY_MS, wait } from '../../utils.js';

function hasCommandPermission(member: GuildMember): boolean {
	return member.permissions.has(PermissionFlagsBits.ManageGuild) || member.permissions.has(PermissionFlagsBits.Administrator);
}

function formatUserIdList(label: string, userIds: string[]): string | null {
	if (userIds.length === 0) {
		return null;
	}

	const preview = userIds.slice(0, 20).join(', ');
	const suffix = userIds.length > 20 ? ` ... (+${userIds.length - 20} weitere)` : '';

	return `${label}: ${preview}${suffix}`;
}

function buildStartEmbed(
	processed: number,
	total: number,
	results: {
		added: string[];
		alreadyHadRole: string[];
		notFound: string[];
		failed: string[];
	},
	status: string,
	description: string
) {
	const detailLines = [formatUserIdList('Nicht gefunden', results.notFound), formatUserIdList('Fehlgeschlagen', results.failed)].filter(Boolean) as string[];

	return createTournamentEmbed({
		title: 'Tournament Start',
		description,
		processed,
		total,
		status,
		summaryLines: [
			`Verarbeitete IDs: ${processed}/${total}`,
			`Rolle vergeben: ${results.added.length}`,
			`Rolle bereits vorhanden: ${results.alreadyHadRole.length}`,
			`Nicht im Server gefunden: ${results.notFound.length}`,
			`Fehlgeschlagen: ${results.failed.length}`,
		],
		detailLines,
	});
}

const tournamentStartCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('tournament_start_id')
		.setDescription('Vergibt die Turnierrolle an alle User-IDs aus der Rollenliste.')
		.addStringOption((option) => option.setName('user_id_list').setDescription('Direkter Text oder ein Sourcebin-/Paste-Link mit den User-IDs').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (interaction.guildId !== config.guildId) {
			await interaction.reply(
				wrapTournament(createTournamentEmbed({
					title: 'Falscher Server',
					description: 'Dieser Bot ist nur fuer den konfigurierten Server aktiv.',
					processed: 0,
					total: 0,
					status: 'Abgebrochen',
					summaryLines: ['Der Command kann hier nicht verwendet werden.'],
				}))
			);
			return;
		}

		if (!hasCommandPermission(interaction.member)) {
			await interaction.reply(
				wrapTournament(createTournamentEmbed({
					title: 'Fehlende Rechte',
					description: 'Du darfst diesen Command nicht ausfuehren.',
					processed: 0,
					total: 0,
					status: 'Abgebrochen',
					summaryLines: ['Du brauchst `Manage Server` oder `Administrator`.'],
				}))
			);
			return;
		}

		await interaction.deferReply();

		const userListInput = interaction.options.getString('user_id_liste', true);

		try {
			const content = await loadRoleListInput(userListInput);
			const userIds = extractDiscordUserIds(content);

			if (userIds.length === 0) {
				await interaction.editReply(
					wrapTournament(createTournamentEmbed({
						title: 'Tournament Start',
						description: 'Es wurden keine gueltigen Discord-User-IDs gefunden.',
						processed: 0,
						total: 0,
						status: 'Abgebrochen',
						summaryLines: ['Bitte pruefe den Inhalt von `roleliste`.'],
					}))
				);
				return;
			}

			const role = await ensureTournamentRole(interaction);

			if (!role) {
				return;
			}

			const results = {
				added: [] as string[],
				alreadyHadRole: [] as string[],
				notFound: [] as string[],
				failed: [] as string[],
			};

			await interaction.editReply(wrapTournament(buildStartEmbed(0, userIds.length, results, 'Laeuft', 'Die Turnierrolle wird jetzt Schritt fuer Schritt vergeben.')));

			for (const [index, userId] of userIds.entries()) {
				try {
					const member = await interaction.guild.members.fetch(userId);

					if (member.roles.cache.has(role.id)) {
						results.alreadyHadRole.push(userId);
					} else {
						await member.roles.add(role);
						results.added.push(userId);
					}
				} catch (error) {
					const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

					if (message.includes('unknown member') || message.includes('not found') || message.includes('invalid form body')) {
						results.notFound.push(userId);
					} else {
						results.failed.push(userId);
					}
				}

				const isLast = index + 1 === userIds.length;
				await interaction.editReply(
					wrapTournament(buildStartEmbed(
						index + 1,
						userIds.length,
						results,
						isLast ? 'Abgeschlossen' : 'Läuft',
						isLast ? 'Die Turnierrolle wurde fuer alle Eintraege verarbeitet.' : `Bearbeite Eintrag ${index + 1} von ${userIds.length}.`
					))
				);

				if (index < userIds.length - 1) {
					await wait(ROLE_ACTION_DELAY_MS);
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unbekannter Fehler';

			await interaction.editReply(
				wrapTournament(createTournamentEmbed({
					title: 'Tournament Start fehlgeschlagen',
					description: 'Beim Verarbeiten der Rollenliste ist ein Fehler aufgetreten.',
					processed: 0,
					total: 0,
					status: 'Fehler',
					summaryLines: [`Fehlermeldung: ${message}`],
				}))
			);
		}
	},
};

export default tournamentStartCommand;
