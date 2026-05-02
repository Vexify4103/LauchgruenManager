import type { Guild } from 'discord.js';
import { buildQueueNickname } from '../lib/queue.js';
import { loadStorage, updateStorage } from '../lib/storage.js';
import type { BotEvent, QueueEntry } from '../types.js';

async function renumberEntries(guild: Guild, entries: QueueEntry[]): Promise<void> {
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		const member = await guild.members.fetch(entry.userId).catch(() => null);
		if (!member) continue;
		const newNick = buildQueueNickname(i + 1, entry.displayName);
		if (member.nickname !== newNick) {
			await member.setNickname(newNick, `Waiting queue: renumbered to #${i + 1}`).catch(() => null);
		}
	}
}

const voiceStateUpdateEvent: BotEvent<'voiceStateUpdate'> = {
	name: 'voiceStateUpdate',
	async execute(_client, oldState, newState) {
		const channelLeft = oldState.channelId;
		const channelJoined = newState.channelId;
		const member = newState.member ?? oldState.member;
		if (!member) return;

		// Bail early if queue not configured
		const storage = await loadStorage();
		if (!storage.waitingQueue) return;

		const queueChannelId = storage.waitingQueue.channelId;
		const joinedQueue = channelJoined === queueChannelId && channelLeft !== queueChannelId;
		const leftQueue = channelLeft === queueChannelId && channelJoined !== queueChannelId;

		if (!joinedQueue && !leftQueue) return;

		if (joinedQueue) {
			await updateStorage(async (s) => {
				if (!s.waitingQueue) return;
				// Idempotent: skip if already tracked
				if (s.waitingQueue.entries.some((e) => e.userId === member.id)) return;

				const originalNickname = member.nickname;
				const displayName = member.nickname ?? member.user.displayName;
				const position = s.waitingQueue.entries.length + 1;

				s.waitingQueue.entries.push({
					userId: member.id,
					originalNickname,
					displayName,
					joinedAt: Date.now(),
				});

				await member
					.setNickname(buildQueueNickname(position, displayName), `Waiting queue: joined as #${position}`)
					.catch(() => null);
			});
			return;
		}

		if (leftQueue) {
			await updateStorage(async (s) => {
				if (!s.waitingQueue) return;

				const idx = s.waitingQueue.entries.findIndex((e) => e.userId === member.id);
				if (idx === -1) return;

				const [entry] = s.waitingQueue.entries.splice(idx, 1);

				await member
					.setNickname(entry.originalNickname ?? null, 'Waiting queue: left, nickname restored')
					.catch(() => null);

				await renumberEntries(oldState.guild, s.waitingQueue.entries);
			});
		}
	},
};

export default voiceStateUpdateEvent;
