import { SlashCommandBuilder } from 'discord.js';
import db from '../db/database.js';
import { bronzeVersTexte, statutEmoji } from '../utils/monnaie.js';
import { embedBase, COULEURS } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('macommande')
  .setDescription('Voir l\'état de vos commandes auprès de la Compagnie du Fjord');

export async function execute(interaction) {
  const rows = db.prepare(
    "SELECT * FROM commandes WHERE client_id = ? ORDER BY creee_le DESC LIMIT 10"
  ).all(interaction.user.id);

  if (rows.length === 0) {
    const embed = embedBase(
      '📋 Vos commandes',
      '*Vous n\'avez aucune commande en cours auprès de la Compagnie du Fjord.*\n\nUtilisez `/commander` pour passer votre première commande !',
      COULEURS.gris
    );
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  const embed = embedBase(
    '📋 Vos commandes — La Compagnie du Fjord',
    '*Voici vos 10 dernières commandes.*',
    COULEURS.bleu
  );

  for (const r of rows) {
    const statut = `${statutEmoji(r.statut)} ${r.statut.replace('_', ' ')}`;
    embed.addFields({
      name: `#${String(r.id).padStart(4, '0')} — ${r.ressource} × ${r.quantite}`,
      value: `💰 ${bronzeVersTexte(r.prix_total)} | ${statut} | 📅 ${r.creee_le.split('T')[0]}`,
      inline: false
    });
  }

  return interaction.reply({ embeds: [embed], flags: 64 });
}
