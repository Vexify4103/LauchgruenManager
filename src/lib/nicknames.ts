import type { Guild, GuildMember } from 'discord.js';
import { config } from '../config.js';
import type { RiotAccount } from '../types.js';

export const ROLE_ACTION_DELAY_MS = 1_000;

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildNickname(account: RiotAccount): string {
	const raw = config.nicknameFormat
		.replace('{gameName}', account.gameName)
		.replace('{tagLine}', account.tagLine)
		.replace('{riotId}', `${account.gameName}#${account.tagLine}`);
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
		return 'Der Bot hat keine `MANAGE_NICKNAMES`-Berechtigung.';
	}
	return null;
}

export async function renamePlayer(
	guild: Guild,
	botMember: GuildMember,
	riotId: string,
	gameName: string,
	tagLine: string,
	discordId: string
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

	const nickname = buildNickname({ puuid: '', gameName, tagLine });
	if (member.nickname === nickname || (member.nickname === null && member.user.username === nickname)) {
		return { kind: 'unchanged', riotId, discordId };
	}

	try {
		await member.setNickname(nickname, `Fearless-Bot: Riot-ID Sync (${riotId})`);
		return { kind: 'renamed', riotId, discordId };
	} catch (error) {
		return { kind: 'failed', riotId, discordId, error: error instanceof Error ? error.message : String(error) };
	}
}
