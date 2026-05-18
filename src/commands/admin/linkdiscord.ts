import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { handleTeamOrRiotIdAutocomplete } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const linkDiscordCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('linkdiscord')
		.setDescription('Manual override: links a Discord user to a player slot. Prefer /addplayer for verified users.')
		.addStringOption((o) => o.setName('team').setDescription('Team name').setRequired(true).setAutocomplete(true))
		.addStringOption((o) => o.setName('riotid').setDescription("Player's Riot ID").setRequired(true).setAutocomplete(true))
		.addUserOption((o) => o.setName('member').setDescription('Discord user').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	autocomplete: handleTeamOrRiotIdAutocomplete,

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Missing Permissions', 'You need `Manage Server` or `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const teamName = interaction.options.getString('team', true);
		const riotId = interaction.options.getString('riotid', true).trim();
		const discordUser = interaction.options.getUser('member', true);

		const result = await updateStorage((storage) => {
			const team = findTeam(storage, teamName);
			if (!team) return { kind: 'no-team' as const };

			const player = team.players.find((p) => p.riotId.toLowerCase() === riotId.toLowerCase());
			if (!player) return { kind: 'no-player' as const, team };

			// Check if another player is already claiming this discordId
			for (const t of Object.values(storage.teams)) {
				const claim = t.players.find((p) => p.discordId === discordUser.id && p.riotId.toLowerCase() !== riotId.toLowerCase());
				if (claim) return { kind: 'discord-claimed' as const, claimTeam: t, claimRiotId: claim.riotId };
			}

			const previous = player.discordId;
			player.discordId = discordUser.id;
			return { kind: 'linked' as const, team, player, previous };
		});

		switch (result.kind) {
			case 'no-team':
				await interaction.reply({ embeds: [makeEmbed('error', 'Team not found', `No team named \`${teamName}\`.`)], flags: MessageFlags.Ephemeral });
				return;
			case 'no-player':
				await interaction.reply({ embeds: [makeEmbed('error', 'Player not found', `\`${riotId}\` not in \`${result.team.name}\`.`)], flags: MessageFlags.Ephemeral });
				return;
			case 'discord-claimed':
				await interaction.reply({ embeds: [makeEmbed('error', 'Discord user already taken', `<@${discordUser.id}> is already linked to \`${result.claimRiotId}\` in \`${result.claimTeam.name}\`.`)], flags: MessageFlags.Ephemeral });
				return;
			case 'linked': {
				const prev = result.previous ? ` (previously: <@${result.previous}>)` : '';
				await interaction.reply({ embeds: [makeEmbed('success', 'Link set', `\`${result.player.riotId}\` → <@${discordUser.id}>${prev}`)] });
			}
		}
	},
};

export default linkDiscordCommand;
