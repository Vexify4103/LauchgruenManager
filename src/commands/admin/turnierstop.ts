import { PermissionFlagsBits, SlashCommandBuilder, type GuildMember } from 'discord.js';
import { config } from '../../config.js';
import { createTournamentEmbed } from '../../lib/tournamentEmbeds.js';
import { ensureTournamentRole } from '../../lib/tournamentRole.js';
import type { BotCommand } from '../../types.js';
import { ROLE_ACTION_DELAY_MS, wait } from '../../utils.js';

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

function buildStopEmbed(
	processed: number,
	total: number,
	results: {
		removed: string[];
		failed: string[];
	},
	status: string,
	description: string
) {
	const detailLines = [formatUserIdList('Fehlgeschlagen', results.failed)].filter(Boolean) as string[];

	return createTournamentEmbed({
		title: 'Turnierstopp',
		description,
		processed,
		total,
		status,
		summaryLines: [
			`Mitglieder mit Turnierrolle gefunden: ${total}`,
			`Bereits verarbeitet: ${processed}/${total}`,
			`Rolle entfernt: ${results.removed.length}`,
			`Fehlgeschlagen: ${results.failed.length}`,
		],
		detailLines,
	});
}

const turnierStopCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('turnier_stop')
		.setDescription('Entfernt die Turnierrolle von allen Mitgliedern im Server.')
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

		const role = await ensureTournamentRole(interaction);

		if (!role) {
			return;
		}

		await interaction.guild.members.fetch();

		const membersWithRole = interaction.guild.members.cache.filter((member) => member.roles.cache.has(role.id));

		if (membersWithRole.size === 0) {
			await interaction.editReply({
				embeds: [
					createTournamentEmbed({
						title: 'Turnierstopp',
						description: 'Aktuell hat niemand die Turnierrolle.',
						processed: 0,
						total: 0,
						status: 'Abgeschlossen',
						summaryLines: ['Es gab nichts zu entfernen.'],
					}),
				],
			});
			return;
		}

		const results = {
			removed: [] as string[],
			failed: [] as string[],
		};

		const members = [...membersWithRole.values()];

		await interaction.editReply({
			embeds: [buildStopEmbed(0, members.length, results, 'Laeuft', 'Die Turnierrolle wird jetzt Schritt fuer Schritt entfernt.')],
		});

		for (const [index, member] of members.entries()) {
			try {
				await member.roles.remove(role);
				results.removed.push(member.id);
			} catch {
				results.failed.push(member.id);
			}

			await interaction.editReply({
				embeds: [
					buildStopEmbed(
						index + 1,
						members.length,
						results,
						index + 1 === members.length ? 'Abgeschlossen' : 'Laeuft',
						index + 1 === members.length
							? 'Die Turnierrolle wurde bei allen gefundenen Mitgliedern verarbeitet.'
							: `Bearbeite Mitglied ${index + 1} von ${members.length}.`
					),
				],
			});

			if (index < members.length - 1) {
				await wait(ROLE_ACTION_DELAY_MS);
			}
		}
	},
};

export default turnierStopCommand;
