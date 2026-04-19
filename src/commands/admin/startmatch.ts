import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { config } from '../../config.js';
import { suggestTeams } from '../../lib/autocomplete.js';
import { buildMatchContainer, hasAdminPermission, makeEmbed, v2Message } from '../../lib/embeds.js';
import { findTeam, loadStorage, teamKey, updateStorage } from '../../lib/storage.js';
import type { BotCommand, StoredMatch } from '../../types.js';

const startMatchCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('startmatch')
		.setDescription('Startet ein Match und postet ein Embed mit Tournament-Code-Buttons im Matches-Channel.')
		.addIntegerOption((o) => o.setName('round').setDescription('Rundennummer, z.B. 1').setRequired(true).setMinValue(1))
		.addStringOption((o) => o.setName('team_a').setDescription('Erstes Team').setRequired(true).setAutocomplete(true))
		.addStringOption((o) => o.setName('team_b').setDescription('Zweites Team').setRequired(true).setAutocomplete(true))
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
			await interaction.reply({ embeds: [makeEmbed('error', 'Fehlende Rechte', 'Du brauchst `Manage Server` oder `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const round = interaction.options.getInteger('round', true);
		const teamAName = interaction.options.getString('team_a', true);
		const teamBName = interaction.options.getString('team_b', true);

		const storage = await loadStorage();
		const teamA = findTeam(storage, teamAName);
		const teamB = findTeam(storage, teamBName);

		if (!teamA) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Team A nicht gefunden', `Kein Team namens \`${teamAName}\`.`)], flags: MessageFlags.Ephemeral });
			return;
		}
		if (!teamB) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Team B nicht gefunden', `Kein Team namens \`${teamBName}\`.`)], flags: MessageFlags.Ephemeral });
			return;
		}
		if (teamA.name === teamB.name) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Gleiches Team', 'Team A und Team B duerfen nicht identisch sein.')], flags: MessageFlags.Ephemeral });
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
			await interaction.reply({ embeds: [makeEmbed('error', 'Matches-Channel nicht gefunden', `Channel \`${channelId}\` nicht gefunden oder kein Text-Channel. Setze \`MATCHES_CHANNEL_ID\` in der .env.`)], flags: MessageFlags.Ephemeral });
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
			embeds: [makeEmbed('success', 'Match gestartet', `Runde ${round}: **${teamA.name}** vs **${teamB.name}**\n📍 Embed gepostet in <#${channelId}>`)],
		});
	},
};

export default startMatchCommand;
