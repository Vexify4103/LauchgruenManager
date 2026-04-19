import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { handleTeamOrRiotIdAutocomplete } from '../../lib/autocomplete.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { findTeam, updateStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const removePlayerCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('removeplayer')
		.setDescription('Entfernt einen Spieler aus einem Team.')
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

			const idx = team.players.findIndex((p) => p.riotId.toLowerCase() === riotId.toLowerCase());
			if (idx === -1) return { kind: 'not-found' as const, team };

			const [removed] = team.players.splice(idx, 1);
			return { kind: 'removed' as const, team, riotId: removed.riotId };
		});

		switch (result.kind) {
			case 'no-team':
				await interaction.reply({ embeds: [makeEmbed('error', 'Team nicht gefunden', `Kein Team mit dem Namen \`${teamName}\`.`)], flags: MessageFlags.Ephemeral });
				return;
			case 'not-found':
				await interaction.reply({ embeds: [makeEmbed('warning', 'Spieler nicht gefunden', `\`${riotId}\` ist nicht in \`${result.team.name}\`.`)], flags: MessageFlags.Ephemeral });
				return;
			case 'removed':
				await interaction.reply({ embeds: [makeEmbed('success', 'Spieler entfernt', `\`${result.riotId}\` wurde aus \`${result.team.name}\` entfernt.`)] });
		}
	},
};

export default removePlayerCommand;
