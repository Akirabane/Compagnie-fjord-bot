import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import db from '../db/database.js';
import { isMarchand, refus } from '../utils/auth.js';
import { bronzeVersTexte, statutEmoji } from '../utils/monnaie.js';
import { embedBase, embedErreur, embedSucces, COULEURS } from '../utils/embeds.js';
import { paginationButtons, paginate, PAGE_SIZE } from '../utils/pagination.js';
import { refreshStockEmbed } from '../utils/setup.js';
import { getForumCommandesId, getBuyerPostId, setBuyerPostId, removeBuyerPost, isBuyerDone } from '../utils/forum.js';

const STATUTS = [
  { value: 'actives',    label: '🔄 En cours',    desc: 'En attente + En cours + Prêtes' },
  { value: 'en_attente', label: '⏳ En attente',  desc: 'Commandes non encore prises en charge' },
  { value: 'en_cours',   label: '⚒️ En cours',    desc: 'En préparation' },
  { value: 'prete',      label: '📦 Prêtes',       desc: 'À récupérer à Fjordheim' },
  { value: 'livree',     label: '✅ Livrées',      desc: 'Transactions terminées' },
  { value: 'annulee',    label: '❌ Annulées',     desc: 'Commandes annulées' },
];

// ── Forum Discord (1 post par acheteur) ──────────────────────────────────────
async function getOrCreateBuyerPost(client, clientId, clientPseudo) {
  const forumId = getForumCommandesId();
  if (!forumId) return null;

  let postId = getBuyerPostId(clientId);
  if (postId) {
    const ok = await client.channels.fetch(postId).catch(() => null);
    if (ok) return postId;
    removeBuyerPost(clientId);
  }

  try {
    const forum = await client.channels.fetch(forumId);
    const mention = clientId !== '0' ? ` (<@${clientId}>)` : '';
    const thread = await forum.threads.create({
      name: `🛒 ${clientPseudo}`,
      message: {
        embeds: [{
          title: `📋 Commandes — ${clientPseudo}`,
          description: `Ce fil regroupe toutes les commandes actives de **${clientPseudo}**${mention}.\nUn marchand les traitera dans les plus brefs délais. ⚓`,
          color: 0xC9A84C,
          footer: { text: 'La Compagnie du Fjord — Les 3 Routes' },
          timestamp: new Date().toISOString(),
        }],
      },
    });
    setBuyerPostId(clientId, thread.id);
    return thread.id;
  } catch (e) { console.error('[forum buyer create]', e); return null; }
}

