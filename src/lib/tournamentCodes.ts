import { config } from '../config.js';
import { createTournament, createTournamentProvider, generateTournamentCodes } from './riot.js';
import { updateStorage } from './storage.js';

/**
 * Ensure a Riot tournament provider + tournament exist in storage.
 * Returns the tournamentId. Idempotent — only creates once.
 */
export async function ensureTournament(): Promise<number> {
	return updateStorage(async (storage) => {
		if (storage.tournament.tournamentId !== undefined) {
			return storage.tournament.tournamentId;
		}

		let providerId = storage.tournament.providerId;
		if (providerId === undefined) {
			console.log('[tournament] Erstelle Provider...');
			providerId = await createTournamentProvider(config.tournamentCallbackUrl);
			storage.tournament.providerId = providerId;
			console.log(`[tournament] Provider ID: ${providerId}`);
		}

		console.log('[tournament] Erstelle Tournament...');
		const tournamentId = await createTournament(providerId, 'Fearless Tournament');
		storage.tournament.tournamentId = tournamentId;
		console.log(`[tournament] Tournament ID: ${tournamentId}`);

		return tournamentId;
	});
}

/**
 * Get the tournament code for a match, generating it if it doesn't exist yet.
 * Returns the code string.
 */
export async function getOrCreateMatchCode(matchId: string, allowedPuuids: string[]): Promise<string> {
	return updateStorage(async (storage) => {
		const match = storage.tournament.matches.find((m) => m.id === matchId);
		if (!match) throw new Error(`Match "${matchId}" nicht in storage gefunden.`);

		if (match.tournamentCode) return match.tournamentCode;

		const tournamentId = await ensureTournament();
		const codes = await generateTournamentCodes({
			tournamentId,
			allowedPuuids: allowedPuuids.length > 0 ? allowedPuuids : undefined,
			count: 1,
		});

		const code = codes[0];
		if (!code) throw new Error('Riot API hat keinen Tournament Code zurueckgegeben.');

		match.tournamentCode = code;
		return code;
	});
}
