import { MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { buildMatchContainer, makeEmbed } from '../lib/embeds.js';
import { logCommand } from '../lib/logger.js';
import { loadStorage } from '../lib/storage.js';
import { getOrCreateMatchCode } from '../lib/tournamentCodes.js';
import type { BotEvent } from '../types.js';

const interactionCreateEvent: BotEvent<'interactionCreate'> = {
	name: 'interactionCreate',
	async execute(client, interaction) {
		// ── Autocomplete ──────────────────────────────────────────────────────
		if (interaction.isAutocomplete()) {
			if (!interaction.inCachedGuild()) return;
			const command = client.commands.get(interaction.commandName);
			if (!command?.autocomplete) {
				try { await interaction.respond([]); } catch { /* expired */ }
				return;
			}
			try {
				await command.autocomplete(interaction);
			} catch (err) {
				console.error(`[autocomplete] /${interaction.commandName}:`, err);
				try { await interaction.respond([]); } catch { /* expired */ }
			}
			return;
		}

		// ── Buttons ───────────────────────────────────────────────────────────
		if (interaction.isButton()) {
			if (!interaction.inCachedGuild()) return;

			const parts = interaction.customId.split(':');
			if (parts[0] !== 'fearless' || parts[1] !== 'code') return;

			const matchId = parts[2];
			const teamKey = parts.slice(3).join(':'); // team keys can contain colons
			if (!matchId || !teamKey) return;

			// Check captain role
			if (!interaction.member.roles.cache.has(config.captainRoleId)) {
				await interaction.reply({
					embeds: [makeEmbed('error', 'Keine Berechtigung', 'Nur Team-Captains können den Tournament Code abrufen.')],
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const storage = await loadStorage();
			const match = storage.tournament.matches.find((m) => m.id === matchId);
			if (!match) {
				await interaction.reply({
					embeds: [makeEmbed('error', 'Match nicht gefunden', `Match \`${matchId}\` ist nicht in der Datenbank.`)],
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			// Optional: verify user belongs to the clicked team (only if team has linked players)
			const clickedTeam = Object.values(storage.teams).find((t) => t.name.toLowerCase() === teamKey);
			if (clickedTeam) {
				const hasLinkedPlayers = clickedTeam.players.some((p) => p.discordId);
				const isInTeam = clickedTeam.players.some((p) => p.discordId === interaction.user.id);
				if (hasLinkedPlayers && !isInTeam) {
					await interaction.reply({
						embeds: [makeEmbed('error', 'Falsches Team', `Du bist nicht als Spieler in **${clickedTeam.name}** eingetragen.`)],
						flags: MessageFlags.Ephemeral,
					});
					return;
				}
			}

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			try {
				const teamA = Object.values(storage.teams).find((t) => t.name.toLowerCase() === match.teamAKey);
				const teamB = Object.values(storage.teams).find((t) => t.name.toLowerCase() === match.teamBKey);

				const allowedPuuids: string[] = [];
				if (teamA) allowedPuuids.push(...teamA.players.map((p) => p.puuid));
				if (teamB) allowedPuuids.push(...teamB.players.map((p) => p.puuid));

				const code = await getOrCreateMatchCode(matchId, allowedPuuids);

				const teamDisplay = clickedTeam?.name ?? teamKey;
				await interaction.editReply({
					embeds: [
						makeEmbed(
							'success',
							'🏆 Tournament Code',
							`**${teamDisplay}** — Runde ${match.round}\n\n\`\`\`\n${code}\n\`\`\`\n*Im League-Client: Custom Game → Tournament Code eingeben.*`
						),
					],
				});

				// Update the public match embed to show code was claimed
				if (match.messageId && match.channelId) {
					try {
						const channel = await interaction.guild.channels.fetch(match.channelId);
						if (channel?.isTextBased()) {
							const msg = await channel.messages.fetch(match.messageId);
							if (msg.editable) {
								const updatedContainer = buildMatchContainer({
									matchId,
									round: match.round,
									teamAName: teamA?.name ?? match.teamAKey,
									teamAKey: match.teamAKey,
									teamBName: teamB?.name ?? match.teamBKey,
									teamBKey: match.teamBKey,
									codeAlreadyGenerated: true,
								});
								await msg.edit({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 });
							}
						}
					} catch (err) {
						console.warn('[button] Match-Embed konnte nicht aktualisiert werden:', err);
					}
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				await interaction.editReply({ embeds: [makeEmbed('error', 'Fehler beim Code-Generieren', message)] });
			}
			return;
		}

		// ── Slash commands ────────────────────────────────────────────────────
		if (!interaction.isChatInputCommand()) return;

		if (!interaction.inCachedGuild()) {
			if (interaction.isRepliable()) {
				await interaction.reply({ content: 'Guild-Kontext konnte nicht geladen werden.', flags: MessageFlags.Ephemeral });
			}
			return;
		}

		const command = client.commands.get(interaction.commandName);
		if (!command) {
			await interaction.reply({ content: 'Dieser Command ist nicht registriert.', flags: MessageFlags.Ephemeral });
			return;
		}

		try {
			await command.execute(interaction);
			logCommand(client, interaction);
		} catch (error) {
			console.error(`[interaction] /${interaction.commandName}:`, error);
			logCommand(client, interaction, error);
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply('Beim Ausfuehren des Commands ist ein Fehler aufgetreten.');
				return;
			}
			await interaction.reply({ content: 'Beim Ausfuehren des Commands ist ein Fehler aufgetreten.', flags: MessageFlags.Ephemeral });
		}
	},
};

export default interactionCreateEvent;
