import { PermissionFlagsBits, type ChatInputCommandInteraction, type Role } from 'discord.js';
import { config } from '../config.js';
import { createTournamentEmbed, wrapTournament } from './tournamentEmbeds.js';

export async function ensureTournamentRole(interaction: ChatInputCommandInteraction<'cached'>): Promise<Role | null> {
	const role = await interaction.guild.roles.fetch(config.tournamentRoleId);

	if (!role) {
		await interaction.editReply(
			wrapTournament(createTournamentEmbed({
				title: 'Tournament role not found',
				description: `The role with ID \`${config.tournamentRoleId}\` could not be found.`,
				processed: 0,
				total: 0,
				status: 'Error',
				summaryLines: ['Please check the role ID in the `.env`.'],
			}))
		);
		return null;
	}

	const botMember = await interaction.guild.members.fetchMe();

	if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
		await interaction.editReply(
			wrapTournament(createTournamentEmbed({
				title: 'Missing Permission',
				description: 'The bot cannot manage roles.',
				processed: 0,
				total: 0,
				status: 'Error',
				summaryLines: ['The bot is missing the `Manage Roles` permission.'],
			}))
		);
		return null;
	}

	if (botMember.roles.highest.comparePositionTo(role) <= 0) {
		await interaction.editReply(
			wrapTournament(createTournamentEmbed({
				title: 'Invalid role hierarchy',
				description: 'The tournament role is currently above or at the same level as the bot role.',
				processed: 0,
				total: 0,
				status: 'Error',
				summaryLines: ['The bot role must be above the tournament role in Discord.'],
			}))
		);
		return null;
	}

	return role;
}
