import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import db from '../db/database.js';

export const data = new SlashCommandBuilder()
  .setName('inventaire')
  .setDescription('Affiche l\'historique et la réputation d\'un client')
  .addUserOption(opt => opt
    .setName('membre')
    .setDescription('Membre Discord')
    .setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });
  const user = interaction.options.getUser('membre');

  const commandes = db.prepare(
    'SELECT * FROM commandes WHERE client_id=? ORDER BY creee_le DESC LIMIT 20'
  ).all(user.id);

  const rep = db.prepare(
    'SELECT ROUND(AVG(note),1) as moyenne, COUNT(*) as total FROM client_notes WHERE client_id=?'
  ).get(user.id);

  const stars = (n) => {
    n = Math.round(n || 0);
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  };

  const STATUT = { en_attente:'⏳', en_cours:'⚒️', prete:'📦', livree:'✅', annulee:'❌' };

  const cmdLines = commandes.length
    ? commandes.map(c => `${STATUT[c.statut]??'•'} **#${String(c.id).padStart(4,'0')}** — ${c.ressource} ×${c.quantite} · ${c.prix_total}🟤 · <t:${Math.floor(new Date(c.creee_le).getTime()/1000)}:d>`).join('\n')
    : '*Aucune commande.*';

  const embed = new EmbedBuilder()
    .setTitle(`📋 Fiche client — ${user.displayName ?? user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .setColor(0xC9A84C)
    .addFields(
      {
        name: '⭐ Réputation',
        value: rep?.total
          ? `${stars(rep.moyenne)} **${rep.moyenne}/5** (${rep.total} évaluation${rep.total>1?'s':''})`
          : '*Aucune évaluation.*',
        inline: false,
      },
      {
        name: `📦 Dernières commandes (${commandes.length})`,
        value: cmdLines.slice(0, 1024),
        inline: false,
      }
    )
    .setFooter({ text: 'La Compagnie du Fjord — Les 3 Routes' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
