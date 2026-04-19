import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { handleTeamOrRiotIdAutocomplete } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const linkDiscordCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('linkdiscord')
		.setDescription('Verknuepft einen Discord-User mit einem registrierten Spieler.')
		.addStringOption((o) => o.setName('team').setDescription('Teamname').setRequired(true).setAutocomplete(true))
		.addStringOption((o) => o.setName('riotid').setDescription('Riot-ID des Spielers').setRequired(true).setAutocomplete(true))
		.addUserOption((o) => o.setName('member').setDescription('Discord-User').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	autocomplete: handleTeamOrRiotIdAutocomplete,

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Fehlende Rechte', 'Du brauchst `Manage Server` oder `Administrator`.')], flags: MessageFlags.Ephemeral });
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
				await interaction.reply({ embeds: [makeEmbed('error', 'Team nicht gefunden', `Kein Team \`${teamName}\`.`)], flags: MessageFlags.Ephemeral });
				return;
			case 'no-player':
				await interaction.reply({ embeds: [makeEmbed('error', 'Spieler nicht gefunden', `\`${riotId}\` nicht in \`${result.team.name}\`.`)], flags: MessageFlags.Ephemeral });
				return;
			case 'discord-claimed':
				await interaction.reply({ embeds: [makeEmbed('error', 'Discord-User schon vergeben', `<@${discordUser.id}> ist bereits mit \`${result.claimRiotId}\` in \`${result.claimTeam.name}\` verknuepft.`)], flags: MessageFlags.Ephemeral });
				return;
			case 'linked': {
				const prev = result.previous ? ` (vorher: <@${result.previous}>)` : '';
				await interaction.reply({ embeds: [makeEmbed('success', 'Verknuepfung gesetzt', `\`${result.player.riotId}\` → <@${discordUser.id}>${prev}`)] });
			}
		}
	},
};

export default linkDiscordCommand;
