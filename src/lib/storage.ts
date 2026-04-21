import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { config } from '../config.js';
import type { Storage, StoredTeam } from '../types.js';

const EMPTY_STORAGE: Storage = {
	teams: {},
	scannedMatches: [],
	tournament: { matches: [] },
};

let cache: Storage | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function readFromDisk(): Promise<Storage> {
	try {
		const raw = await readFile(config.storagePath, 'utf8');
		const parsed = JSON.parse(raw) as Partial<Storage>;
		const t = parsed.tournament as Storage['tournament'] | undefined;
		return {
			teams: parsed.teams ?? {},
			scannedMatches: parsed.scannedMatches ?? [],
			tournament: {
				providerId: t?.providerId,
				tournamentId: t?.tournamentId,
				matches: t?.matches ?? [],
				mode: t?.mode,
				name: t?.name,
			},
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return structuredClone(EMPTY_STORAGE);
		}
		throw error;
	}
}

async function writeToDisk(storage: Storage): Promise<void> {
	await mkdir(dirname(config.storagePath), { recursive: true });
	await writeFile(config.storagePath, JSON.stringify(storage, null, '\t') + '\n', 'utf8');
}

export async function loadStorage(): Promise<Storage> {
	if (!cache) {
		cache = await readFromDisk();
	}
	return cache;
}

export async function updateStorage<T>(mutator: (storage: Storage) => T | Promise<T>): Promise<T> {
	const next = writeQueue.then(async () => {
		const storage = await loadStorage();
		const result = await mutator(storage);
		await writeToDisk(storage);
		return result;
	});

	writeQueue = next.then(
		() => undefined,
		() => undefined
	);

	return next;
}

export function normalizeTeamName(name: string): string {
	return name.trim();
}

export function findTeam(storage: Storage, name: string): StoredTeam | undefined {
	const needle = normalizeTeamName(name).toLowerCase();
	for (const team of Object.values(storage.teams)) {
		if (team.name.toLowerCase() === needle) {
			return team;
		}
	}
	return undefined;
}

export function teamKey(name: string): string {
	return normalizeTeamName(name).toLowerCase();
}