async function createTicket(client, commande) {
  const postId = await getOrCreateBuyerPost(client, commande.client_id, commande.client_pseudo);
  if (!postId) return null;
  const num = String(commande.id).padStart(4, '0');
  try {
    const thread = await client.channels.fetch(postId);
    const embed = new EmbedBuilder()
      .setTitle(`📦 Commande #${num}`)
      .setColor(0xC9A84C)
      .addFields(
        { name: '📦 Ressource', value: commande.ressource, inline: true },
        { name: '🔢 Quantité',  value: `${commande.quantite} ${commande.unite}`, inline: true },
        { name: '💰 Total',     value: bronzeVersTexte(commande.prix_total), inline: true },
        { name: '⏳ Statut',    value: '⏳ En attente', inline: true },
        ...(commande.vendeur_pseudo ? [{ name: '⚓ Enregistré par', value: commande.vendeur_pseudo, inline: true }] : []),
        ...(commande.note ? [{ name: '📝 Note', value: commande.note, inline: false }] : []),
      )
      .setTimestamp()
      .setFooter({ text: 'La Compagnie du Fjord — Les 3 Routes' });

    const actions = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cmd_statut:${commande.id}:en_cours`).setLabel('⚒️ En cours').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`cmd_statut:${commande.id}:prete`).setLabel('📦 Prête').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cmd_statut:${commande.id}:livree`).setLabel('✅ Livrée').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cmd_statut:${commande.id}:annulee`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
    );

    const msg = await thread.send({ embeds: [embed], components: [actions] });
    db.prepare('UPDATE commandes SET ticket_id=?, ticket_msg_id=? WHERE id=?').run(postId, msg.id, commande.id);
    return postId;
  } catch (e) { console.error('[forum ticket msg]', e); return null; }
}

async function updateTicket(client, commande) {
  if (!commande.ticket_id) return;
  const LABELS = { en_attente:'⏳ En attente', en_cours:'⚒️ En cours', prete:'📦 Prête', livree:'✅ Livrée', annulee:'❌ Annulée' };
  const isTerminal = ['livree', 'annulee'].includes(commande.statut);

  if (commande.ticket_msg_id) {
    try {
      const thread = await client.channels.fetch(commande.ticket_id);
      const msg = await thread.messages.fetch(commande.ticket_msg_id);
      const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
        .setColor(isTerminal ? (commande.statut === 'livree' ? 0x3fb950 : 0xf85149) : 0xC9A84C)
        .setFields(msg.embeds[0].fields.map(f =>
          f.name.includes('Statut') ? { ...f, value: LABELS[commande.statut] ?? commande.statut } : f
        ));
      await msg.edit({ embeds: [updatedEmbed], components: isTerminal ? [] : msg.components });
    } catch {}
  }

  if (isTerminal && isBuyerDone(commande.client_id)) {
    try {
      const thread = await client.channels.fetch(commande.ticket_id);
      if (thread) await thread.delete();
      removeBuyerPost(commande.client_id);
    } catch {}
  }
}

// ── Helpers embed ─────────────────────────────────────────────────────────────
function fetchCommandes(filtre) {
  if (filtre === 'actives') {
    return db.prepare("SELECT * FROM commandes WHERE statut IN ('en_attente','en_cours','prete') ORDER BY creee_le DESC").all();
  }
  return db.prepare('SELECT * FROM commandes WHERE statut=? ORDER BY creee_le DESC').all(filtre);
}

function buildListeEmbed(filtre, page) {
  const all    = fetchCommandes(filtre);
  const items  = paginate(all, page);
  const label  = STATUTS.find(s => s.value === filtre)?.label ?? filtre;
  const maxPage = Math.ceil(all.length / PAGE_SIZE);

  const embed = embedBase(
    `📋 Commandes — ${label}`,
    all.length === 0
      ? '*Aucune commande.*'
      : `*${all.length} commande${all.length > 1 ? 's' : ''} · Page ${page + 1}/${maxPage}*`,
    COULEURS.bleu
  );

  for (const r of items) {
    const date = (r.creee_le || '').slice(0, 10);
    embed.addFields({
      name: `${statutEmoji(r.statut)} #${String(r.id).padStart(4,'0')} — ${r.ressource}`,
      value: `👤 **${r.client_pseudo}** · 🔢 ×${r.quantite} · 💰 ${bronzeVersTexte(r.prix_total)}\n📅 ${date}${r.note ? `\n📝 *${r.note}*` : ''}${r.ticket_id ? `\n🎫 <#${r.ticket_id}>` : ''}`,
      inline: false,
    });
  }

  const menuRow  = buildFiltreMenu(filtre);
  const pageRows = all.length > 0 ? paginationButtons(`cmdlist:${filtre}`, page, all.length) : [];
  return { embed, components: [menuRow, ...pageRows] };
}

function buildFiltreMenu(actif) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('cmd_filtre')
    .setPlaceholder(`Filtre : ${STATUTS.find(s => s.value === actif)?.label ?? actif}`)
    .addOptions(STATUTS.map(s => ({ label: s.label, description: s.desc, value: s.value })));
  return new ActionRowBuilder().addComponents(menu);
}

