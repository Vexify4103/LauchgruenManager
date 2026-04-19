import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	type GuildMember,
	type MessageCreateOptions,
	type InteractionReplyOptions,
} from 'discord.js';

// ─── Classic embeds (used by turnier commands and simple replies) ────────────

const COLORS = {
	success: 0x5cb85c,
	info: 0x8bc34a,
	warning: 0xf0ad4e,
	error: 0xd9534f,
	neutral: 0x95a5a6,
} as const;

export type EmbedFlavor = keyof typeof COLORS;

export function makeEmbed(flavor: EmbedFlavor, title: string, description?: string): EmbedBuilder {
	const embed = new EmbedBuilder().setColor(COLORS[flavor]).setTitle(title).setTimestamp(new Date());
	if (description) embed.setDescription(description);
	return embed;
}

export function hasAdminPermission(member: GuildMember): boolean {
	return member.permissions.has(PermissionFlagsBits.ManageGuild) || member.permissions.has(PermissionFlagsBits.Administrator);
}

export function formatChampionList(champions: string[]): string {
	if (champions.length === 0) return '*—*';
	return [...champions].sort((a, b) => a.localeCompare(b)).map((c) => `\`${c}\``).join(', ');
}

// ─── Components v2 accent colours ───────────────────────────────────────────

const ACCENT = {
	success: 0x5cb85c,
	info: 0x5865f2,
	warning: 0xf0ad4e,
	error: 0xd9534f,
	neutral: 0x95a5a6,
	team: 0x8bc34a,
} as const;

// ─── Components v2 helpers ───────────────────────────────────────────────────

function sep(small = true): SeparatorBuilder {
	return new SeparatorBuilder().setDivider(true).setSpacing(small ? SeparatorSpacingSize.Small : SeparatorSpacingSize.Large);
}

function text(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content);
}

/**
 * Wrap a Components-v2 container in a ready-to-send message payload.
 * Callers should spread this into reply() / send() options.
 */
export function v2Message(container: ContainerBuilder): Pick<MessageCreateOptions, 'components' | 'flags'> {
	return {
		components: [container],
		flags: MessageFlags.IsComponentsV2,
	};
}

export function v2Reply(container: ContainerBuilder, ephemeral = false): InteractionReplyOptions {
	return {
		components: [container],
		flags: ephemeral ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2,
	};
}

// ─── Banned-champions display ────────────────────────────────────────────────

/**
 * Build a Components v2 container showing a team's fearless ban list.
 */
export function buildBannedContainer(teamName: string, playerCount: number, playedChampions: string[]): ContainerBuilder {
	const count = playedChampions.length;
	const sorted = [...playedChampions].sort((a, b) => a.localeCompare(b));

	const header = count === 0
		? `### 🛡️ ${teamName}\n*Noch keine Champions gesperrt · ${playerCount} Spieler registriert*`
		: `### 🛡️ ${teamName}\n**${count}** Champion${count === 1 ? '' : 's'} gesperrt · **${playerCount}** Spieler registriert`;

	const container = new ContainerBuilder()
		.setAccentColor(count === 0 ? ACCENT.success : ACCENT.team)
		.addTextDisplayComponents(text(header))
		.addSeparatorComponents(sep());

	if (count === 0) {
		container.addTextDisplayComponents(text('*—*'));
	} else {
		// Discord field limit is 4096 chars for text display; split into chunks if needed
		const chunks: string[] = [];
		let current = '';
		for (const champ of sorted) {
			const piece = current ? `, \`${champ}\`` : `\`${champ}\``;
			if (current.length + piece.length > 3800) {
				chunks.push(current);
				current = `\`${champ}\``;
			} else {
				current += piece;
			}
		}
		if (current) chunks.push(current);

		for (const chunk of chunks) {
			container.addTextDisplayComponents(text(chunk));
		}
	}

	return container;
}

// ─── Match embed with captain buttons ───────────────────────────────────────

export type MatchEmbedOptions = {
	matchId: string;
	round: number;
	teamAName: string;
	teamAKey: string;
	teamBName: string;
	teamBKey: string;
	codeAlreadyGenerated?: boolean;
};

export function buildMatchContainer(opts: MatchEmbedOptions): ContainerBuilder {
	const { matchId, round, teamAName, teamAKey, teamBName, teamBKey, codeAlreadyGenerated } = opts;

	const codeHint = codeAlreadyGenerated
		? '*Tournament Code wurde bereits generiert — Captain-Button erneut drücken zum Abrufen.*'
		: '*Nur Team-Captains können den Tournament Code abrufen.*';

	const btnA = new ButtonBuilder()
		.setCustomId(`fearless:code:${matchId}:${teamAKey}`)
		.setLabel(`🏆 ${teamAName}`)
		.setStyle(ButtonStyle.Primary);

	const btnB = new ButtonBuilder()
		.setCustomId(`fearless:code:${matchId}:${teamBKey}`)
		.setLabel(`🏆 ${teamBName}`)
		.setStyle(ButtonStyle.Secondary);

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnA, btnB);

	return new ContainerBuilder()
		.setAccentColor(ACCENT.info)
		.addTextDisplayComponents(text(`### ⚔️ Runde ${round}`))
		.addTextDisplayComponents(text(`**${teamAName}** vs **${teamBName}**`))
		.addSeparatorComponents(sep())
		.addTextDisplayComponents(text(codeHint))
		.addActionRowComponents(row);
}

// ─── Scan-result display (Components v2) ────────────────────────────────────

export type ScanResultTeam = {
	teamName: string;
	newlyAdded: string[];
	alreadyKnown: string[];
	players: { riotId: string; championName: string }[];
	totalBanned: number;
};

export function buildScanContainer(
	matchId: string,
	teamResults: ScanResultTeam[],
	orphans: { riotId: string; championName: string }[],
	origin: 'manual' | 'auto'
): ContainerBuilder {
	const hasOrphans = orphans.length > 0;
	const label = origin === 'auto' ? '🤖 Auto-Scan abgeschlossen' : '✅ Scan abgeschlossen';

	const container = new ContainerBuilder()
		.setAccentColor(hasOrphans ? ACCENT.warning : ACCENT.success)
		.addTextDisplayComponents(text(`### ${label}\nMatch \`${matchId}\``))
		.addSeparatorComponents(sep());

	for (const bucket of teamResults) {
		const lines = bucket.players.map(({ riotId, championName }) => {
			const icon = bucket.newlyAdded.includes(championName) ? '🆕' : '🔁';
			return `${icon} **${championName}** — ${riotId}`;
		});
		const summary = `Neu gesperrt: **${bucket.newlyAdded.length}** · Bereits bekannt: **${bucket.alreadyKnown.length}** · Gesamt: **${bucket.totalBanned}**`;

		container
			.addTextDisplayComponents(text(`**🛡️ ${bucket.teamName}**\n${summary}`))
			.addTextDisplayComponents(text(lines.join('\n') || '*—*'))
			.addSeparatorComponents(sep(false));
	}

	if (hasOrphans) {
		const lines = orphans.map(({ riotId, championName }) => `• ${championName} — ${riotId}`);
		container.addTextDisplayComponents(
			text(`**⚠️ Nicht zugeordnete Spieler**\nDiese Picks wurden **nicht** gespeichert:\n${lines.join('\n')}`)
		);
	}

	return container;
}
