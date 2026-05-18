/**
 * Read-only access to the `tournament_applications` collection that the Web
 * app writes when a player submits the apply form. The bot uses this to pull
 * preferred-role information when adding a verified player to a team.
 */

import { getDb } from './mongo.js';

const COLLECTION = 'tournament_applications';

export type TournamentApplication = {
	id: string;
	displayName: string;
	riotId: string;
	riotPuuid: string;
	riotVerifiedAt: string;
	currentRankAuto: string | null;
	discordId: string;
	discordHandle: string;
	discordUsername?: string;
	preferredRoles: string[];
	lastSeasonRank: string;
	availableAllDates: true;
	notes: string;
	acceptedRules: true;
	acceptedDataStorage: true;
	createdAt: string;
	updatedAt: string;
};

type Doc = TournamentApplication & { _id: string };

export async function getApplicationByDiscordId(
	discordId: string
): Promise<TournamentApplication | null> {
	const db = await getDb();
	// Applications are keyed `${puuid}|${discordId}`, so we have to scan by field.
	const doc = await db
		.collection<Doc>(COLLECTION)
		.findOne({ discordId });
	if (!doc) return null;
	const { _id, ...rest } = doc;
	void _id;
	return rest as TournamentApplication;
}
