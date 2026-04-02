import { EmbedBuilder } from 'discord.js';

const TOURNAMENT_EMBED_COLOR = 0x90ee90;
const PROGRESS_BAR_LENGTH = 12;

function buildProgressBar(current: number, total: number): string {
	if (total <= 0) {
		return `[${'-'.repeat(PROGRESS_BAR_LENGTH)}]`;
	}

	const ratio = Math.max(0, Math.min(1, current / total));
	const filled = Math.round(ratio * PROGRESS_BAR_LENGTH);

	return `[${'#'.repeat(filled)}${'-'.repeat(PROGRESS_BAR_LENGTH - filled)}]`;
}

function buildProgressText(current: number, total: number): string {
	if (total <= 0) {
		return 'Keine Eintraege';
	}

	const percentage = Math.round((current / total) * 100);

	return `${buildProgressBar(current, total)} ${current}/${total} (${percentage}%)`;
}

type TournamentEmbedOptions = {
	title: string;
	description: string;
	processed: number;
	total: number;
	status: string;
	summaryLines: string[];
	detailLines?: string[];
};

export function createTournamentEmbed(options: TournamentEmbedOptions): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(TOURNAMENT_EMBED_COLOR)
		.setTitle(options.title)
		.setDescription(options.description)
		.addFields(
			{
				name: 'Fortschritt',
				value: buildProgressText(options.processed, options.total),
				inline: false,
			},
			{
				name: 'Status',
				value: options.status,
				inline: false,
			},
			{
				name: 'Zusammenfassung',
				value: options.summaryLines.join('\n'),
				inline: false,
			}
		)
		.setTimestamp();

	if (options.detailLines && options.detailLines.length > 0) {
		embed.addFields({
			name: 'Details',
			value: options.detailLines.join('\n'),
			inline: false,
		});
	}

	return embed;
}
