import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { suggestTeams } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, teamKey, updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const deleteTeamCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('deleteteam')
		.setDescription('Deletes a team, its channels, and optionally the role.')
		.addStringOption((o) => o.setName('team').setDescription('Team name').setRequired(true).setAutocomplete(true))
		.addBooleanOption((o) => o.setName('delete_role').setDescription('Also delete the Discord role? (default: no)').setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true);
		if (focused.name === 'team') await suggestTeams(interaction, focused.value);
		else await interaction.respond([]);
	},

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const teamName = interaction.options.getString('team', true);
		const deleteRole = interaction.options.getBoolean('delete_role', false) ?? false;

		const result = await updateStorage((storage) => {
			const team = findTeam(storage, teamName);
			if (!team) return { kind: 'no-team' as const };
			const key = teamKey(team.name);
			delete storage.teams[key];
			return { kind: 'deleted' as const, team };
		});

		if (result.kind === 'no-team') {
			await interaction.reply({ embeds: [makeEmbed('error', 'Team not found', `No team named \`${teamName}\`.`)], flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply();

		const { team } = result;
		const lines: string[] = [`Team \`${team.name}\` removed from the database.`];

		if (team.textChannelId) {
			try {
				const channel = await interaction.guild.channels.fetch(team.textChannelId);
				if (channel) {
					await channel.delete(`/deleteteam: ${team.name}`);
					lines.push('Text channel deleted.');
				}
			} catch {
				lines.push('Text channel could not be deleted (already gone or missing permissions).');
			}
		}

		// Delete voice channel
		if (team.voiceChannelId) {
			try {
				const channel = await interaction.guild.channels.fetch(team.voiceChannelId);
				if (channel) {
					await channel.delete(`/deleteteam: ${team.name}`);
					lines.push(`🔊 Voice channel deleted.`);
				}
			} catch {
				lines.push(`⚠️ Voice channel could not be deleted (already gone or missing permissions).`);
			}
		}

		// Delete role (optional)
		if (deleteRole && team.roleId) {
			try {
				const role = await interaction.guild.roles.fetch(team.roleId);
				if (role) {
					await role.delete(`/deleteteam: ${team.name}`);
					lines.push(`🎭 Role deleted.`);
				}
			} catch {
				lines.push(`⚠️ Role could not be deleted (already gone or missing permissions).`);
			}
		} else if (team.roleId && !deleteRole) {
			lines.push(`🎭 Role <@&${team.roleId}> kept (pass delete_role:true to delete it).`);
		}

		await interaction.editReply({ embeds: [makeEmbed('success', 'Team deleted', lines.join('\n'))] });
	},
};

export default deleteTeamCommand;
