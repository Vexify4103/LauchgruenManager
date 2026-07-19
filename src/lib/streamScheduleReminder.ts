import type { Client } from 'discord.js';
import cron, { type ScheduledTask } from 'node-cron';
import { config } from '../config.js';
import { logInfo } from './logger.js';
import { getDb } from './mongo.js';

const TIMEZONE = 'Europe/Berlin';
const COLLECTION = 'bot_runtime';
const DOC_ID = 'stream-schedule-reminder';

type ReminderDoc = {
	_id: string;
	lastSentWeek?: string;
	lastSentAt?: Date;
};

type BerlinTime = {
	year: number;
	month: number;
	day: number;
	weekday: number;
	hour: number;
	minute: number;
};

let scheduledTask: ScheduledTask | null = null;
let sendInFlight: Promise<void> | null = null;

function getBerlinTime(now = new Date()): BerlinTime {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		weekday: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(now);
	const part = (type: string) => parts.find((item) => item.type === type)?.value;
	const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday') ?? '');
	const year = Number(part('year'));
	const month = Number(part('month'));
	const day = Number(part('day'));
	const hour = Number(part('hour'));
	const minute = Number(part('minute'));
	if ([year, month, day, hour, minute].some((value) => !Number.isInteger(value)) || weekday === -1) {
		throw new Error('Could not determine the current Europe/Berlin time.');
	}
	return { year, month, day, weekday, hour, minute };
}

function reminderWeekKey(now = new Date()): string {
	const berlin = getBerlinTime(now);
	const daysUntilMonday = berlin.weekday === 0 ? 1 : 1 - berlin.weekday;
	const monday = new Date(Date.UTC(berlin.year, berlin.month - 1, berlin.day + daysUntilMonday));
	return monday.toISOString().slice(0, 10);
}

function isReminderDue(now = new Date()): boolean {
	const berlin = getBerlinTime(now);
	if (berlin.weekday !== 0) return true;
	return berlin.hour > 23 || (berlin.hour === 23 && berlin.minute >= 59);
}

async function wasReminderSent(weekKey: string): Promise<boolean> {
	const doc = await (await getDb()).collection<ReminderDoc>(COLLECTION).findOne({ _id: DOC_ID });
	return doc?.lastSentWeek === weekKey;
}

async function markReminderSent(weekKey: string): Promise<void> {
	await (await getDb()).collection<ReminderDoc>(COLLECTION).updateOne(
		{ _id: DOC_ID },
		{ $set: { lastSentWeek: weekKey, lastSentAt: new Date() } },
		{ upsert: true }
	);
}

async function sendReminder(client: Client, reason: 'cron' | 'catch-up' | 'test'): Promise<void> {
	const weekKey = reminderWeekKey();
	if (await wasReminderSent(weekKey)) {
		console.log(`[stream-schedule] Reminder for week ${weekKey} was already sent.`);
		return;
	}

	const user = await client.users.fetch(config.streamScheduleUserId!);
	await user.send(
		'Hallo Luca! 🎬\n\n' +
			'Es ist Zeit für den wöchentlichen Streamplan!\n' +
			'Benutze `/streamschedule`, um den Plan für die kommende Woche zu posten.\n\n' +
			'<:lauchg2Hello:1386410663559168071>'
	);
	await markReminderSent(weekKey);
	console.log(`[stream-schedule] ${reason} reminder sent for week ${weekKey}.`);
	logInfo(client, '📬 Stream-Schedule-Erinnerung', `DM an **${user.tag}** gesendet.`);
}

function queueReminder(client: Client, reason: 'cron' | 'catch-up' | 'test'): Promise<void> {
	if (sendInFlight) return sendInFlight;

	sendInFlight = sendReminder(client, reason).finally(() => {
		sendInFlight = null;
	});
	return sendInFlight;
}

export function startStreamScheduleReminder(client: Client): void {
	if (!config.streamScheduleUserId) {
		console.log('[stream-schedule] STREAM_SCHEDULE_USER_ID not set - reminder disabled.');
		return;
	}
	if (scheduledTask) return;

	scheduledTask = cron.schedule(
		'59 23 * * 0',
		() => {
			void queueReminder(client, 'cron').catch((error: unknown) => {
				console.error('[stream-schedule] Failed to send scheduled reminder:', error);
			});
		},
		{ timezone: TIMEZONE, noOverlap: true, name: 'stream-schedule-reminder' }
	);

	console.log(`[stream-schedule] Cron scheduled: Sunday 23:59 (${TIMEZONE}).`);

	if (isReminderDue()) {
		void queueReminder(client, 'catch-up').catch((error: unknown) => {
			console.error('[stream-schedule] Failed to send catch-up reminder:', error);
		});
	}

	if (config.streamScheduleTest) {
		void queueReminder(client, 'test').catch((error: unknown) => {
			console.error('[stream-schedule] Failed to send test reminder:', error);
		});
	}
}
