import { PermissionFlagsBits, type ChatInputCommandInteraction, type Role } from 'discord.js';
import { config } from '../config.js';
import { createTournamentEmbed } from './tournamentEmbeds.js';

export async function ensureTournamentRole(interaction: ChatInputCommandInteraction<'cached'>): Promise<Role | null> {
	const role = await interaction.guild.roles.fetch(config.tournamentRoleId);

	if (!role) {
		await interaction.editReply({
			embeds: [
				createTournamentEmbed({
					title: 'Turnierrolle nicht gefunden',
					description: `Die Rolle mit der ID \`${config.tournamentRoleId}\` konnte nicht gefunden werden.`,
					processed: 0,
					total: 0,
					status: 'Fehler',
					summaryLines: ['Bitte pruefe die Rollen-ID in der `.env`.'],
				}),
			],
		});
		return null;
	}

	const botMember = await interaction.guild.members.fetchMe();

	if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
		await interaction.editReply({
			embeds: [
				createTournamentEmbed({
					title: 'Fehlende Berechtigung',
					description: 'Der Bot kann keine Rollen verwalten.',
					processed: 0,
					total: 0,
					status: 'Fehler',
					summaryLines: ['Dem Bot fehlt die Berechtigung `Manage Roles`.'],
				}),
			],
		});
		return null;
	}

	if (botMember.roles.highest.comparePositionTo(role) <= 0) {
		await interaction.editReply({
			embeds: [
				createTournamentEmbed({
					title: 'Rollenhierarchie ungueltig',
					description: 'Die Turnierrolle liegt aktuell ueber oder auf Hoehe der Bot-Rolle.',
					processed: 0,
					total: 0,
					status: 'Fehler',
					summaryLines: ['Die Bot-Rolle muss in Discord ueber der Turnierrolle stehen.'],
				}),
			],
		});
		return null;
	}

	return role;
}
