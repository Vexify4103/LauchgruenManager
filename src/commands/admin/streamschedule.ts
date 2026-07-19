import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { config } from '../../config.js';
import { makeEmbed } from '../../lib/embeds.js';
import type { BotCommand } from '../../types.js';

const PAUSE_AUTOCOMPLETE = 'Pause 🧸';

const DAY_FIELDS = [
	{ name: 'montag', label: 'Montag' },
	{ name: 'dienstag', label: 'Dienstag' },
	{ name: 'mittwoch', label: 'Mittwoch' },
	{ name: 'donnerstag', label: 'Donnerstag' },
	{ name: 'freitag', label: 'Freitag' },
	{ name: 'samstag', label: 'Samstag' },
	{ name: 'sonntag', label: 'Sonntag' },
] as const;

function getNextMonday(date: Date): Date {
	const d = new Date(date);
	const day = d.getDay();
	const diff = day === 0 ? 1 : 1 - day;
	d.setDate(d.getDate() + diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

function getNextSunday(date: Date): Date {
	const monday = getNextMonday(date);
	const sunday = new Date(monday);
	sunday.setDate(sunday.getDate() + 6);
	return sunday;
}

function formatGermanDate(d: Date): string {
	return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fixPunctuation(text: string): string {
	let s = text.trim();
	if (!s) return s;

	// Protect Discord emoji :name: from colon spacing fixes
	const emojis: string[] = [];
	s = s.replace(/:[a-zA-Z0-9_]+:/g, (m) => {
		emojis.push(m);
		return `\x00EMOJI${emojis.length - 1}\x00`;
	});

	// Capitalize first letter
	s = s.charAt(0).toUpperCase() + s.slice(1);

	// Remove space before punctuation
	s = s.replace(/\s+([.!?:;,])/g, '$1');

	// Ensure space after period when followed by a letter: "ending.Next" → "ending. Next"
	s = s.replace(/\.([A-Za-z])/g, '. $1');

	// Ensure space after colon: "SCHACH:Ab" → "SCHACH: Ab" (but not "20 Uhr:" at end)
	s = s.replace(/(\w):(\w)/g, '$1: $2');

	// Restore Discord emojis
	s = s.replace(/\x00EMOJI(\d+)\x00/g, (_, i) => emojis[Number(i)]);

	// Trim trailing whitespace
	s = s.trimEnd();

	// Add trailing period if missing (skip if ends with ) or common fillers)
	if (s && !/[.!?:…)\]]$/.test(s) && !/\bxd\b$/i.test(s)) s += '.';

	return s;
}

const streamscheduleCommand: BotCommand = {
	data: (() => {
		const cmd = new SlashCommandBuilder()
			.setName('streamschedule')
			.setDescription('Postet den Streamplan für die kommende Woche.')
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator);

		for (const day of DAY_FIELDS) {
			cmd.addStringOption((o) => o.setName(day.name).setDescription(`Stream am ${day.label} (Autocomplete: Pause 🧸)`).setRequired(false).setAutocomplete(true));
		}

		return cmd;
	})(),

	async execute(interaction) {
		if (!config.streamScheduleUserId) {
			await interaction.reply({
				embeds: [makeEmbed('error', 'Nicht konfiguriert', '`STREAM_SCHEDULE_USER_ID` ist nicht gesetzt. Der Befehl ist deaktiviert.')],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (interaction.user.id !== config.streamScheduleUserId) {
			await interaction.reply({
				embeds: [makeEmbed('error', 'Keine Berechtigung', 'Du bist nicht berechtigt, diesen Befehl auszuführen.')],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (!config.streamScheduleChannelId) {
			await interaction.reply({
				embeds: [makeEmbed('error', 'Fehlende Konfiguration', '`STREAM_SCHEDULE_CHANNEL_ID` ist nicht gesetzt.')],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const now = new Date();
		const monday = getNextMonday(now);
		const sunday = getNextSunday(now);

		const dayEntries = DAY_FIELDS.map((day) => {
			const value = interaction.options.getString(day.name);
			const text = value ? fixPunctuation(value) : '—';
			return `> - ${day.label}: ${text}`;
		});

		const scheduleText = [
			`Streamplan für den **${formatGermanDate(monday)} - ${formatGermanDate(sunday)}**`,
			`<@&1251545873616474213>`,
			...dayEntries,
			'',
			'Wünsch euch ne gute Woche, wir sehen uns im Stream',
			'Bis dann Luca :teddy_bear:',
		].join('\n');

		const channel = await interaction.guild.channels.fetch(config.streamScheduleChannelId);
		if (!channel?.isTextBased()) {
			await interaction.editReply({
				embeds: [makeEmbed('error', 'Kanal nicht gefunden', 'Der konfigurierte Kanal existiert nicht oder ist kein Textkanal.')],
			});
			return;
		}

		const msg = await channel.send(scheduleText);
		if (channel.type === ChannelType.GuildAnnouncement) {
			await msg.crosspost().catch(() => null);
		}
		await interaction.editReply({
			embeds: [makeEmbed('success', 'Streamplan gepostet', `Der Plan für **${formatGermanDate(monday)} - ${formatGermanDate(sunday)}** wurde gepostet.`)],
		});
	},

	async autocomplete(interaction) {
		const focused = interaction.options.getFocused();
		if (!focused) {
			await interaction.respond([{ name: PAUSE_AUTOCOMPLETE, value: PAUSE_AUTOCOMPLETE }]);
			return;
		}
		const needle = focused.toLowerCase();
		const pauseMatch = PAUSE_AUTOCOMPLETE.toLowerCase().includes(needle);
		const items: { name: string; value: string }[] = [];
		if (pauseMatch) items.push({ name: PAUSE_AUTOCOMPLETE, value: PAUSE_AUTOCOMPLETE });
		if (focused && !pauseMatch) {
			items.push({ name: focused, value: focused });
		}
		await interaction.respond(items.slice(0, 25));
	},
};

export default streamscheduleCommand;
