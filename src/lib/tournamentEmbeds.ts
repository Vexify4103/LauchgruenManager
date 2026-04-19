import { ContainerBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from 'discord.js';
import type { InteractionEditReplyOptions, InteractionReplyOptions } from 'discord.js';

// ─── Progress bar ────────────────────────────────────────────────────────────

const PROGRESS_BAR_LENGTH = 15;

function buildProgressBar(current: number, total: number): string {
	if (total <= 0) return '░'.repeat(PROGRESS_BAR_LENGTH);
	const ratio = Math.max(0, Math.min(1, current / total));
	const filled = Math.round(ratio * PROGRESS_BAR_LENGTH);
	return `${'█'.repeat(filled)}${'░'.repeat(PROGRESS_BAR_LENGTH - filled)}`;
}

function buildProgressText(current: number, total: number): string {
	if (total <= 0) return `\`${'░'.repeat(PROGRESS_BAR_LENGTH)}\`  —`;
	const percentage = Math.round((current / total) * 100);
	return `\`${buildProgressBar(current, total)}\`  **${current}** / **${total}**  (${percentage}%)`;
}

// ─── Status config ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { emoji: string; color: number }> = {
	Laeuft:        { emoji: '⏳', color: 0x5865f2 },
	'Läuft':       { emoji: '⏳', color: 0x5865f2 },
	Abgeschlossen: { emoji: '✅', color: 0x5cb85c },
	Fehler:        { emoji: '❌', color: 0xd9534f },
	Abgebrochen:   { emoji: '🚫', color: 0x95a5a6 },
	Vorbereitung:  { emoji: '🔄', color: 0xf0ad4e },
};

// ─── Internal helpers ────────────────────────────────────────────────────────

function sep(large = false): SeparatorBuilder {
	return new SeparatorBuilder().setDivider(true).setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

function text(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type TournamentEmbedOptions = {
	title: string;
	description: string;
	processed: number;
	total: number;
	status: string;
	summaryLines: string[];
	detailLines?: string[];
};

export function createTournamentEmbed(options: TournamentEmbedOptions): ContainerBuilder {
	const cfg = STATUS_CONFIG[options.status] ?? { emoji: '📋', color: 0x5865f2 };

	const container = new ContainerBuilder()
		.setAccentColor(cfg.color)
		.addTextDisplayComponents(text(`### ${options.title}\n${options.description}`))
		.addSeparatorComponents(sep())
		.addTextDisplayComponents(text(buildProgressText(options.processed, options.total)))
		.addTextDisplayComponents(text(`${cfg.emoji}  **${options.status}**`))
		.addSeparatorComponents(sep())
		.addTextDisplayComponents(text(options.summaryLines.join('\n')));

	if (options.detailLines && options.detailLines.length > 0) {
		container
			.addSeparatorComponents(sep(true))
			.addTextDisplayComponents(text(options.detailLines.join('\n')));
	}

	return container;
}

/**
 * Wraps a tournament ContainerBuilder into a payload accepted by both
 * interaction.reply() and interaction.editReply().
 */
export function wrapTournament(container: ContainerBuilder): InteractionReplyOptions & InteractionEditReplyOptions {
	return {
		components: [container],
		flags: MessageFlags.IsComponentsV2,
	};
}
