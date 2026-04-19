import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { suggestTeams } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { formatRiotIdFromAccount, resolveRiotId, RiotApiError } from '../../lib/riot.js';
import { findTeam, updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const addPlayerCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('addplayer')
		.setDescription('Fuegt einen Spieler per Riot-ID zu einem Team hinzu.')
		.addStringOption((o) => o.setName('team').setDescription('Teamname').setRequired(true).setAutocomplete(true))
		.addStringOption((o) => o.setName('riotid').setDescription('Riot-ID im Format Name#Tag').setRequired(true))
		.addUserOption((o) => o.setName('member').setDescription('Optional: Discord-User verknuepfen').setRequired(false))
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
		const riotIdInput = interaction.options.getString('riotid', true);
		const discordUser = interaction.options.getUser('member', false);

		await interaction.deferReply();

		let account;
		try {
			account = await resolveRiotId(riotIdInput);
		} catch (error) {
			const message = error instanceof RiotApiError ? error.message : error instanceof Error ? error.message : 'Unbekannter Fehler';
			await interaction.editReply({ embeds: [makeEmbed('error', 'Riot-ID nicht gefunden', message)] });
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
				await interaction.editReply({ embeds: [makeEmbed('error', 'Team nicht gefunden', `Kein Team mit dem Namen \`${teamName}\`.`)] });
				return;
			case 'already-on-this-team':
				await interaction.editReply({ embeds: [makeEmbed('warning', 'Bereits im Team', `\`${result.riotId}\` ist bereits in \`${result.team.name}\`.`)] });
				return;
			case 'already-on-other-team':
				await interaction.editReply({ embeds: [makeEmbed('error', 'Spieler schon vergeben', `\`${result.riotId}\` ist bereits in \`${result.otherTeam.name}\`.`)] });
				return;
			case 'discord-claimed':
				await interaction.editReply({ embeds: [makeEmbed('error', 'Discord-User schon verknuepft', `Dieser Discord-User ist bereits mit \`${result.claimRiotId}\` in \`${result.claimTeam.name}\` verknuepft.`)] });
				return;
			case 'added': {
				const suffix = result.discordLinked && discordUser ? ` · Discord: <@${discordUser.id}>` : '';
				await interaction.editReply({
					embeds: [makeEmbed('success', 'Spieler hinzugefuegt', `\`${result.riotId}\` → \`${result.team.name}\`${suffix}`)],
				});
			}
		}
	},
};

export default addPlayerCommand;
