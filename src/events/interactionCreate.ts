import type { BotEvent } from '../types.js';

const interactionCreateEvent: BotEvent<'interactionCreate'> = {
	name: 'interactionCreate',
	async execute(client, interaction) {
		if (!interaction.isChatInputCommand()) {
			return;
		}

		if (!interaction.inCachedGuild()) {
			if (interaction.isRepliable()) {
				await interaction.reply({
					content: 'Guild-Kontext konnte nicht geladen werden.',
					ephemeral: true,
				});
			}
			return;
		}

		const command = client.commands.get(interaction.commandName);

		if (!command) {
			await interaction.reply({
				content: 'Dieser Command ist nicht registriert.',
				ephemeral: true,
			});
			return;
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(`Fehler in /${interaction.commandName}:`, error);

			if (interaction.deferred || interaction.replied) {
				await interaction.editReply('Beim Ausfuehren des Commands ist ein Fehler aufgetreten.');
				return;
			}

			await interaction.reply({
				content: 'Beim Ausfuehren des Commands ist ein Fehler aufgetreten.',
				ephemeral: true,
			});
		}
	},
};

export default interactionCreateEvent;
