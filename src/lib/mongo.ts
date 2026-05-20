import { MongoClient, type Db } from 'mongodb';

let clientPromise: Promise<MongoClient> | null = null;

function connect(): Promise<MongoClient> {
	const uri = process.env.MONGODB_URI;
	if (!uri) throw new Error('Missing environment variable: MONGODB_URI');
	if (!clientPromise) {
		const client = new MongoClient(uri, {
			maxPoolSize: 5,
			serverSelectionTimeoutMS: 5000,
		});
		clientPromise = client.connect().catch(async (error: unknown) => {
			clientPromise = null;
			await client.close().catch(() => undefined);
			throw error;
		});
	}
	return clientPromise;
}

export async function getDb(): Promise<Db> {
	const client = await connect();
	const dbName = process.env.MONGODB_DB ?? 'lauchgruen';
	return client.db(dbName);
}

export async function closeMongo(): Promise<void> {
	if (clientPromise) {
		const promise = clientPromise;
		clientPromise = null;
		const client = await promise;
		await client.close();
	}
}
