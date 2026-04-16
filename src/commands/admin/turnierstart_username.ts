import { PermissionFlagsBits, SlashCommandBuilder, type GuildMember } from 'discord.js';
import { config } from '../../config.js';
import { createTournamentEmbed } from '../../lib/tournamentEmbeds.js';
import { ensureTournamentRole } from '../../lib/tournamentRole.js';
import type { BotCommand } from '../../types.js';
import { extractDiscordUsernames, loadRoleListInput, ROLE_ACTION_DELAY_MS, wait } from '../../utils.js';

function hasCommandPermission(member: GuildMember): boolean {
	return member.permissions.has(PermissionFlagsBits.ManageGuild) || member.permissions.has(PermissionFlagsBits.Administrator);
}

function formatList(label: string, items: string[]): string | null {
	if (items.length === 0) return null;
	const preview = items.slice(0, 20).join(', ');
	const suffix = items.length > 20 ? ` ... (+${items.length - 20} weitere)` : '';
	return `${label}: ${preview}${suffix}`;
}

const turnierStartUsernameCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('turnier_start_username')
		.setDescription('Vergibt die Turnierrolle anhand von Discord-Usernamen.')
		.addStringOption((option) => option.setName('user_name_liste').setDescription('Usernamen (eine pro Zeile, Komma- oder Semikolon-getrennt) oder Link').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (interaction.guildId !== config.guildId) {
			await interaction.reply({
				embeds: [
					createTournamentEmbed({
						title: 'Falscher Server',
						description: 'Dieser Bot ist nur fuer den konfigurierten Server aktiv.',
						processed: 0,
						total: 0,
						status: 'Abgebrochen',
						summaryLines: ['Der Command kann hier nicht verwendet werden.'],
					}),
				],
			});
			return;
		}

		if (!hasCommandPermission(interaction.member)) {
			await interaction.reply({
				embeds: [
					createTournamentEmbed({
						title: 'Fehlende Rechte',
						description: 'Du darfst diesen Command nicht ausfuehren.',
						processed: 0,
						total: 0,
						status: 'Abgebrochen',
						summaryLines: ['Du brauchst `Manage Server` oder `Administrator`.'],
					}),
				],
			});
			return;
		}

		await interaction.deferReply();

		const userListInput = interaction.options.getString('user_name_liste', true);

		try {
			const content = await loadRoleListInput(userListInput);
			const usernames = extractDiscordUsernames(content);

			if (usernames.length === 0) {
				await interaction.editReply({
					embeds: [
						createTournamentEmbed({
							title: 'Turnier Start (Username)',
							description: 'Es wurden keine gueltigen Discord-Usernamen gefunden.',
							processed: 0,
							total: 0,
							status: 'Abgebrochen',
							summaryLines: ['Bitte pruefe den Inhalt von `roleliste`.'],
						}),
					],
				});
				return;
			}

			const role = await ensureTournamentRole(interaction);
			if (!role) return;

			// Fetch all members once — requires GuildMembers privileged intent
			await interaction.editReply({
				embeds: [
					createTournamentEmbed({
						title: 'Turnier Start (Username)',
						description: 'Lade Servermitglieder...',
						processed: 0,
						total: usernames.length,
						status: 'Vorbereitung',
						summaryLines: ['Mitgliederliste wird vom Server abgerufen.'],
					}),
				],
			});

			const allMembers = await interaction.guild.members.fetch();
			// Build a lowercase username → member map
			const memberMap = new Map(allMembers.map((m) => [m.user.username.toLowerCase(), m]));

			const results = {
				added: [] as string[],
				alreadyHadRole: [] as string[],
				notFound: [] as string[],
				failed: [] as string[],
			};

			for (const [index, username] of usernames.entries()) {
				const member = memberMap.get(username);

				if (!member) {
					results.notFound.push(username);
				} else {
					try {
						if (member.roles.cache.has(role.id)) {
							results.alreadyHadRole.push(username);
						} else {
							await member.roles.add(role);
							results.added.push(username);
						}
					} catch {
						results.failed.push(username);
					}
				}

				const isLast = index + 1 === usernames.length;
				const detailLines = [formatList('Nicht gefunden', results.notFound), formatList('Fehlgeschlagen', results.failed)].filter(Boolean) as string[];

				await interaction.editReply({
					embeds: [
						createTournamentEmbed({
							title: 'Turnier Start (Username)',
							description: isLast ? 'Die Turnierrolle wurde fuer alle Eintraege verarbeitet.' : `Bearbeite Eintrag ${index + 1} von ${usernames.length}.`,
							processed: index + 1,
							total: usernames.length,
							status: isLast ? 'Abgeschlossen' : 'Laeuft',
							summaryLines: [
								`Verarbeitete Usernamen: ${index + 1}/${usernames.length}`,
								`Rolle vergeben: ${results.added.length}`,
								`Rolle bereits vorhanden: ${results.alreadyHadRole.length}`,
								`Nicht im Server gefunden: ${results.notFound.length}`,
								`Fehlgeschlagen: ${results.failed.length}`,
							],
							detailLines,
						}),
					],
				});

				const madeApiCall = !results.notFound.includes(username) && !results.alreadyHadRole.includes(username);
				if (!isLast && madeApiCall) await wait(ROLE_ACTION_DELAY_MS);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
			await interaction.editReply({
				embeds: [
					createTournamentEmbed({
						title: 'Turnier Start fehlgeschlagen',
						description: 'Beim Verarbeiten der Usernamen ist ein Fehler aufgetreten.',
						processed: 0,
						total: 0,
						status: 'Fehler',
						summaryLines: [`Fehlermeldung: ${message}`],
					}),
				],
			});
		}
	},
};

export default turnierStartUsernameCommand;
