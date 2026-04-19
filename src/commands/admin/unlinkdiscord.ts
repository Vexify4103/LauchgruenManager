import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { handleTeamOrRiotIdAutocomplete } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const unlinkDiscordCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('unlinkdiscord')
		.setDescription('Entfernt die Discord-Verknuepfung eines Spielers.')
		.addStringOption((o) => o.setName('team').setDescription('Teamname').setRequired(true).setAutocomplete(true))
		.addStringOption((o) => o.setName('riotid').setDescription('Riot-ID des Spielers').setRequired(true).setAutocomplete(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	autocomplete: handleTeamOrRiotIdAutocomplete,

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Fehlende Rechte', 'Du brauchst `Manage Server` oder `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const teamName = interaction.options.getString('team', true);
		const riotId = interaction.options.getString('riotid', true).trim();

		const result = await updateStorage((storage) => {
			const team = findTeam(storage, teamName);
			if (!team) return { kind: 'no-team' as const };

			const player = team.players.find((p) => p.riotId.toLowerCase() === riotId.toLowerCase());
			if (!player) return { kind: 'no-player' as const, team };
			if (!player.discordId) return { kind: 'not-linked' as const, team, riotId: player.riotId };

			const previous = player.discordId;
			delete player.discordId;
			return { kind: 'unlinked' as const, team, riotId: player.riotId, previous };
		});

		switch (result.kind) {
			case 'no-team':
				await interaction.reply({ embeds: [makeEmbed('error', 'Team nicht gefunden', `Kein Team \`${teamName}\`.`)], flags: MessageFlags.Ephemeral });
				return;
			case 'no-player':
				await interaction.reply({ embeds: [makeEmbed('error', 'Spieler nicht gefunden', `\`${riotId}\` nicht in \`${result.team.name}\`.`)], flags: MessageFlags.Ephemeral });
				return;
			case 'not-linked':
				await interaction.reply({ embeds: [makeEmbed('warning', 'Nicht verknuepft', `\`${result.riotId}\` hat keine Discord-Verknuepfung.`)], flags: MessageFlags.Ephemeral });
				return;
			case 'unlinked':
				await interaction.reply({ embeds: [makeEmbed('success', 'Verknuepfung entfernt', `\`${result.riotId}\` ist jetzt von <@${result.previous}> getrennt.`)] });
		}
	},
};

export default unlinkDiscordCommand;
