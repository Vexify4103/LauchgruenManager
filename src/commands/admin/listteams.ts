import { SlashCommandBuilder } from 'discord.js';
import { buildBannedContainer, makeEmbed, v2Message } from '../../lib/embeds.js';
import { loadStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';
import { ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, MessageFlags } from 'discord.js';

const listTeamsCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('listteams')
		.setDescription('Zeigt alle registrierten Teams und deren Spieler.'),

	async execute(interaction) {
		const storage = await loadStorage();
		const teams = Object.values(storage.teams);

		if (teams.length === 0) {
			await interaction.reply({ embeds: [makeEmbed('info', 'Keine Teams', 'Noch keine Teams angelegt. Nutze `/createteam`.')] });
			return;
		}

		const container = new ContainerBuilder().setAccentColor(0x5865f2);

		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 📋 Teams (${teams.length})`));

		for (const team of teams) {
			container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

			const roleText = team.roleId ? ` · 🎭 <@&${team.roleId}>` : '';
			const vcText = team.voiceChannelId ? ` · 🔊 <#${team.voiceChannelId}>` : '';
			const header = `**${team.name}**${roleText}${vcText}`;

			const players = team.players.length === 0
				? '*Keine Spieler*'
				: team.players.map((p) => `\`${p.riotId}\`${p.discordId ? ` <@${p.discordId}>` : ''}`).join(' · ');

			const bans = team.playedChampions.length > 0 ? `\n🚫 Gesperrt: **${team.playedChampions.length}**` : '';

			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${header}\n${players}${bans}`));
		}

		await interaction.reply({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		});
	},
};

export default listTeamsCommand;
