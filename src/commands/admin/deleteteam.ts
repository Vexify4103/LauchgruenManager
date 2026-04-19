import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { suggestTeams } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, teamKey, updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const deleteTeamCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('deleteteam')
		.setDescription('Loescht ein Team, seinen Voice-Channel und optional die Rolle.')
		.addStringOption((o) => o.setName('team').setDescription('Teamname').setRequired(true).setAutocomplete(true))
		.addBooleanOption((o) => o.setName('delete_role').setDescription('Auch die Discord-Rolle loeschen? (Standard: nein)').setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true);
		if (focused.name === 'team') await suggestTeams(interaction, focused.value);
		else await interaction.respond([]);
	},

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Fehlende Rechte', 'Du brauchst `Manage Server` oder `Administrator`.')], flags: MessageFlags.Ephemeral });
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
			await interaction.reply({ embeds: [makeEmbed('error', 'Team nicht gefunden', `Kein Team mit dem Namen \`${teamName}\`.`)], flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply();

		const { team } = result;
		const lines: string[] = [`Team \`${team.name}\` aus der Datenbank entfernt.`];

		// Delete voice channel
		if (team.voiceChannelId) {
			try {
				const channel = await interaction.guild.channels.fetch(team.voiceChannelId);
				if (channel) {
					await channel.delete(`/deleteteam: ${team.name}`);
					lines.push(`🔊 Voice-Channel gelöscht.`);
				}
			} catch {
				lines.push(`⚠️ Voice-Channel konnte nicht gelöscht werden (bereits weg oder fehlende Rechte).`);
			}
		}

		// Delete role (optional)
		if (deleteRole && team.roleId) {
			try {
				const role = await interaction.guild.roles.fetch(team.roleId);
				if (role) {
					await role.delete(`/deleteteam: ${team.name}`);
					lines.push(`🎭 Rolle gelöscht.`);
				}
			} catch {
				lines.push(`⚠️ Rolle konnte nicht gelöscht werden (bereits weg oder fehlende Rechte).`);
			}
		} else if (team.roleId && !deleteRole) {
			lines.push(`🎭 Rolle <@&${team.roleId}> wurde behalten (delete_role:true zum Löschen).`);
		}

		await interaction.editReply({ embeds: [makeEmbed('success', 'Team gelöscht', lines.join('\n'))] });
	},
};

export default deleteTeamCommand;
