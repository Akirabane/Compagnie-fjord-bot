import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import db from '../db/database.js';
import { OWNER_ID } from '../utils/setup.js';
import { bronzeVersTexte } from '../utils/monnaie.js';

const WRITE_ROLES = new Set(['1502722412607836310', '1502788350665556149']);

function canSeeOthers(interaction) {
  if (interaction.user.id === OWNER_ID) return true;
  return interaction.member?.roles?.cache?.some(r => WRITE_ROLES.has(r.id)) ?? false;
}

export const data = new SlashCommandBuilder()
  .setName('profil')
  .setDescription('Affiche la fiche d\'un membre ou la vôtre')
  .addUserOption(opt =>
    opt.setName('membre')
      .setDescription('Membre à consulter (admin uniquement)')
      .setRequired(false)
  );

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('membre');

  if (targetUser && targetUser.id !== interaction.user.id && !canSeeOthers(interaction)) {
    return interaction.reply({ content: '🔒 Vous ne pouvez consulter que votre propre profil.', flags: 64 });
  }

  const user   = targetUser ?? interaction.user;
  const userId = user.id;

  await interaction.deferReply({ flags: 64 });

  // Données client
  const stats    = db.prepare('SELECT * FROM client_stats WHERE client_id=?').get(userId);
  const notes    = db.prepare('SELECT * FROM client_notes WHERE client_id=? ORDER BY creee_le DESC LIMIT 3').all(userId);
  const cmdsActi = db.prepare("SELECT * FROM commandes WHERE client_id=? AND statut NOT IN ('livree','annulee') ORDER BY creee_le DESC LIMIT 5").all(userId);
  const cmdsHist = db.prepare("SELECT * FROM commandes WHERE client_id=? ORDER BY creee_le DESC LIMIT 5").all(userId);
  const contrats = db.prepare("SELECT * FROM contrats WHERE vendeur_id=? OR acheteur_id=? ORDER BY creee_le DESC LIMIT 3").all(userId, userId);
  const profile  = db.prepare('SELECT * FROM player_profiles WHERE user_id=?').get(userId);

  const statutBadge = s => ({ en_attente:'⏳', en_cours:'⚒️', prete:'📦', livree:'✅', annulee:'❌' }[s] ?? '?');
  const segColors   = { NOUVEAU: 0x6b7a96, REGULIER: 0x4a90e2, VIP: 0xC9A84C, FIABLE: 0x3dd68c };

  const embed = new EmbedBuilder()
    .setTitle(`🗂️ Profil — ${profile?.nom_rp || user.displayName || user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .setColor(segColors[stats?.segment ?? 'NOUVEAU'] ?? 0x6b7a96)
    .setTimestamp();

  // Segment & stats
  const segEmoji = { NOUVEAU:'🌱', REGULIER:'⭐', VIP:'👑', FIABLE:'🛡️' };
  embed.addFields({
    name: '📊 Statistiques',
    value: stats
      ? `${segEmoji[stats.segment]??'🌱'} **${stats.segment}**\n` +
        `• Commandes : **${stats.nb_commandes}** (${stats.nb_livrees} livrées, ${stats.nb_annulees} annulées)\n` +
        `• Total dépensé : **${bronzeVersTexte(stats.total_bronze)}**`
      : '*Aucune commande passée*',
    inline: false,
  });

  // Commandes actives
  if (cmdsActi.length) {
    embed.addFields({
      name: '🛒 Commandes en cours',
      value: cmdsActi.map(c => `${statutBadge(c.statut)} #${c.id} — ${c.ressource} ×${c.quantite} ${c.unite} (${bronzeVersTexte(c.prix_total)})`).join('\n'),
      inline: false,
    });
  }

  // Contrats
  if (contrats.length) {
    embed.addFields({
      name: '📜 Contrats récents',
      value: contrats.map(c => {
        const role = c.vendeur_id === userId ? 'Vendeur' : 'Acheteur';
        return `• [${role}] ${c.ressource} ×${c.quantite} — **${c.statut}** (échéance ${c.echeance_le?.slice(0,10)})`;
      }).join('\n'),
      inline: false,
    });
  }

  // Notes
  if (notes.length) {
    embed.addFields({
      name: '📝 Notes',
      value: notes.map(n => `${'⭐'.repeat(n.note)} — *${n.commentaire || 'Sans commentaire'}* (${n.auteur})`).join('\n'),
      inline: false,
    });
  }

  // Historique récent
  if (cmdsHist.length) {
    embed.addFields({
      name: '📋 Historique récent',
      value: cmdsHist.map(c => `${statutBadge(c.statut)} ${c.ressource} ×${c.quantite} — ${c.creee_le?.slice(0,10)}`).join('\n'),
      inline: false,
    });
  }

  if (profile?.notes) {
    embed.addFields({ name: '💬 Note interne', value: profile.notes.slice(0, 200), inline: false });
  }

  embed.setFooter({ text: `ID Discord : ${userId}` });

  await interaction.editReply({ embeds: [embed] });
}
