import { SlashCommandBuilder } from 'discord.js';
import { embedBase, embedErreur, embedSucces, COULEURS } from '../utils/embeds.js';
import { createRequest, processRequest } from '../utils/code-agent.js';
import { OWNER_ID } from '../utils/setup.js';

const ALLOWED_ROLES = new Set(['1502722412607836310', '1502788350665556149']);

export const data = new SlashCommandBuilder()
  .setName('modifier')
  .setDescription('Soumettre une demande de modification du bot ou de la webapp')
  .addStringOption(opt =>
    opt.setName('demande')
      .setDescription('Décrivez précisément ce que vous souhaitez modifier')
      .setRequired(true)
      .setMaxLength(1000)
  );

export async function execute(interaction) {
  const hasRole = interaction.member?.roles?.cache?.some(r => ALLOWED_ROLES.has(r.id))
               || interaction.user.id === OWNER_ID;

  if (!hasRole) {
    return interaction.reply({
      embeds: [embedErreur('Vous n\'avez pas la permission d\'utiliser cette commande.')],
      flags: 64,
    });
  }

  const description = interaction.options.getString('demande');

  await interaction.reply({
    embeds: [embedBase(
      '⚙️ Demande enregistrée',
      `Votre demande est en cours d'analyse par l'agent IA.\n\n> *${description}*\n\nUn aperçu des modifications sera envoyé pour validation. Cela peut prendre 1 à 2 minutes.`,
      COULEURS.or
    ).addFields({ name: '🔄 Statut', value: 'Traitement en cours…', inline: true })],
    flags: 64,
  });

  // Enregistre la demande en BDD
  const requestId = createRequest(interaction.user.id, interaction.user.username, description);

  // Traite de manière asynchrone (appel claude -p)
  processRequest(requestId)
    .then(async ({ parsed, diff, hasError }) => {
      const owner = await interaction.client.users.fetch(OWNER_ID).catch(() => null);
      if (!owner) return;

      if (hasError) {
        owner.send({
          embeds: [embedBase(
            `⚠️ Demande #${requestId} — Refus IA`,
            `**Demandeur :** ${interaction.user.username}\n**Demande :** ${description}\n\n${diff}`,
            COULEURS.rouge
          )],
        });
        return;
      }

      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`modifier_approve:${requestId}`)
          .setLabel('✅ Approuver & Appliquer')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`modifier_refuse:${requestId}`)
          .setLabel('❌ Refuser')
          .setStyle(ButtonStyle.Danger),
      );

      const embed = embedBase(
        `🛠️ Demande de modification #${requestId}`,
        `**Demandeur :** ${interaction.user.username} (<@${interaction.user.id}>)\n\n**Demande :**\n> ${description}\n\n${diff}`,
        COULEURS.bleu
      ).addFields({ name: '⚠️ Action requise', value: 'Approuvez ou refusez cette demande. Les fichiers seront sauvegardés avant toute modification.' });

      owner.send({ embeds: [embed], components: [row] });
    })
    .catch(async (err) => {
      const owner = await interaction.client.users.fetch(OWNER_ID).catch(() => null);
      if (owner) {
        owner.send({
          embeds: [embedBase(
            `❌ Erreur — Demande #${requestId}`,
            `**Demandeur :** ${interaction.user.username}\n**Demande :** ${description}\n\n**Erreur :** ${err.message}`,
            COULEURS.rouge
          )],
        });
      }
    });
}
