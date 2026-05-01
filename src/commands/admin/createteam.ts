import { ChannelType, MessageFlags, OverwriteType, PermissionFlagsBits, SlashCommandBuilder, type Role } from 'discord.js';
import { config } from '../../config.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, normalizeTeamName, teamKey, updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const createTeamCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('createteam')
		.setDescription('Creates a new team, a voice channel, and links or creates a Discord role.')
		.addStringOption((o) => o.setName('name').setDescription('Team name, e.g. "Team Coinflip"').setRequired(true))
		.addBooleanOption((o) => o.setName('create_role').setDescription('Automatically create a new Discord role named after the team (default: false)').setRequired(false))
		.addRoleOption((o) => o.setName('role').setDescription('Link an already existing Discord role instead of creating one').setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const rawName = interaction.options.getString('name', true);
		const name = normalizeTeamName(rawName);
		if (name.length === 0) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Invalid Name', 'The team name cannot be empty.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const existingRole = interaction.options.getRole('role', false);
		const shouldCreateRole = interaction.options.getBoolean('create_role') ?? false;

		await interaction.deferReply();

		// Resolve the role: existing role takes priority, then auto-create if requested
		let role: Role | null = existingRole as Role | null;
		let roleNote = '';

		if (!role && shouldCreateRole) {
			try {
				role = await interaction.guild.roles.create({
					name,
					reason: `LauchManager: auto-created for team "${name}"`,
				});
				roleNote = ' (new)';
			} catch (error) {
				console.warn(`[createteam] Role could not be created:`, error);
				await interaction.editReply({ embeds: [makeEmbed('error', 'Role Creation Failed', 'The bot could not create the role — make sure it has the `Manage Roles` permission.')] });
				return;
			}
		}

		const result = await updateStorage((storage) => {
			const existing = findTeam(storage, name);
			if (existing) return { created: false as const, name: existing.name };
			storage.teams[teamKey(name)] = { name, players: [], playedChampions: [], roleId: role?.id };
			return { created: true as const, name };
		});

		if (!result.created) {
			// Roll back the freshly created role since the team already exists
			if (roleNote && role) await role.delete('LauchManager: team already existed, rolling back').catch(() => null);
			await interaction.editReply({ embeds: [makeEmbed('warning', 'Team already exists', `The team \`${result.name}\` is already registered.`)] });
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

			voiceChannelMention = `\n🔊 Voice channel: <#${voiceChannel.id}>`;

			await updateStorage((storage) => {
				const t = storage.teams[teamKey(name)];
				if (t) t.voiceChannelId = voiceChannel.id;
			});
		} catch (error) {
			console.warn(`[createteam] Voice channel could not be created:`, error);
			voiceChannelMention = '\n⚠️ Voice channel could not be created — check bot permissions.';
		}

		const roleMention = role ? `\n🎭 Role: <@&${role.id}>${roleNote}` : '';
		await interaction.editReply({
			embeds: [
				makeEmbed('success', 'Team created', `\`${result.name}\` has been set up.${roleMention}${voiceChannelMention}\n\nAdd players with \`/addplayer\`.`),
			],
		});
	},
};

export default createTeamCommand;
