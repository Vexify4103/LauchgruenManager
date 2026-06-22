import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const setupQueueCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('setupqueue')
		.setDescription('Set the voice channel that acts as a waiting queue (members get numbered automatically).')
		.addChannelOption((o) => o.setName('channel').setDescription('The voice channel to monitor as waiting queue').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({
				embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const channel = interaction.options.getChannel('channel', true);

		await updateStorage((storage) => {
			storage.waitingQueue = { channelId: channel.id, entries: [] };
		});

		await interaction.reply({
			embeds: [
				makeEmbed(
					'success',
					'Queue configured',
					`<#${channel.id}> is now the waiting queue.\n\nMembers who join are renamed **#1 | Name**, **#2 | Name**, etc. Their original nickname is restored when they leave.`
				),
			],
		});
	},
};

export default setupQueueCommand;
