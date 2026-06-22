import { ActivityType, ChannelType, type VoiceChannel } from 'discord.js';
import { config } from '../config.js';
import { startAutoscan } from '../lib/autoscan.js';
import { startStreamScheduleReminder } from '../lib/streamScheduleReminder.js';
import { deployGuildCommands } from '../lib/deployCommands.js';
import { logInfo } from '../lib/logger.js';
import { buildQueueNickname, extractDisplayName, isQueueNickname } from '../lib/queue.js';
import { loadStorage, updateStorage } from '../lib/storage.js';
import type { BotClient, BotEvent } from '../types.js';

async function recoverQueue(client: BotClient): Promise<void> {
	const storage = await loadStorage();
	if (!storage.waitingQueue) return;

	const guild = client.guilds.cache.get(config.guildId);
	if (!guild) return;

	const channel = await guild.channels.fetch(storage.waitingQueue.channelId).catch(() => null);
	if (!channel || channel.type !== ChannelType.GuildVoice) return;
	const voiceChannel = channel as VoiceChannel;

	await updateStorage(async (s) => {
		if (!s.waitingQueue) return;

		const currentMemberIds = new Set(voiceChannel.members.keys());
		const staying = s.waitingQueue.entries.filter((e) => currentMemberIds.has(e.userId));
		const departed = s.waitingQueue.entries.filter((e) => !currentMemberIds.has(e.userId));

		// Restore nicknames for members who left while bot was offline
		for (const entry of departed) {
			const member = await guild.members.fetch(entry.userId).catch(() => null);
			if (member) {
				await member.setNickname(entry.originalNickname ?? null, 'Waiting queue: left while bot was offline, nickname restored').catch(() => null);
			}
		}

		// Add members who joined the channel while bot was offline
		const storedIds = new Set(staying.map((e) => e.userId));
		for (const [memberId, member] of voiceChannel.members) {
			if (storedIds.has(memberId)) continue;
			const hasQueueNick = isQueueNickname(member.nickname);
			staying.push({
				userId: memberId,
				originalNickname: hasQueueNick ? null : member.nickname,
				displayName: hasQueueNick ? extractDisplayName(member.nickname!) : (member.nickname ?? member.user.displayName),
				joinedAt: Date.now(),
			});
		}

		s.waitingQueue.entries = staying;

		// Re-apply correct queue nicknames for everyone in the channel
		for (let i = 0; i < staying.length; i++) {
			const entry = staying[i];
			const member = voiceChannel.members.get(entry.userId);
			if (!member) continue;
			await member.setNickname(buildQueueNickname(i + 1, entry.displayName), 'Waiting queue: re-synced after bot restart').catch(() => null);
		}
	});
}

const clientReadyEvent: BotEvent<'clientReady'> = {
	name: 'clientReady',
	once: true,
	async execute(client) {
		try {
			await deployGuildCommands();
			console.log(`Active target guild: ${config.guildId}`);
			console.log('Guild slash commands synced on startup.');
			console.log(`Bot logged in as ${client.user?.tag ?? 'unknown'}`);

			await loadStorage();
			await recoverQueue(client);
			startAutoscan(client);
			startStreamScheduleReminder(client);

			logInfo(client, '🟢 Bot started', `Logged in as **${client.user?.tag ?? '?'}** · Autoscan: **${config.autoscanEnabled ? 'on' : 'off'}**`);

			client.user?.setPresence({
				status: 'online',
				activities: [
					{
						name: 'twitch.tv/lauchgruen',
						type: ActivityType.Watching,
					},
				],
			});
		} catch (error) {
			console.error('[startup] Error while running client ready tasks:', error);
		}
	},
};

export default clientReadyEvent;
