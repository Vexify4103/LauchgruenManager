import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { hasAdminPermission, makeEmbed } from '../../lib/embeds.js';
import { delay, ensureNicknamePermissions, renamePlayer, ROLE_ACTION_DELAY_MS } from '../../lib/nicknames.js';
import { loadStorage } from '../../lib/storage.js';
import type { BotCommand } from '../../types.js';

const renameAllCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('renameall')
		.setDescription('Setzt die Nicknames aller verknuepften Spieler (alle Teams) auf deren Ingame-Namen.')
		.addBooleanOption((o) => o.setName('confirm').setDescription('Wirklich alle umbenennen?').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!hasAdminPermission(interaction.member)) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Fehlende Rechte', 'Du brauchst `Manage Server` oder `Administrator`.')], flags: MessageFlags.Ephemeral });
			return;
		}

		if (!interaction.options.getBoolean('confirm', true)) {
			await interaction.reply({ embeds: [makeEmbed('info', 'Abgebrochen', 'Kein Rename durchgefuehrt.')], flags: MessageFlags.Ephemeral });
			return;
		}

		const permError = await ensureNicknamePermissions(interaction.guild);
		if (permError) {
			await interaction.reply({ embeds: [makeEmbed('error', 'Fehlende Bot-Rechte', permError)], flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply();
		const storage = await loadStorage();
		const botMember = await interaction.guild.members.fetchMe();
		const stats = { renamed: 0, unchanged: 0, failed: 0 };

		for (const team of Object.values(storage.teams)) {
			for (const player of team.players.filter((p) => p.discordId)) {
				const [gameName, tagLine] = player.riotId.split('#');
				if (!gameName || !tagLine || !player.discordId) continue;
				const res = await renamePlayer(interaction.guild, botMember, player.riotId, gameName, tagLine, player.discordId);
				if (res.kind === 'renamed') stats.renamed++;
				else if (res.kind === 'unchanged') stats.unchanged++;
				else stats.failed++;
				await delay(ROLE_ACTION_DELAY_MS);
			}
		}

		const summary = `Umbenannt: **${stats.renamed}** · Unveraendert: **${stats.unchanged}** · Fehlgeschlagen: **${stats.failed}**`;
		await interaction.editReply({ embeds: [makeEmbed('success', 'Alle Nicknames gesetzt', summary)] });
	},
};

export default renameAllCommand;
