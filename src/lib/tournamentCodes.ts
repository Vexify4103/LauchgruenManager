import { config } from '../config.js';
import { createTournament, createTournamentProvider, generateTournamentCodes } from './riot.js';
import { loadStorage, updateStorage } from './storage.js';
import type { Storage } from '../types.js';

/** Ensure provider + tournament exist. Must be called inside an updateStorage mutator. */
async function ensureTournamentInStorage(storage: Storage): Promise<number> {
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
}

/** Get the tournament code for a match, generating it on first call. */
export async function getOrCreateMatchCode(matchId: string, allowedPuuids: string[]): Promise<string> {
	return updateStorage(async (storage) => {
		const match = storage.tournament.matches.find((m) => m.id === matchId);
		if (!match) throw new Error(`Match "${matchId}" nicht in storage gefunden.`);

		if (match.tournamentCode) return match.tournamentCode;

		// Run tournament setup inline — never call updateStorage here to avoid deadlock
		const tournamentId = await ensureTournamentInStorage(storage);

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
