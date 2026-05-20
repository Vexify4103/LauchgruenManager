import type { Guild, GuildMember } from 'discord.js';
import { config } from '../config.js';
import type { RiotAccount } from '../types.js';

export const ROLE_ACTION_DELAY_MS = 1_000;

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildNickname(account: RiotAccount, displayName?: string): string {
	const safeDisplayName = displayName?.trim() || account.gameName;
	const riotId = `${account.gameName}#${account.tagLine}`;
	if (config.nicknameFormat === '{displayName} | {riotId}') {
		const separator = ' | ';
		const availableNameLength = Math.max(1, 32 - separator.length - riotId.length);
		return `${safeDisplayName.slice(0, availableNameLength)}${separator}${riotId}`.slice(0, 32);
	}
	const raw = config.nicknameFormat
		.replace('{displayName}', safeDisplayName)
		.replace('{gameName}', account.gameName)
		.replace('{tagLine}', account.tagLine)
		.replace('{riotId}', riotId);
	return raw.slice(0, 32);
}

export type RenameResult =
	| { kind: 'renamed'; riotId: string; discordId: string }
	| { kind: 'unchanged'; riotId: string; discordId: string }
	| { kind: 'no-discord'; riotId: string }
	| { kind: 'not-in-guild'; riotId: string; discordId: string }
	| { kind: 'owner'; riotId: string; discordId: string }
	| { kind: 'hierarchy'; riotId: string; discordId: string }
	| { kind: 'failed'; riotId: string; discordId: string; error: string };

export async function ensureNicknamePermissions(guild: Guild): Promise<string | null> {
	const botMember = await guild.members.fetchMe();
	if (!botMember.permissions.has(BigInt(0x8000000))) {
		return 'The bot does not have the `MANAGE_NICKNAMES` permission.';
	}
	return null;
}

export async function renamePlayer(
	guild: Guild,
	botMember: GuildMember,
	riotId: string,
	gameName: string,
	tagLine: string,
	discordId: string,
	displayName?: string
): Promise<RenameResult> {
	if (discordId === guild.ownerId) return { kind: 'owner', riotId, discordId };

	let member: GuildMember;
	try {
		member = await guild.members.fetch(discordId);
	} catch {
		return { kind: 'not-in-guild', riotId, discordId };
	}

	if (botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
		return { kind: 'hierarchy', riotId, discordId };
	}

	const nickname = buildNickname({ puuid: '', gameName, tagLine }, displayName ?? member.nickname ?? member.user.displayName);
	if (member.nickname === nickname || (member.nickname === null && member.user.username === nickname)) {
		return { kind: 'unchanged', riotId, discordId };
	}

	try {
		await member.setNickname(nickname, `LauchManager: Riot-ID Sync (${riotId})`);
		return { kind: 'renamed', riotId, discordId };
	} catch (error) {
		return { kind: 'failed', riotId, discordId, error: error instanceof Error ? error.message : String(error) };
	}
}
