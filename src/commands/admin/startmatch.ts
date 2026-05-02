import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { config } from '../../config.js';
import { suggestTeams } from '../../lib/autocomplete.js';
import { buildMatchContainer, hasAdminPermission, makeEmbed, v2Message } from '../../lib/embeds.js';
import { findTeam, loadStorage, teamKey, updateStorage } from '../../lib/storage.js';
import type { BotCommand, StoredMatch } from '../../types.js';

const startMatchCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('startmatch')
		.setDescription('Starts a match and posts an embed with tournament code buttons in the matches channel.')
		.addIntegerOption((o) => o.setName('round').setDescription('Round number, e.g. 1').setRequired(true).setMinValue(1))
		.addStringOption((o) => o.setName('team_a').setDescription('First team').setRequired(true).setAutocomplete(true))
		.addStringOption((o) => o.setName('team_b').setDescription('Second team').setRequired(true).setAutocomplete(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused(true);
		if (focused.name === 'team_a' || focused.name === 'team_b') {
			await suggestTeams(interaction, focused.value);
		} else {
			await interaction.respond([]);
		}
	},

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const round = interaction.options.getInteger('round', true);
		const teamAName = interaction.options.getString('team_a', true);
		const teamBName = interaction.options.getString('team_b', true);

		const storage = await loadStorage();
		const teamA = findTeam(storage, teamAName);
		const teamB = findTeam(storage, teamBName);

		if (!teamA) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Team A not found', `No team named \`${teamAName}\`.`)], flags: MessageFlags.Ephemeral });
			return;
		}
		if (!teamB) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Team B not found', `No team named \`${teamBName}\`.`)], flags: MessageFlags.Ephemeral });
			return;
		}
		if (teamA.name === teamB.name) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Same team', 'Team A and Team B cannot be the same.')], flags: MessageFlags.Ephemeral });
			return;
		}

		// Resolve the matches channel
		const channelId = config.matchesChannelId ?? interaction.channelId;
		let targetChannel;
		try {
			targetChannel = await interaction.guild.channels.fetch(channelId);
		} catch {
			targetChannel = null;
		}
		if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Matches channel not found', `Channel \`${channelId}\` not found or not a text channel. Set \`MATCHES_CHANNEL_ID\` in the .env.`)], flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const keyA = teamKey(teamA.name);
		const keyB = teamKey(teamB.name);
		const matchId = `r${round}-${keyA}-vs-${keyB}`;

		// Store the match
		const storedMatch: StoredMatch = {
			id: matchId,
			round,
			teamAKey: keyA,
			teamBKey: keyB,
			channelId,
			createdAt: Date.now(),
		};

		await updateStorage((s) => {
			// Overwrite if same match ID already exists (re-post)
			const idx = s.tournament.matches.findIndex((m) => m.id === matchId);
			if (idx >= 0) s.tournament.matches[idx] = storedMatch;
			else s.tournament.matches.push(storedMatch);
		});

		// Post the match embed
		const container = buildMatchContainer({
			matchId,
			round,
			teamAName: teamA.name,
			teamAKey: keyA,
			teamBName: teamB.name,
			teamBKey: keyB,
		});

		const sentMessage = await targetChannel.send(v2Message(container) as Parameters<typeof targetChannel.send>[0]);

		await updateStorage((s) => {
			const m = s.tournament.matches.find((x) => x.id === matchId);
			if (m) m.messageId = sentMessage.id;
		});

		await interaction.editReply({
			embeds: [makeEmbed('success', 'Match started', `Round ${round}: **${teamA.name}** vs **${teamB.name}**\n📍 Embed posted in <#${channelId}>`)],
		});
	},
};

export default startMatchCommand;
