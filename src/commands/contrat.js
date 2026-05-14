import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { stmts } from '../db/database.js';

const STATUT_LABEL = {
  ouvert:   '📢 Ouvert',
  accepte:  '🤝 Accepté',
  en_cours: '⚒️ En cours',
  livre:    '✅ Livré',
  expire:   '⌛ Expiré',
  annule:   '❌ Annulé',
  litige:   '⚠️ Litige',
};

const STATUT_COLOR = {
  ouvert: 0x5865F2, accepte: 0x00CC66, en_cours: 0xFF8C00,
  livre: 0x57F287, expire: 0x888888, annule: 0xFF4444, litige: 0xFFCC00,
};

function parseDelai(str) {
  // Accepte "3j", "2d", "48h", "1semaine"
  const m = str.match(/^(\d+)\s*(j|d|h|s|semaine|jour|heure)/i);
  if (!m) return null;
  const n = parseInt(m[1]);
  const unit = m[2].toLowerCase();
  let heures = 0;
  if (unit.startsWith('h')) heures = n;
  else if (unit.startsWith('s') || unit === 'semaine') heures = n * 24 * 7;
  else heures = n * 24;
  const d = new Date();
  d.setHours(d.getHours() + heures);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function contratEmbed(c, client) {
  const echeance = new Date(c.echeance_le.replace(' ', 'T') + 'Z');
  const embed = new EmbedBuilder()
    .setTitle(`📜 Contrat #${String(c.id).padStart(4,'0')} — ${c.ressource}`)
    .setColor(STATUT_COLOR[c.statut] ?? 0xC9A84C)
    .addFields(
      { name: 'Statut',    value: STATUT_LABEL[c.statut] ?? c.statut, inline: true },
      { name: 'Ressource', value: `${c.quantite} ${c.unite} de **${c.ressource}**`, inline: true },
      { name: 'Prix',      value: `**${c.prix_total}🟤**`, inline: true },
      { name: 'Vendeur',   value: c.vendeur_pseudo, inline: true },
      { name: 'Acheteur',  value: c.acheteur_pseudo ?? '*Non accepté*', inline: true },
      { name: 'Pénalité',  value: c.penalite > 0 ? `${c.penalite}🟤` : 'Aucune', inline: true },
      { name: 'Échéance',  value: `<t:${Math.floor(echeance.getTime()/1000)}:R>`, inline: true },
    )
    .setFooter({ text: 'La Compagnie du Fjord — Système de Contrats' })
    .setTimestamp();

  if (c.note) embed.addFields({ name: 'Note', value: c.note });
  return embed;
}

export const data = new SlashCommandBuilder()
  .setName('contrat')
  .setDescription('Gérer les contrats commerciaux de la Compagnie')
  .addSubcommand(sub => sub
    .setName('creer')
    .setDescription('Proposer un nouveau contrat de livraison')
    .addStringOption(opt => opt.setName('ressource').setDescription('Ressource à livrer').setRequired(true))
    .addNumberOption(opt => opt.setName('quantite').setDescription('Quantité').setRequired(true))
    .addIntegerOption(opt => opt.setName('prix').setDescription('Prix total en bronze').setRequired(true))
    .addStringOption(opt => opt.setName('delai').setDescription('Délai de livraison (ex: 3j, 48h, 1semaine)').setRequired(true))
    .addStringOption(opt => opt.setName('unite').setDescription('Unité (défaut: Unité)').setRequired(false))
    .addIntegerOption(opt => opt.setName('penalite').setDescription('Pénalité de retard en bronze (optionnel)').setRequired(false))
    .addStringOption(opt => opt.setName('note').setDescription('Note ou conditions particulières').setRequired(false))
  )
  .addSubcommand(sub => sub
    .setName('voir')
    .setDescription('Voir les détails d\'un contrat')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID du contrat').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('lister')
    .setDescription('Lister les contrats ouverts ou les tiens')
    .addStringOption(opt => opt
      .setName('filtre')
      .setDescription('Filtre')
      .addChoices(
        { name: '📢 Contrats ouverts (disponibles)', value: 'ouverts' },
        { name: '👤 Mes contrats', value: 'miens' },
      )
      .setRequired(false)
    )
  )
  .addSubcommand(sub => sub
    .setName('accepter')
    .setDescription('Accepter un contrat ouvert')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID du contrat').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('statut')
    .setDescription('Changer le statut d\'un de tes contrats')
    .addIntegerOption(opt => opt.setName('id').setDescription('ID du contrat').setRequired(true))
    .addStringOption(opt => opt
      .setName('statut')
      .setDescription('Nouveau statut')
      .addChoices(
        { name: '⚒️ En cours', value: 'en_cours' },
        { name: '✅ Livré',    value: 'livre' },
        { name: '❌ Annuler',  value: 'annule' },
        { name: '⚠️ Litige',  value: 'litige' },
      )
      .setRequired(true)
    )
  );

export async function execute(interaction) {
  const sub    = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const pseudo = interaction.member?.displayName ?? interaction.user.username;

  // ── Créer ────────────────────────────────────────────────────────────────────
  if (sub === 'creer') {
    const ressource = interaction.options.getString('ressource');
    const quantite  = interaction.options.getNumber('quantite');
    const prix      = interaction.options.getInteger('prix');
    const delaiStr  = interaction.options.getString('delai');
    const unite     = interaction.options.getString('unite') ?? 'Unité';
    const penalite  = interaction.options.getInteger('penalite') ?? 0;
    const note      = interaction.options.getString('note') ?? '';

    const echeance = parseDelai(delaiStr);
    if (!echeance) {
      return interaction.reply({ content: '❌ Format de délai invalide. Exemples : `3j`, `48h`, `1semaine`', flags: 64 });
    }

    const result = stmts.contratInsert.run(userId, pseudo, ressource, quantite, unite, prix, penalite, note, echeance);
    const contrat = stmts.contratById.get(result.lastInsertRowid);

    const embed = contratEmbed(contrat, interaction.client);
    embed.setDescription(`✅ Contrat créé ! D'autres membres peuvent l'accepter avec \`/contrat accepter id:${contrat.id}\``);

    await interaction.reply({ embeds: [embed] });
    return;
  }

  // ── Voir ─────────────────────────────────────────────────────────────────────
  if (sub === 'voir') {
    const id = interaction.options.getInteger('id');
    const c  = stmts.contratById.get(id);
    if (!c) return interaction.reply({ content: `❌ Contrat #${id} introuvable.`, flags: 64 });
    await interaction.reply({ embeds: [contratEmbed(c, interaction.client)], flags: 64 });
    return;
  }

  // ── Lister ───────────────────────────────────────────────────────────────────
  if (sub === 'lister') {
    const filtre = interaction.options.getString('filtre') ?? 'ouverts';
    const contrats = filtre === 'miens'
      ? stmts.contratByUser.all(userId, userId)
      : stmts.contratOuverts.all();

    if (contrats.length === 0) {
      return interaction.reply({ content: filtre === 'miens' ? '📭 Tu n\'as aucun contrat.' : '📭 Aucun contrat ouvert en ce moment.', flags: 64 });
    }

    const lines = contrats.map(c => {
      const echeance = new Date(c.echeance_le.replace(' ', 'T') + 'Z');
      return `**#${String(c.id).padStart(4,'0')}** — ${c.ressource} ×${c.quantite} · **${c.prix_total}🟤** · ${STATUT_LABEL[c.statut]} · ⏰ <t:${Math.floor(echeance.getTime()/1000)}:R> · Vendeur: ${c.vendeur_pseudo}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(filtre === 'miens' ? '📜 Mes contrats' : '📢 Contrats ouverts')
      .setDescription(lines.slice(0, 4000))
      .setColor(0x5865F2)
      .setFooter({ text: `${contrats.length} contrat(s) · /contrat voir id:<n> pour les détails` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
    return;
  }

  // ── Accepter ─────────────────────────────────────────────────────────────────
  if (sub === 'accepter') {
    const id = interaction.options.getInteger('id');
    const c  = stmts.contratById.get(id);

    if (!c) return interaction.reply({ content: `❌ Contrat #${id} introuvable.`, flags: 64 });
    if (c.statut !== 'ouvert') return interaction.reply({ content: `❌ Ce contrat n'est plus ouvert (statut : ${STATUT_LABEL[c.statut]}).`, flags: 64 });
    if (c.vendeur_id === userId) return interaction.reply({ content: '❌ Tu ne peux pas accepter ton propre contrat.', flags: 64 });

    stmts.contratAccepter.run(userId, pseudo, id);
    const updated = stmts.contratById.get(id);

    const embed = contratEmbed(updated, interaction.client);
    embed.setDescription(`🤝 **${pseudo}** a accepté ce contrat ! Le vendeur **${c.vendeur_pseudo}** doit maintenant livrer avant l'échéance.`);

    await interaction.reply({ embeds: [embed] });

    // Notifier le vendeur en DM
    try {
      const vendeur = await interaction.client.users.fetch(c.vendeur_id);
      const echeance = new Date(c.echeance_le.replace(' ', 'T') + 'Z');
      await vendeur.send({
        embeds: [new EmbedBuilder()
          .setTitle(`🤝 Ton contrat #${String(id).padStart(4,'0')} a été accepté !`)
          .setDescription(`**${pseudo}** a accepté ton contrat de livraison.\n**${c.ressource}** ×${c.quantite} · **${c.prix_total}🟤**\nÉchéance : <t:${Math.floor(echeance.getTime()/1000)}:R>${c.penalite > 0 ? `\nPénalité de retard : ${c.penalite}🟤` : ''}`)
          .setColor(0x00CC66)
          .setTimestamp()
        ]
      });
    } catch {}
    return;
  }

  // ── Statut ───────────────────────────────────────────────────────────────────
  if (sub === 'statut') {
    const id       = interaction.options.getInteger('id');
    const newStat  = interaction.options.getString('statut');
    const c        = stmts.contratById.get(id);

    if (!c) return interaction.reply({ content: `❌ Contrat #${id} introuvable.`, flags: 64 });
    if (c.vendeur_id !== userId && c.acheteur_id !== userId) {
      return interaction.reply({ content: '❌ Tu n\'es pas partie prenante de ce contrat.', flags: 64 });
    }

    stmts.contratSetStatut.run(newStat, id);
    const updated = stmts.contratById.get(id);

    // Notifier l'autre partie en DM
    try {
      const autreId = c.vendeur_id === userId ? c.acheteur_id : c.vendeur_id;
      if (autreId) {
        const autre = await interaction.client.users.fetch(autreId);
        await autre.send({
          embeds: [new EmbedBuilder()
            .setTitle(`📜 Contrat #${String(id).padStart(4,'0')} — Statut mis à jour`)
            .setDescription(`Le statut est passé à **${STATUT_LABEL[newStat]}** par **${pseudo}**.\n${c.ressource} ×${c.quantite} · ${c.prix_total}🟤`)
            .setColor(STATUT_COLOR[newStat] ?? 0xC9A84C)
            .setTimestamp()
          ]
        });
      }
    } catch {}

    await interaction.reply({ embeds: [contratEmbed(updated, interaction.client)], flags: 64 });
    return;
  }
}
