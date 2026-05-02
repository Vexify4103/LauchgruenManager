import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { suggestTeams } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { formatRiotIdFromAccount, resolveRiotId, RiotApiError } from '../../lib/riot.js';
import { findTeam, updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const addPlayerCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('addplayer')
		.setDescription('Adds a player by Riot ID to a team.')
		.addStringOption((o) => o.setName('team').setDescription('Team name').setRequired(true).setAutocomplete(true))
		.addStringOption((o) => o.setName('riotid').setDescription('Riot ID in the format Name#Tag').setRequired(true))
		.addUserOption((o) => o.setName('member').setDescription('Optional: link a Discord user').setRequired(false))
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
		const riotIdInput = interaction.options.getString('riotid', true);
		const discordUser = interaction.options.getUser('member', false);

		await interaction.deferReply();

		let account;
		try {
			account = await resolveRiotId(riotIdInput);
		} catch (error) {
			const message = error instanceof RiotApiError ? error.message : error instanceof Error ? error.message : 'Unknown error';
			await interaction.editReply({ embeds: [makeEmbed('error', 'Riot ID not found', message)] });
			return;
		}

		const formattedRiotId = formatRiotIdFromAccount(account);

		const result = await updateStorage((storage) => {
			const team = findTeam(storage, teamName);
			if (!team) return { kind: 'no-team' as const };

			for (const t of Object.values(storage.teams)) {
				const existing = t.players.find((p) => p.puuid === account.puuid);
				if (existing) {
					if (t.name === team.name) return { kind: 'already-on-this-team' as const, team, riotId: existing.riotId };
					return { kind: 'already-on-other-team' as const, otherTeam: t, riotId: existing.riotId };
				}
			}

			if (discordUser) {
				for (const t of Object.values(storage.teams)) {
					const claim = t.players.find((p) => p.discordId === discordUser.id);
					if (claim) return { kind: 'discord-claimed' as const, claimTeam: t, claimRiotId: claim.riotId };
				}
			}

			team.players.push({ riotId: formattedRiotId, puuid: account.puuid, ...(discordUser ? { discordId: discordUser.id } : {}) });
			return { kind: 'added' as const, team, riotId: formattedRiotId, discordLinked: Boolean(discordUser) };
		});

		switch (result.kind) {
			case 'no-team':
				await interaction.editReply({ embeds: [makeEmbed('error', 'Team not found', `No team named \`${teamName}\`.`)] });
				return;
			case 'already-on-this-team':
				await interaction.editReply({ embeds: [makeEmbed('warning', 'Already on this team', `\`${result.riotId}\` is already on \`${result.team.name}\`.`)] });
				return;
			case 'already-on-other-team':
				await interaction.editReply({ embeds: [makeEmbed('error', 'Player already taken', `\`${result.riotId}\` is already on \`${result.otherTeam.name}\`.`)] });
				return;
			case 'discord-claimed':
				await interaction.editReply({ embeds: [makeEmbed('error', 'Discord user already linked', `This Discord user is already linked to \`${result.claimRiotId}\` in \`${result.claimTeam.name}\`.`)] });
				return;
			case 'added': {
				const suffix = result.discordLinked && discordUser ? ` · Discord: <@${discordUser.id}>` : '';
				await interaction.editReply({
					embeds: [makeEmbed('success', 'Player added', `\`${result.riotId}\` → \`${result.team.name}\`${suffix}`)],
				});
			}
		}
	},
};

export default addPlayerCommand;
