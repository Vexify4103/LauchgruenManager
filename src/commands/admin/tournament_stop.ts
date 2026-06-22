import { PermissionFlagsBits, SlashCommandBuilder, type GuildMember } from 'discord.js';
import { config } from '../../config.js';
import { createTournamentEmbed, wrapTournament } from '../../lib/tournamentEmbeds.js';
import { ensureTournamentRole } from '../../lib/tournamentRole.js';
import type { BotCommand } from '../../types.js';
import { ROLE_ACTION_DELAY_MS, wait } from '../../utils.js';

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

function buildStopEmbed(
	processed: number,
	total: number,
	results: {
		removed: string[];
		failed: string[];
	},
	status: string,
	description: string
) {
	const detailLines = [formatUserIdList('Failed', results.failed)].filter(Boolean) as string[];

	return createTournamentEmbed({
		title: 'Tournament Stop',
		description,
		processed,
		total,
		status,
		summaryLines: [
			`Members with tournament role found: ${total}`,
			`Already processed: ${processed}/${total}`,
			`Role removed: ${results.removed.length}`,
			`Failed: ${results.failed.length}`,
		],
		detailLines,
	});
}

const tournamentStopCommand: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('tournament_stop')
		.setDescription('Removes the tournament role from all members in the server.')
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

		const role = await ensureTournamentRole(interaction);

		if (!role) {
			return;
		}

		await interaction.guild.members.fetch();

		const membersWithRole = interaction.guild.members.cache.filter((member) => member.roles.cache.has(role.id));

		if (membersWithRole.size === 0) {
			await interaction.editReply(
				wrapTournament(
					createTournamentEmbed({
						title: 'Tournament Stop',
						description: 'Nobody currently has the tournament role.',
						processed: 0,
						total: 0,
						status: 'Completed',
						summaryLines: ['There was nothing to remove.'],
					})
				)
			);
			return;
		}

		const results = {
			removed: [] as string[],
			failed: [] as string[],
		};

		const members = [...membersWithRole.values()];

		await interaction.editReply(wrapTournament(buildStopEmbed(0, members.length, results, 'Running', 'The tournament role is now being removed step by step.')));

		for (const [index, member] of members.entries()) {
			try {
				await member.roles.remove(role);
				results.removed.push(member.id);
			} catch {
				results.failed.push(member.id);
			}

			const isLast = index + 1 === members.length;
			await interaction.editReply(
				wrapTournament(
					buildStopEmbed(
						index + 1,
						members.length,
						results,
						isLast ? 'Completed' : 'Running',
						isLast ? 'The tournament role has been processed for all found members.' : `Processing member ${index + 1} of ${members.length}.`
					)
				)
			);

			if (index < members.length - 1) {
				await wait(ROLE_ACTION_DELAY_MS);
			}
		}
	},
};

export default tournamentStopCommand;
