import { ChannelType, MessageFlags, OverwriteType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { config } from '../../config.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, normalizeTeamName, teamKey, updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const createTeamCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('createteam')
		.setDescription('Legt ein neues Team an, erstellt einen Voice-Channel und verknuepft eine Rolle.')
		.addStringOption((o) => o.setName('name').setDescription('Teamname, z.B. "Team Coinflip"').setRequired(true))
		.addRoleOption((o) => o.setName('role').setDescription('Discord-Rolle der Team-Mitglieder (fuer Channel-Berechtigungen)').setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Fehlende Rechte', 'Du brauchst `Manage Server` oder `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const rawName = interaction.options.getString('name', true);
		const name = normalizeTeamName(rawName);
		if (name.length === 0) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Ungueltiger Name', 'Der Teamname darf nicht leer sein.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const role = interaction.options.getRole('role', false);

		await interaction.deferReply();

		const result = await updateStorage((storage) => {
			const existing = findTeam(storage, name);
			if (existing) return { created: false as const, name: existing.name };
			storage.teams[teamKey(name)] = { name, players: [], playedChampions: [], roleId: role?.id };
			return { created: true as const, name };
		});

		if (!result.created) {
			await interaction.editReply({ embeds: [makeEmbed('warning', 'Team existiert bereits', `Das Team \`${result.name}\` ist bereits angelegt.`)] });
			return;
		}

		// Try to create a voice channel for the team
		let voiceChannelMention = '';
		try {
			const guild = interaction.guild;
			const permissionOverwrites = [
				{ id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
				...(role ? [{ id: role.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }] : []),
			];

			const voiceChannel = await guild.channels.create({
				name,
				type: ChannelType.GuildVoice,
				parent: config.teamVoiceCategoryId,
				permissionOverwrites,
			});

			voiceChannelMention = `\n🔊 Voice-Channel: <#${voiceChannel.id}>`;

			await updateStorage((storage) => {
				const t = storage.teams[teamKey(name)];
				if (t) t.voiceChannelId = voiceChannel.id;
			});
		} catch (error) {
			console.warn(`[createteam] Voice-Channel konnte nicht erstellt werden:`, error);
			voiceChannelMention = '\n⚠️ Voice-Channel konnte nicht erstellt werden (Berechtigungen pruefen).';
		}

		const roleMention = role ? `\n🎭 Rolle: <@&${role.id}>` : '';
		await interaction.editReply({
			embeds: [
				makeEmbed('success', 'Team angelegt', `\`${result.name}\` wurde angelegt.${roleMention}${voiceChannelMention}\n\nJetzt mit \`/addplayer\` Spieler hinzufuegen.`),
			],
		});
	},
};

export default createTeamCommand;
