/**
 * One-shot migration: copy data/storage.json into MongoDB (collection bot_state).
 *
 * Idempotent — overwrites the single bot_state doc.
 * Run with: pnpm tsx src/scripts/migrate-json-to-mongo.ts
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
	const uri = process.env.MONGODB_URI;
	if (!uri) throw new Error('MONGODB_URI is required');
	const dbName = process.env.MONGODB_DB ?? 'lauchgruen';

	const jsonPath = resolve(process.cwd(), process.env.STORAGE_PATH ?? 'data/storage.json');
	let raw: string;
	try {
		raw = await readFile(jsonPath, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			console.log(`No JSON file at ${jsonPath}. Nothing to migrate.`);
			return;
		}
		throw error;
	}

	const parsed = JSON.parse(raw) as Record<string, unknown>;
	const teams = Object.keys((parsed.teams as Record<string, unknown> | undefined) ?? {}).length;
	const matches = ((parsed.tournament as { matches?: unknown[] } | undefined)?.matches ?? []).length;
	console.log(`Migrating ${teams} team(s), ${matches} tournament match(es), ${((parsed.scannedMatches as unknown[] | undefined) ?? []).length} scanned match(es)…`);

	const client = await new MongoClient(uri).connect();
	try {
		const db = client.db(dbName);
		await db.collection<{ _id: string } & Record<string, unknown>>('bot_state').replaceOne({ _id: 'default' }, { ...parsed }, { upsert: true });
		console.log('Migration complete.');
	} finally {
		await client.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
