import { PermissionFlagsBits, SlashCommandBuilder, type GuildMember } from 'discord.js';
import { config } from '../../config.js';
import { createTournamentEmbed, wrapTournament } from '../../lib/tournamentEmbeds.js';
import { ensureTournamentRole } from '../../lib/tournamentRole.js';
import type { BotCommand } from '../../types.js';
import { extractDiscordUserIds, loadRoleListInput, ROLE_ACTION_DELAY_MS, wait } from '../../utils.js';

function hasCommandPermission(member: GuildMember): boolean {
	return member.permissions.has(PermissionFlagsBits.ManageGuild) || member.permissions.has(PermissionFlagsBits.Administrator);
}

function formatUserIdList(label: string, userIds: string[]): string | null {
	if (userIds.length === 0) {
		return null;
	}

	const preview = userIds.slice(0, 20).join(', ');
	const suffix = userIds.length > 20 ? ` ... (+${userIds.length - 20} more)` : '';

	return `${label}: ${preview}${suffix}`;
}

function buildStartEmbed(
	processed: number,
	total: number,
	results: {
		added: string[];
		alreadyHadRole: string[];
		notFound: string[];
		failed: string[];
	},
	status: string,
	description: string
) {
	const detailLines = [formatUserIdList('Not found', results.notFound), formatUserIdList('Failed', results.failed)].filter(Boolean) as string[];

	return createTournamentEmbed({
		title: 'Tournament Start',
		description,
		processed,
		total,
		status,
		summaryLines: [
			`Processed IDs: ${processed}/${total}`,
			`Role assigned: ${results.added.length}`,
			`Role already present: ${results.alreadyHadRole.length}`,
			`Not found in server: ${results.notFound.length}`,
			`Failed: ${results.failed.length}`,
		],
		detailLines,
	});
}

const tournamentStartCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('tournament_start_id')
		.setDescription('Assigns the tournament role to all user IDs from the role list.')
		.addStringOption((option) => option.setName('user_id_list').setDescription('Direct text or a Sourcebin/paste link with user IDs').setRequired(true))
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

		const userListInput = interaction.options.getString('user_id_list', true);

		try {
			const content = await loadRoleListInput(userListInput);
			const userIds = extractDiscordUserIds(content);

			if (userIds.length === 0) {
				await interaction.editReply(
					wrapTournament(
						createTournamentEmbed({
							title: 'Tournament Start',
							description: 'No valid Discord user IDs were found.',
							processed: 0,
							total: 0,
							status: 'Cancelled',
							summaryLines: ['Please check the content of `user_id_list`.'],
						})
					)
				);
				return;
			}

			const role = await ensureTournamentRole(interaction);

			if (!role) {
				return;
			}

			const results = {
				added: [] as string[],
				alreadyHadRole: [] as string[],
				notFound: [] as string[],
				failed: [] as string[],
			};

			await interaction.editReply(wrapTournament(buildStartEmbed(0, userIds.length, results, 'Running', 'The tournament role is now being assigned step by step.')));

			for (const [index, userId] of userIds.entries()) {
				try {
					const member = await interaction.guild.members.fetch(userId);

					if (member.roles.cache.has(role.id)) {
						results.alreadyHadRole.push(userId);
					} else {
						await member.roles.add(role);
						results.added.push(userId);
					}
				} catch (error) {
					const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

					if (message.includes('unknown member') || message.includes('not found') || message.includes('invalid form body')) {
						results.notFound.push(userId);
					} else {
						results.failed.push(userId);
					}
				}

				const isLast = index + 1 === userIds.length;
				await interaction.editReply(
					wrapTournament(
						buildStartEmbed(
							index + 1,
							userIds.length,
							results,
							isLast ? 'Completed' : 'Running',
							isLast ? 'The tournament role has been processed for all entries.' : `Processing entry ${index + 1} of ${userIds.length}.`
						)
					)
				);

				if (index < userIds.length - 1) {
					await wait(ROLE_ACTION_DELAY_MS);
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';

			await interaction.editReply(
				wrapTournament(
					createTournamentEmbed({
						title: 'Tournament start failed',
						description: 'An error occurred while processing the role list.',
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

export default tournamentStartCommand;