// ── Commande slash ────────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('commandes')
  .setDescription('Gérer les commandes clients')

  .addSubcommand(sub =>
    sub.setName('passer')
      .setDescription('Enregistrer une nouvelle commande client (crée un ticket)')
      .addStringOption(o => o.setName('client').setDescription('Pseudo RP du client').setRequired(true))
      .addStringOption(o => o.setName('ressource').setDescription('Ressource commandée').setRequired(true).setAutocomplete(true))
      .addNumberOption(o => o.setName('quantite').setDescription('Quantité').setRequired(true).setMinValue(0.1))
      .addStringOption(o => o.setName('unite').setDescription('Unité').addChoices(
        { name: 'Unité', value: 'Unité' }, { name: 'Tonne', value: 'Tonne' }
      ))
      .addIntegerOption(o => o.setName('prix_total').setDescription('Prix total en bronze').setMinValue(1))
      .addStringOption(o => o.setName('client_discord').setDescription('Mention du compte Discord du client (optionnel)'))
      .addStringOption(o => o.setName('note').setDescription('Note / instructions spéciales'))
  )
  .addSubcommand(sub =>
    sub.setName('liste').setDescription('Voir et filtrer les commandes')
  )
  .addSubcommand(sub =>
    sub.setName('detail')
      .setDescription('Voir le détail d\'une commande')
      .addIntegerOption(o => o.setName('id').setDescription('Numéro').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('statut')
      .setDescription('Changer le statut d\'une commande')
      .addIntegerOption(o => o.setName('id').setDescription('Numéro').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('statut').setDescription('Nouveau statut').setRequired(true).addChoices(
        { name: '⏳ En attente',         value: 'en_attente' },
        { name: '⚒️ En cours',            value: 'en_cours' },
        { name: '📦 Prête (à récupérer)', value: 'prete' },
        { name: '✅ Livrée',             value: 'livree' },
        { name: '❌ Annulée',            value: 'annulee' },
      ))
  );

export async function autocomplete(interaction) {
  const saisie = interaction.options.getFocused().toLowerCase();
  const rows = db.prepare('SELECT ressource, prix_bronze, unite FROM stock WHERE LOWER(ressource) LIKE ? AND en_vente=1 LIMIT 25').all(`%${saisie}%`);
  await interaction.respond(rows.map(r => ({ name: `${r.ressource} (${r.prix_bronze}🟤/${r.unite})`, value: r.ressource })));
}

export async function execute(interaction) {
  if (!isMarchand(interaction)) return refus(interaction);
  const sub = interaction.options.getSubcommand();

  // ── Passer une commande ──────────────────────────────────────────────────
  if (sub === 'passer') {
    const clientPseudo = interaction.options.getString('client');
    const ressource    = interaction.options.getString('ressource');
    const quantite     = interaction.options.getNumber('quantite');
    const unite        = interaction.options.getString('unite') ?? 'Unité';
    const note         = interaction.options.getString('note') ?? '';
    const clientMention = interaction.options.getString('client_discord') ?? null;
    const clientId     = clientMention?.match(/\d{17,19}/)?.[0] ?? '0';

    // Prix auto depuis stock ou option manuelle
    const article  = db.prepare('SELECT * FROM stock WHERE LOWER(ressource)=?').get(ressource.toLowerCase());
    let prixTotal  = interaction.options.getInteger('prix_total');
    if (!prixTotal && article) prixTotal = Math.round(article.prix_bronze * quantite);
    if (!prixTotal) prixTotal = 0;

    const result = db.prepare(
      'INSERT INTO commandes (client_id,client_pseudo,ressource,quantite,unite,prix_total,note,vendeur_pseudo,vendeur_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(clientId, clientPseudo, ressource, quantite, unite, prixTotal, note, interaction.user.username, interaction.user.id);

    const commande = db.prepare('SELECT * FROM commandes WHERE id=?').get(result.lastInsertRowid);
    const num      = String(commande.id).padStart(4, '0');

    // Déduction stock si applicable
    if (article && article.quantite > 0) {
      db.prepare('UPDATE stock SET quantite=MAX(0,quantite-?) WHERE ressource=?').run(quantite, ressource);
    }

    // Créer ticket Discord + refresh stock
    await interaction.deferReply({ flags: 64 });
    const threadId = await createTicket(interaction.client, commande);
    await refreshStockEmbed(interaction.client);

    const embed = embedBase(
      `✅ Commande #${num} enregistrée`,
      null, COULEURS.or
    ).addFields(
      { name: '👤 Client',    value: clientPseudo, inline: true },
      { name: '📦 Ressource', value: `${ressource} ×${quantite} ${unite}`, inline: true },
      { name: '💰 Total',     value: bronzeVersTexte(prixTotal), inline: true },
    );
    if (threadId) embed.addFields({ name: '🎫 Ticket', value: `<#${threadId}>`, inline: false });
    if (note) embed.addFields({ name: '📝 Note', value: note, inline: false });

    return interaction.editReply({ embeds: [embed] });
  }

  // ── Liste ────────────────────────────────────────────────────────────────
  if (sub === 'liste') {
    const { embed, components } = buildListeEmbed('actives', 0);
    return interaction.reply({ embeds: [embed], components, flags: 64 });
  }

  // ── Détail ───────────────────────────────────────────────────────────────
  if (sub === 'detail') {
    const id  = interaction.options.getInteger('id');
    const row = db.prepare('SELECT * FROM commandes WHERE id=?').get(id);
    if (!row) return interaction.reply({ embeds: [embedErreur(`Commande #${id} introuvable.`)], flags: 64 });

    const embed = embedBase(
      `📋 Commande #${String(row.id).padStart(4,'0')}`,
      `${statutEmoji(row.statut)} **${row.statut.replace('_',' ')}**`,
      COULEURS.bleu
    ).addFields(
      { name: '👤 Client',      value: `${row.client_pseudo}${row.client_id !== '0' ? ` (<@${row.client_id}>)` : ''}`, inline: true },
      { name: '📦 Ressource',   value: row.ressource,                  inline: true },
      { name: '🔢 Quantité',    value: `${row.quantite} ${row.unite}`, inline: true },
      { name: '💰 Total',       value: bronzeVersTexte(row.prix_total), inline: true },
      { name: '📅 Créée le',    value: (row.creee_le||'').slice(0,16), inline: true },
      ...(row.vendeur_pseudo ? [{ name: '⚓ Marchand', value: row.vendeur_pseudo, inline: true }] : []),
      ...(row.ticket_id ? [{ name: '🎫 Ticket', value: `<#${row.ticket_id}>`, inline: true }] : []),
      ...(row.note ? [{ name: '📝 Note', value: row.note, inline: false }] : [])
    );

    const actions = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cmd_statut:${id}:en_cours`).setLabel('⚒️ En cours').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`cmd_statut:${id}:prete`).setLabel('📦 Prête').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cmd_statut:${id}:livree`).setLabel('✅ Livrée').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cmd_statut:${id}:annulee`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
    );
    return interaction.reply({ embeds: [embed], components: [actions], flags: 64 });
  }

  // ── Statut ───────────────────────────────────────────────────────────────
  if (sub === 'statut') {
    await changerStatut(interaction, interaction.options.getInteger('id'), interaction.options.getString('statut'));
  }
}

async function changerStatut(interaction, id, statut) {
  const row = db.prepare('SELECT * FROM commandes WHERE id=?').get(id);
  if (!row) {
    const msg = { embeds: [embedErreur(`Commande #${id} introuvable.`)], flags: 64 };
    return interaction.replied || interaction.deferred ? interaction.followUp(msg) : interaction.reply(msg);
  }

  const traitee = ['livree','annulee'].includes(statut) ? new Date().toISOString() : null;
  const vendeur = interaction.user.username;
  db.prepare('UPDATE commandes SET statut=?, traitee_le=?, vendeur_pseudo=?, vendeur_id=? WHERE id=?')
    .run(statut, traitee, vendeur, interaction.user.id, id);

  // Restaurer le stock si la commande est annulée
  if (statut === 'annulee') {
    try {
      db.prepare('UPDATE stock SET quantite=quantite+? WHERE LOWER(ressource)=?')
        .run(row.quantite, row.ressource.toLowerCase());
    } catch {}
  }

  const updated = db.prepare('SELECT * FROM commandes WHERE id=?').get(id);
  await updateTicket(interaction.client, updated);
  await refreshStockEmbed(interaction.client);

  const DM_MSG = {
    en_cours: `⚒️ Votre commande **#${String(id).padStart(4,'0')}** (${row.ressource} ×${row.quantite}) est **en préparation** à la Compagnie du Fjord.`,
    prete:    `📦 Votre commande **#${String(id).padStart(4,'0')}** est **prête** ! Venez la récupérer à Fjordheim.`,
    livree:   `✅ Commande **#${String(id).padStart(4,'0')}** marquée **livrée**. Merci et bon vent sur les 3 Routes !`,
    annulee:  `❌ Commande **#${String(id).padStart(4,'0')}** **annulée**. Contactez nos marchands pour plus d'infos.`,
  };
  if (row.client_id && row.client_id !== '0') {
    try {
      const membre = await interaction.guild.members.fetch(row.client_id);
      if (DM_MSG[statut]) await membre.send(DM_MSG[statut]);
    } catch {}
  }

  const embed = embedSucces(`Commande **#${String(id).padStart(4,'0')}** → **${statut.replace('_',' ')}**.`);
  const res   = { embeds: [embed], components: [], flags: 64 };
  return interaction.replied || interaction.deferred ? interaction.editReply(res) : interaction.reply(res);
}

// ── Gestionnaires ─────────────────────────────────────────────────────────────
export async function handleFiltreSelect(interaction) {
  const { embed, components } = buildListeEmbed(interaction.values[0], 0);
  await interaction.update({ embeds: [embed], components });
}

export async function handlePage(interaction, filtre, page) {
  const { embed, components } = buildListeEmbed(filtre, page);
  await interaction.update({ embeds: [embed], components });
}

export async function handleStatutBtn(interaction, id, statut) {
  // deferReply éphémère : la confirmation reste séparée du message de commande
  await interaction.deferReply({ flags: 64 });
  await changerStatut(interaction, id, statut);
}
