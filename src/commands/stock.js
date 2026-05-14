import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import db from '../db/database.js';
import { isMarchand, refus } from '../utils/auth.js';
import { CATALOGUE_SKANOR } from '../db/seed.js';
import { bronzeVersTexte } from '../utils/monnaie.js';
import { embedBase, embedErreur, embedSucces, COULEURS } from '../utils/embeds.js';
import { paginationButtons, paginate, PAGE_SIZE } from '../utils/pagination.js';
import { cfgGet } from '../utils/setup.js';

export async function checkStockAlerts(client, ressource) {
  try {
    const row = db.prepare('SELECT * FROM stock WHERE ressource=?').get(ressource);
    if (!row || !row.seuil_alerte || row.seuil_alerte <= 0) return;
    if (row.quantite > row.seuil_alerte) return;

    const channelId = cfgGet('ALERT_CHANNEL_ID') ?? cfgGet('LANDING_CHANNEL_ID');
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const dot = row.quantite === 0 ? '⬛ **ÉPUISÉ**' : `🔴 **${row.quantite} ${row.unite}**`;
    await channel.send({
      content: `🔔 **Alerte stock** — **${row.ressource}** est bas !\n${dot} (seuil : ${row.seuil_alerte} ${row.unite})`,
    });
  } catch (e) { console.error('[stock alert]', e); }
}

function getCategories() {
  return db.prepare('SELECT DISTINCT categorie FROM stock ORDER BY categorie').all().map(r => r.categorie);
}

function buildStockEmbed(categorie, page) {
  const all    = db.prepare('SELECT * FROM stock WHERE categorie=? ORDER BY ressource').all(categorie);
  const items  = paginate(all, page);
  const maxPage = Math.ceil(all.length / PAGE_SIZE);

  const embed = embedBase(
    `📦 Inventaire — ${categorie}`,
    `*Page ${page + 1}/${maxPage} · ${all.length} ressource${all.length > 1 ? 's' : ''} · 🟢 En vente · 🔴 Masqué*`,
    COULEURS.gris
  );

  for (const r of items) {
    const dispo = r.en_vente ? '🟢' : '🔴';
    const qte   = r.quantite > 0 ? `${r.quantite} ${r.unite}` : '*Sur commande*';
    embed.addFields({
      name: `${dispo} ${r.ressource}`,
      value: `💰 ${bronzeVersTexte(r.prix_bronze)} / ${r.unite}\n📦 ${qte}`,
      inline: true,
    });
  }

  const rem = items.length % 3;
  if (rem === 1) embed.addFields({ name:'​', value:'​', inline:true }, { name:'​', value:'​', inline:true });
  if (rem === 2) embed.addFields({ name:'​', value:'​', inline:true });

  const cats    = getCategories();
  const menuRow = buildCatMenu(categorie, cats);
  const pageRows = paginationButtons(`stock:${categorie}`, page, all.length);

  return { embed, components: [menuRow, ...pageRows] };
}

function buildCatMenu(actif, cats) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('stock_cat')
    .setPlaceholder(`Catégorie : ${actif}`)
    .addOptions(cats.map(c => ({ label: c, value: c })));
  return new ActionRowBuilder().addComponents(menu);
}

