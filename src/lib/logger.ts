import { ChannelType, EmbedBuilder, type ChatInputCommandInteraction, type Client, type CommandInteractionOption } from 'discord.js';
import { config } from '../config.js';

// ─── Option formatter ────────────────────────────────────────────────────────

function formatValue(value: unknown): string {
	if (typeof value === 'boolean') return value ? '✅' : '❌';
	return `\`${String(value)}\``;
}

function renderOptions(options: readonly CommandInteractionOption[], depth = 0): string {
	const pad = '  '.repeat(depth);
	return options
		.map((opt) => {
			if (opt.value !== undefined) return `${pad}**${opt.name}** ${formatValue(opt.value)}`;
			if (opt.options?.length) return `${pad}**${opt.name}**\n${renderOptions(opt.options, depth + 1)}`;
			return `${pad}**${opt.name}**`;
		})
		.join('\n');
}

function formatOptions(interaction: ChatInputCommandInteraction): string {
	const lines = renderOptions(interaction.options.data);
	return lines.length > 0 ? lines : '—';
}

// ─── Channel resolver (cached after first fetch) ─────────────────────────────

let logChannelCache: { send(opts: { embeds: EmbedBuilder[] }): Promise<unknown> } | null | undefined = undefined;

async function getLogChannel(client: Client) {
	if (logChannelCache !== undefined) return logChannelCache;
	if (!config.logChannelId) { logChannelCache = null; return null; }

	try {
		const ch = await client.channels.fetch(config.logChannelId);
		logChannelCache = ch?.type === ChannelType.GuildText ? ch : null;
	} catch {
		logChannelCache = null;
	}
	return logChannelCache;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Log a slash command execution. Fire-and-forget — never throws. */
export function logCommand(client: Client, interaction: ChatInputCommandInteraction, error?: unknown): void {
	void (async () => {
		const channel = await getLogChannel(client);
		if (!channel) return;

		const failed = error !== undefined;
		const errMsg = failed ? (error instanceof Error ? error.message : String(error)) : null;

		const embed = new EmbedBuilder()
			.setColor(failed ? 0xd9534f : 0x5cb85c)
			.setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
			.setTitle(`/${interaction.commandName}`)
			.addFields({ name: 'Options', value: formatOptions(interaction) })
			.setFooter({ text: `${interaction.user.username} · #${interaction.channel && 'name' in interaction.channel ? interaction.channel.name : '?'}` })
			.setTimestamp();

		if (errMsg) {
			embed.addFields({ name: '⚠️ Error', value: `\`\`\`${errMsg.slice(0, 900)}\`\`\`` });
		}

		await channel.send({ embeds: [embed] }).catch(() => { /* never break the bot */ });
	})();
}

/** Log a plain message (bot startup, autoscan events, etc.). Fire-and-forget — never throws. */
export function logInfo(client: Client, title: string, description?: string): void {
	void (async () => {
		const channel = await getLogChannel(client);
		if (!channel) return;

		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle(title)
			.setTimestamp();

		if (description) embed.setDescription(description);

		await channel.send({ embeds: [embed] }).catch(() => { /* never break the bot */ });
	})();
}
