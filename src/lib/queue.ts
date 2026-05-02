const MAX_NICK = 32;

export function buildQueueNickname(position: number, displayName: string): string {
	const prefix = `#${position} | `;
	const available = MAX_NICK - prefix.length;
	const name = displayName.length > available ? displayName.slice(0, available) : displayName;
	return `${prefix}${name}`;
}

export function isQueueNickname(nickname: string | null): boolean {
	return nickname !== null && /^#\d+ \| /.test(nickname);
}

export function extractDisplayName(queueNickname: string): string {
	return queueNickname.replace(/^#\d+ \| /, '');
}