// ── Commande slash ──────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('stock')
  .setDescription('Gérer le stock interne de la Compagnie')
  
  .addSubcommand(sub => sub.setName('voir').setDescription('Parcourir l\'inventaire'))
  .addSubcommand(sub =>
    sub.setName('maj')
      .setDescription('Mettre à jour une quantité')
      .addStringOption(o => o.setName('ressource').setDescription('Ressource').setRequired(true).setAutocomplete(true))
      .addNumberOption(o => o.setName('quantite').setDescription('Nouvelle quantité').setRequired(true).setMinValue(0))
  )
  .addSubcommand(sub =>
    sub.setName('prix')
      .setDescription('Modifier le prix de vente')
      .addStringOption(o => o.setName('ressource').setDescription('Ressource').setRequired(true).setAutocomplete(true))
      .addIntegerOption(o => o.setName('prix_bronze').setDescription('Nouveau prix en bronze').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('toggle')
      .setDescription('Masquer/afficher dans le catalogue public')
      .addStringOption(o => o.setName('ressource').setDescription('Ressource').setRequired(true).setAutocomplete(true))
  )
  .addSubcommand(sub =>
    sub.setName('init')
      .setDescription('Initialiser avec le catalogue Skanor de base')
  )
  .addSubcommand(sub =>
    sub.setName('vendre')
      .setDescription('Enregistrer une vente')
      .addStringOption(o => o.setName('ressource').setDescription('Ressource vendue').setRequired(true).setAutocomplete(true))
      .addNumberOption(o => o.setName('quantite').setDescription('Quantité').setRequired(true).setMinValue(0.1))
      .addStringOption(o => o.setName('client').setDescription('Nom du client (RP)').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('supprimer')
      .setDescription('Supprimer une ressource du stock')
      .addStringOption(o => o.setName('ressource').setDescription('Ressource').setRequired(true).setAutocomplete(true))
  );

export async function autocomplete(interaction) {
  const saisie = interaction.options.getFocused().toLowerCase();
  const rows   = db.prepare('SELECT ressource FROM stock WHERE LOWER(ressource) LIKE ? LIMIT 25').all(`%${saisie}%`);
  await interaction.respond(rows.map(r => ({ name: r.ressource, value: r.ressource })));
}

export async function execute(interaction) {
  if (!isMarchand(interaction)) return refus(interaction);
  const sub = interaction.options.getSubcommand();

  if (sub === 'init') {
    const stmt = db.prepare('INSERT OR IGNORE INTO stock (categorie, ressource, unite, prix_bronze) VALUES (?,?,?,?)');
    db.transaction(() => { for (const i of CATALOGUE_SKANOR) stmt.run(i.categorie, i.ressource, i.unite, i.prix_bronze); })();
    return interaction.reply({ embeds: [embedSucces(`Stock initialisé avec **${CATALOGUE_SKANOR.length}** ressources.`)], flags: 64 });
  }

  if (sub === 'voir') {
    const cats = getCategories();
    if (cats.length === 0)
      return interaction.reply({ embeds: [embedErreur('Stock vide. Utilisez `/stock init`.') ], flags: 64 });

    const { embed, components } = buildStockEmbed(cats[0], 0);
    return interaction.reply({ embeds: [embed], components, flags: 64 });
  }

  if (sub === 'maj') {
    const ressource = interaction.options.getString('ressource');
    const quantite  = interaction.options.getNumber('quantite');
    const res = db.prepare('UPDATE stock SET quantite=? WHERE ressource=?').run(quantite, ressource);
    if (res.changes === 0) return interaction.reply({ embeds: [embedErreur(`**${ressource}** introuvable.`)], flags: 64 });
    checkStockAlerts(interaction.client, ressource);
    return interaction.reply({ embeds: [embedSucces(`Stock de **${ressource}** → **${quantite}** unités.`)], flags: 64 });
  }

  if (sub === 'prix') {
    const ressource  = interaction.options.getString('ressource');
    const prix       = interaction.options.getInteger('prix_bronze');
    const res = db.prepare('UPDATE stock SET prix_bronze=? WHERE ressource=?').run(prix, ressource);
    if (res.changes === 0) return interaction.reply({ embeds: [embedErreur(`**${ressource}** introuvable.`)], flags: 64 });
    return interaction.reply({ embeds: [embedSucces(`Prix de **${ressource}** → ${bronzeVersTexte(prix)}.`)], flags: 64 });
  }

  if (sub === 'toggle') {
    const ressource = interaction.options.getString('ressource');
    const current   = db.prepare('SELECT en_vente FROM stock WHERE ressource=?').get(ressource);
    if (!current) return interaction.reply({ embeds: [embedErreur(`**${ressource}** introuvable.`)], flags: 64 });
    const newVal = current.en_vente ? 0 : 1;
    db.prepare('UPDATE stock SET en_vente=? WHERE ressource=?').run(newVal, ressource);
    return interaction.reply({
      embeds: [embedSucces(newVal ? `**${ressource}** est maintenant visible dans le catalogue.` : `**${ressource}** masqué du catalogue.`)],
      flags: 64,
    });
  }

  if (sub === 'vendre') {
    const ressource = interaction.options.getString('ressource');
    const quantite  = interaction.options.getNumber('quantite');
    const client    = interaction.options.getString('client');
    const article   = db.prepare('SELECT * FROM stock WHERE ressource=?').get(ressource);
    if (!article) return interaction.reply({ embeds: [embedErreur(`**${ressource}** introuvable.`)], flags: 64 });
    if (article.quantite > 0 && article.quantite < quantite)
      return interaction.reply({ embeds: [embedErreur(`Stock insuffisant : **${article.quantite} ${article.unite}** disponibles.`)], flags: 64 });

    const prixTotal = Math.round(article.prix_bronze * quantite);
    if (article.quantite > 0) {
      db.prepare('UPDATE stock SET quantite=quantite-? WHERE ressource=?').run(quantite, ressource);
      checkStockAlerts(interaction.client, ressource);
    }
    db.prepare('INSERT INTO transactions (type, ressource, quantite, prix_bronze, client_pseudo) VALUES (?,?,?,?,?)').run('vente', ressource, quantite, prixTotal, client);

    return interaction.reply({
      embeds: [embedBase('💰 Vente enregistrée', null, COULEURS.vert).addFields(
        { name: '📦 Ressource', value: `${ressource} ×${quantite}`,   inline: true },
        { name: '👤 Client',    value: client,                          inline: true },
        { name: '💰 Encaissé',  value: bronzeVersTexte(prixTotal),     inline: true }
      )],
      flags: 64,
    });
  }

  if (sub === 'supprimer') {
    const ressource = interaction.options.getString('ressource');
    const res = db.prepare('DELETE FROM stock WHERE ressource=?').run(ressource);
    if (res.changes === 0) return interaction.reply({ embeds: [embedErreur(`**${ressource}** introuvable.`)], flags: 64 });
    return interaction.reply({ embeds: [embedSucces(`**${ressource}** supprimé du stock.`)], flags: 64 });
  }
}

// ── Gestionnaires ────────────────────────────────────────────────────────────
export async function handleCatSelect(interaction) {
  const { embed, components } = buildStockEmbed(interaction.values[0], 0);
  await interaction.update({ embeds: [embed], components });
}

export async function handlePage(interaction, categorie, page) {
  const { embed, components } = buildStockEmbed(categorie, page);
  await interaction.update({ embeds: [embed], components });
}
