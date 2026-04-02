import dotenv from 'dotenv';

dotenv.config();

function getEnv(name: string): string {
	const value = process.env[name];

	if (!value) {
		throw new Error(`Missing environment variable: ${name}`);
	}

	return value;
}

export const config = {
	token: getEnv('DISCORD_TOKEN'),
	clientId: getEnv('DISCORD_CLIENT_ID'),
	guildId: getEnv('DISCORD_GUILD_ID'),
	tournamentRoleId: process.env.TOURNAMENT_ROLE_ID ?? '1476317147113193613',
};
