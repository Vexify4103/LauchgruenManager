import { getDb } from './mongo.js';
import type { Storage, StoredTeam } from '../types.js';

const COLLECTION = 'bot_state';
const DOC_ID = 'default';

const EMPTY_STORAGE: Storage = {
	teams: {},
	scannedMatches: [],
	tournament: { matches: [] },
};

type StorageDoc = Storage & { _id: string };

let cache: Storage | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function readFromDb(): Promise<Storage> {
	const db = await getDb();
	const doc = await db.collection<StorageDoc>(COLLECTION).findOne({ _id: DOC_ID });
	if (!doc) return structuredClone(EMPTY_STORAGE);

	const t = doc.tournament as Storage['tournament'] | undefined;
	return {
		teams: doc.teams ?? {},
		scannedMatches: doc.scannedMatches ?? [],
		tournament: {
			providerId: t?.providerId,
			tournamentId: t?.tournamentId,
			matches: t?.matches ?? [],
			mode: t?.mode,
			name: t?.name,
		},
		waitingQueue: doc.waitingQueue,
	};
}

async function writeToDb(storage: Storage): Promise<void> {
	const db = await getDb();
	await db.collection<StorageDoc>(COLLECTION).replaceOne({ _id: DOC_ID }, { ...storage }, { upsert: true });
}

export async function loadStorage(): Promise<Storage> {
	if (!cache) {
		cache = await readFromDb();
	}
	return cache;
}

export async function updateStorage<T>(mutator: (storage: Storage) => T | Promise<T>): Promise<T> {
	const next = writeQueue.then(async () => {
		const storage = await loadStorage();
		const result = await mutator(storage);
		await writeToDb(storage);
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
