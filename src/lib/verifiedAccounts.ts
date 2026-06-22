/**
 * Read-only access to the `verified_riot_accounts` collection that the Web
 * app writes during applicant Riot-ID verification.
 *
 * The bot uses this for slash commands that need to confirm "is this Discord
 * user actually who they claim to be on Riot?" — e.g. /setteammeta when
 * assigning a captain.
 */

import { getDb } from './mongo.js';

const COLLECTION = 'verified_riot_accounts';

export type VerifiedRiotAccount = {
	discordId: string;
	riotId: string;
	gameName: string;
	tagLine: string;
	puuid: string;
	currentRankAuto: string | null;
	verifiedAt: string;
};

type Doc = VerifiedRiotAccount & { _id: string };

export async function getVerifiedAccountByDiscordId(discordId: string): Promise<VerifiedRiotAccount | null> {
	const db = await getDb();
	const doc = await db.collection<Doc>(COLLECTION).findOne({ _id: discordId });
	if (!doc) return null;
	const { _id, ...rest } = doc;
	void _id;
	return rest as VerifiedRiotAccount;
}

export async function listVerifiedAccounts(): Promise<VerifiedRiotAccount[]> {
	const db = await getDb();
	const docs = await db.collection<Doc>(COLLECTION).find({}).toArray();
	return docs.map((d) => {
		const { _id, ...rest } = d;
		void _id;
		return rest as VerifiedRiotAccount;
	});
}
