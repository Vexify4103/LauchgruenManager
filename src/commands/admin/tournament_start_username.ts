import { PermissionFlagsBits, SlashCommandBuilder, type GuildMember } from 'discord.js';
import { config } from '../../config.js';
import { createTournamentEmbed, wrapTournament } from '../../lib/tournamentEmbeds.js';
import { ensureTournamentRole } from '../../lib/tournamentRole.js';
import type { BotCommand } from '../../types.js';
import { extractDiscordUsernames, loadRoleListInput, ROLE_ACTION_DELAY_MS, wait } from '../../utils.js';

function hasCommandPermission(member: GuildMember): boolean {
	return member.permissions.has(PermissionFlagsBits.ManageGuild) || member.permissions.has(PermissionFlagsBits.Administrator);
}

function formatList(label: string, items: string[]): string | null {
	if (items.length === 0) return null;
	const preview = items.slice(0, 20).join(', ');
	const suffix = items.length > 20 ? ` ... (+${items.length - 20} more)` : '';
	return `${label}: ${preview}${suffix}`;
}

const tournamentStartUsernameCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('tournament_start_username')
		.setDescription('Assigns the tournament role based on Discord usernames.')
		.addStringOption((option) => option.setName('user_name_list').setDescription('Usernames (one per line, comma- or semicolon-separated) or link').setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (interaction.guildId !== config.guildId) {
			await interaction.reply(
				wrapTournament(
					createTournamentEmbed({
						title: 'Wrong Server',
						description: 'This bot is only active for the configured server.',
						processed: 0,
						total: 0,
						status: 'Cancelled',
						summaryLines: ['This command cannot be used here.'],
					})
				)
			);
			return;
		}

		if (!hasCommandPermission(interaction.member)) {
			await interaction.reply(
				wrapTournament(
					createTournamentEmbed({
						title: 'Missing Permissions',
						description: 'You are not allowed to run this command.',
						processed: 0,
						total: 0,
						status: 'Cancelled',
						summaryLines: ['You need `Manage Server` or `Administrator`.'],
					})
				)
			);
			return;
		}

		await interaction.deferReply();

		const userListInput = interaction.options.getString('user_name_list', true);

		try {
			const content = await loadRoleListInput(userListInput);
			const usernames = extractDiscordUsernames(content);

			if (usernames.length === 0) {
				await interaction.editReply(
					wrapTournament(
						createTournamentEmbed({
							title: 'Tournament Start (Username)',
							description: 'No valid Discord usernames were found.',
							processed: 0,
							total: 0,
							status: 'Cancelled',
							summaryLines: ['Please check the content of `user_name_list`.'],
						})
					)
				);
				return;
			}

			const role = await ensureTournamentRole(interaction);
			if (!role) return;

			// Fetch all members once — requires GuildMembers privileged intent
			await interaction.editReply(
				wrapTournament(
					createTournamentEmbed({
						title: 'Tournament Start (Username)',
						description: 'Loading server members...',
						processed: 0,
						total: usernames.length,
						status: 'Preparing',
						summaryLines: ['Member list is being fetched from the server.'],
					})
				)
			);

			const allMembers = await interaction.guild.members.fetch();
			// Build a lowercase username → member map
			const memberMap = new Map(allMembers.map((m) => [m.user.username.toLowerCase(), m]));

			const results = {
				added: [] as string[],
				alreadyHadRole: [] as string[],
				notFound: [] as string[],
				failed: [] as string[],
			};

			for (const [index, username] of usernames.entries()) {
				const member = memberMap.get(username);

				if (!member) {
					results.notFound.push(username);
				} else {
					try {
						if (member.roles.cache.has(role.id)) {
							results.alreadyHadRole.push(username);
						} else {
							await member.roles.add(role);
							results.added.push(username);
						}
					} catch {
						results.failed.push(username);
					}
				}

				const isLast = index + 1 === usernames.length;
				const detailLines = [formatList('Not found', results.notFound), formatList('Failed', results.failed)].filter(Boolean) as string[];

				await interaction.editReply(
					wrapTournament(
						createTournamentEmbed({
							title: 'Tournament Start (Username)',
							description: isLast ? 'The tournament role has been processed for all entries.' : `Processing entry ${index + 1} of ${usernames.length}.`,
							processed: index + 1,
							total: usernames.length,
							status: isLast ? 'Completed' : 'Running',
							summaryLines: [
								`Processed usernames: ${index + 1}/${usernames.length}`,
								`Role assigned: ${results.added.length}`,
								`Role already present: ${results.alreadyHadRole.length}`,
								`Not found in server: ${results.notFound.length}`,
								`Failed: ${results.failed.length}`,
							],
							detailLines,
						})
					)
				);

				const madeApiCall = !results.notFound.includes(username) && !results.alreadyHadRole.includes(username);
				if (!isLast && madeApiCall) await wait(ROLE_ACTION_DELAY_MS);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			await interaction.editReply(
				wrapTournament(
					createTournamentEmbed({
						title: 'Tournament start failed',
						description: 'An error occurred while processing the usernames.',
						processed: 0,
						total: 0,
						status: 'Error',
						summaryLines: [`Error: ${message}`],
					})
				)
			);
		}
	},
};

export default tournamentStartUsernameCommand;
