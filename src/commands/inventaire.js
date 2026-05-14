import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import db, { stmts } from '../db/database.js';
import { calcSegment, segmentEmoji } from '../utils/alertes.js';

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

  const notes = db.prepare(
    'SELECT note, commentaire, auteur, creee_le FROM client_notes WHERE client_id=? ORDER BY creee_le DESC LIMIT 3'
  ).all(user.id);

  const nb_livrees  = commandes.filter(c => c.statut === 'livree').length;
  const nb_annulees = commandes.filter(c => c.statut === 'annulee').length;
  const total_bx    = commandes.filter(c => c.statut === 'livree').reduce((s, c) => s + c.prix_total, 0);
  const segment     = calcSegment(nb_livrees, nb_annulees, total_bx);
  const segEmoji    = segmentEmoji(segment);

  const stars = (n) => {
    n = Math.round(n || 0);
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  };

  const STATUT = { en_attente:'⏳', en_cours:'⚒️', prete:'📦', livree:'✅', annulee:'❌' };

  const cmdLines = commandes.length
    ? commandes.map(c =>
        `${STATUT[c.statut]??'•'} **#${String(c.id).padStart(4,'0')}** — ${c.ressource} ×${c.quantite} · ${c.prix_total}🟤 · <t:${Math.floor(new Date(c.creee_le).getTime()/1000)}:d>`
      ).join('\n')
    : '*Aucune commande.*';

  const SEGMENT_DESC = {
    VIP:      '👑 **VIP** — Client fidèle à fort volume. Priorité maximale.',
    REGULIER: '🤝 **Régulier** — Client de confiance.',
    RISQUE:   '⚠️ **Risque** — Nombreuses annulations. Prudence recommandée.',
    NOUVEAU:  '🆕 **Nouveau** — Première(s) commande(s).',
  };

  const SEGMENT_COLOR = {
    VIP: 0xFFD700, REGULIER: 0x00CC66, RISQUE: 0xFF4444, NOUVEAU: 0x5865F2,
  };

  const notesLines = notes.length
    ? notes.map(n => `${stars(n.note)} *"${n.commentaire}"* — ${n.auteur}`).join('\n')
    : '*Aucun commentaire.*';

  const embed = new EmbedBuilder()
    .setTitle(`${segEmoji} Fiche client — ${user.displayName ?? user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .setColor(SEGMENT_COLOR[segment] ?? 0xC9A84C)
    .addFields(
      {
        name: '🏷️ Segment',
        value: SEGMENT_DESC[segment] ?? segment,
        inline: false,
      },
      {
        name: '📊 Statistiques',
        value:
          `📦 **${commandes.length}** commande(s) · ✅ **${nb_livrees}** livrée(s) · ❌ **${nb_annulees}** annulée(s)\n` +
          `💰 Total dépensé : **${total_bx}🟤**`,
        inline: false,
      },
      {
        name: '⭐ Réputation',
        value: rep?.total
          ? `${stars(rep.moyenne)} **${rep.moyenne}/5** (${rep.total} évaluation${rep.total>1?'s':''})\n${notesLines}`
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
