import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../db/database.js';
import { isMarchand, refus } from '../utils/auth.js';
import { embedBase, embedErreur, embedSucces, COULEURS } from '../utils/embeds.js';
import { paginationButtons, categoryMenu, paginate, PAGE_SIZE } from '../utils/pagination.js';

const REGIONS = [
  { col: 'prix_pdm',    label: '⚓ PdM'   },
  { col: 'prix_rheme',  label: '🛡️ Rhême' },
  { col: 'prix_skanor', label: '⚔️ Skanor' },
  { col: 'prix_byb',    label: '🏜️ Byb'   },
  { col: 'prix_yuhang', label: '🌾 Yuhang' },
];

const CATS = ['🌾 Agriculture', '🐄 Élevage & Chasse', '⛏️ Minerais', '🪵 Construction', '⚔️ Forge & Armement'];

function getPrixData(categorie) {
  return db.prepare('SELECT * FROM prix_regions WHERE categorie=? ORDER BY produit').all(categorie);
}

function calcPrix(val, unite_base, estTonne) {
  if (val === null || val === undefined) return null;
  if (estTonne && unite_base !== '1 Tonne') return val * 64;
  if (!estTonne && unite_base === '1 Tonne') return Math.ceil(val / 64);
  return val;
}

function buildPrixEmbed(categorie, page, estTonne) {
  const all   = getPrixData(categorie);
  if (all.length === 0) return { embed: null, components: [] };

  const items   = paginate(all, page);
  const maxPage = Math.ceil(all.length / PAGE_SIZE);
  const unite   = estTonne ? '1 Tonne (×64)' : '1 Unité';

  const embed = embedBase(
    `📊 Prix en temps réel — ${categorie}`,
    `*Page ${page + 1}/${maxPage} · Unité : **${unite}** · 🔵 Achat idéal · 🔴 Vente idéale*`,
    COULEURS.or
  );

  for (const row of items) {
    const vals = REGIONS.map(r => calcPrix(row[r.col], row.unite_base, estTonne));
    const known = vals.filter(v => v !== null);
    const min   = known.length ? Math.min(...known) : null;
    const max   = known.length ? Math.max(...known) : null;

    const lines = REGIONS.map((r, i) => {
      const v = vals[i];
      if (v === null) return `${r.label}: *inconnu*`;
      let tag = `**${v}🟤**`;
      if (v === min && min !== max) tag += ' 🔵';
      else if (v === max && min !== max) tag += ' 🔴';
      return `${r.label}: ${tag}`;
    });

    embed.addFields({
      name: `${row.produit} *(${row.unite_base})*`,
      value: lines.join('\n'),
      inline: true,
    });
  }

  const rem = items.length % 3;
  if (rem === 1) embed.addFields({ name: '​', value: '​', inline: true }, { name: '​', value: '​', inline: true });
  if (rem === 2) embed.addFields({ name: '​', value: '​', inline: true });

  const tok    = estTonne ? 'T' : 'U';
  const baseId = `prix:${categorie}:${tok}`;

  const toggleBtn = new ButtonBuilder()
    .setCustomId(`prix_toggle:${categorie}:${page}:${estTonne ? 'U' : 'T'}`)
    .setLabel(estTonne ? '🔄 Afficher par Unité' : '🔄 Afficher par Tonne (×64)')
    .setStyle(ButtonStyle.Secondary);

  const menuRow  = categoryMenu('prix_select', CATS, `Catégorie : ${categorie}`);
  const pageRows = paginationButtons(baseId, page, all.length, [toggleBtn]);

  return { embed, components: [menuRow, ...pageRows] };
}

// ── Commande slash ──────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('prix')
  .setDescription('Tableau de prix en temps réel — toutes régions')
  .addSubcommand(sub =>
    sub.setName('voir')
      .setDescription('Comparer les prix entre régions')
  )
  .addSubcommand(sub =>
    sub.setName('modifier')
      .setDescription('Modifier le prix d\'un produit pour une région')
      .addStringOption(o => o.setName('produit').setDescription('Produit').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('region').setDescription('Région').setRequired(true).addChoices(
        { name: '⚓ Peuple de la Mer', value: 'prix_pdm' },
        { name: '🛡️ Rhême',           value: 'prix_rheme' },
        { name: '⚔️ Skanor',           value: 'prix_skanor' },
        { name: '🏜️ Byb-Razad',        value: 'prix_byb' },
        { name: '🌾 Yuhang',           value: 'prix_yuhang' },
      ))
      .addIntegerOption(o => o.setName('prix').setDescription('Prix en bronze (vide = inconnu)').setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('ajouter')
      .setDescription('Ajouter un nouveau produit au tableau')
      .addStringOption(o => o.setName('categorie').setDescription('Catégorie').setRequired(true)
        .addChoices(...CATS.map(c => ({ name: c, value: c }))))
      .addStringOption(o => o.setName('produit').setDescription('Nom du produit').setRequired(true))
      .addStringOption(o => o.setName('unite').setDescription('Unité de base').setRequired(true)
        .addChoices({ name: '1 Unité', value: '1 Unité' }, { name: '1 Tonne', value: '1 Tonne' }))
  )
  .addSubcommand(sub =>
    sub.setName('inconnu')
      .setDescription('Marquer un prix comme inconnu')
      .addStringOption(o => o.setName('produit').setDescription('Produit').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('region').setDescription('Région (vide = toutes)').addChoices(
        { name: '⚓ Peuple de la Mer', value: 'prix_pdm' },
        { name: '🛡️ Rhême',           value: 'prix_rheme' },
        { name: '⚔️ Skanor',           value: 'prix_skanor' },
        { name: '🏜️ Byb-Razad',        value: 'prix_byb' },
        { name: '🌾 Yuhang',           value: 'prix_yuhang' },
      ))
  )
  .addSubcommand(sub =>
    sub.setName('supprimer')
      .setDescription('Supprimer un produit du tableau des prix')
      .addStringOption(o => o.setName('produit').setDescription('Produit').setRequired(true).setAutocomplete(true))
  );

export async function autocomplete(interaction) {
  const saisie = interaction.options.getFocused().toLowerCase();
  const rows   = db.prepare('SELECT produit, categorie FROM prix_regions WHERE LOWER(produit) LIKE ? LIMIT 25').all(`%${saisie}%`);
  await interaction.respond(rows.map(r => ({ name: `${r.produit} (${r.categorie})`, value: r.produit })));
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'voir') {
    const menuRow = categoryMenu('prix_select', CATS);
    const embed   = embedBase(
      '📊 Prix en temps réel',
      '*Sélectionnez une catégorie pour comparer les prix entre toutes les régions de Vyldra.*',
      COULEURS.or
    );
    return interaction.reply({ embeds: [embed], components: [menuRow] });
  }

  if (sub === 'modifier') {
    if (!isMarchand(interaction)) return refus(interaction);

    const produit = interaction.options.getString('produit');
    const region  = interaction.options.getString('region');
    const prix    = interaction.options.getInteger('prix') ?? null;
    const row     = db.prepare('SELECT * FROM prix_regions WHERE produit=?').get(produit);
    if (!row) return interaction.reply({ embeds: [embedErreur(`**${produit}** introuvable.`)], flags: 64 });

    db.prepare(`UPDATE prix_regions SET ${region}=? WHERE produit=?`).run(prix, produit);
    const labels = { prix_pdm:'⚓ PdM', prix_rheme:'🛡️ Rhême', prix_skanor:'⚔️ Skanor', prix_byb:'🏜️ Byb', prix_yuhang:'🌾 Yuhang' };
    const msg = prix !== null
      ? `Prix de **${produit}** → **${labels[region]}** : **${prix} 🟤 bronze**`
      : `Prix de **${produit}** → **${labels[region]}** : *inconnu*`;
    return interaction.reply({ embeds: [embedSucces(msg)], flags: 64 });
  }

  if (sub === 'ajouter') {
    if (!isMarchand(interaction)) return refus(interaction);

    const { categorie, produit, unite } = {
      categorie: interaction.options.getString('categorie'),
      produit:   interaction.options.getString('produit'),
      unite:     interaction.options.getString('unite'),
    };
    if (db.prepare('SELECT id FROM prix_regions WHERE produit=?').get(produit))
      return interaction.reply({ embeds: [embedErreur(`**${produit}** existe déjà.`)], flags: 64 });

    db.prepare('INSERT INTO prix_regions (categorie, produit, unite_base) VALUES (?,?,?)').run(categorie, produit, unite);
    return interaction.reply({
      embeds: [embedSucces(`**${produit}** ajouté dans **${categorie}** (${unite}).\nUtilisez \`/prix modifier\` pour renseigner les prix par région.`)],
      flags: 64,
    });
  }

  if (sub === 'inconnu') {
    if (!isMarchand(interaction)) return refus(interaction);

    const produit = interaction.options.getString('produit');
    const region  = interaction.options.getString('region') ?? null;
    if (!db.prepare('SELECT id FROM prix_regions WHERE produit=?').get(produit))
      return interaction.reply({ embeds: [embedErreur(`**${produit}** introuvable.`)], flags: 64 });

    if (region) {
      db.prepare(`UPDATE prix_regions SET ${region}=NULL WHERE produit=?`).run(produit);
    } else {
      db.prepare('UPDATE prix_regions SET prix_pdm=NULL,prix_rheme=NULL,prix_skanor=NULL,prix_byb=NULL,prix_yuhang=NULL WHERE produit=?').run(produit);
    }
    return interaction.reply({ embeds: [embedSucces(`Prix de **${produit}** marqué *inconnu*.`)], flags: 64 });
  }

  if (sub === 'supprimer') {
    if (!isMarchand(interaction)) return refus(interaction);
    const produit = interaction.options.getString('produit');
    const res = db.prepare('DELETE FROM prix_regions WHERE produit=?').run(produit);
    if (res.changes === 0) return interaction.reply({ embeds: [embedErreur(`**${produit}** introuvable.`)], flags: 64 });
    return interaction.reply({ embeds: [embedSucces(`**${produit}** supprimé du tableau des prix.`)], flags: 64 });
  }
}

// ── Gestionnaires sélect + boutons ──────────────────────────────────────────
export async function handleSelect(interaction) {
  const { embed, components } = buildPrixEmbed(interaction.values[0], 0, false);
  if (!embed) return interaction.update({ embeds: [embedErreur('Aucun produit.')], components: [] });
  await interaction.update({ embeds: [embed], components });
}

export async function handlePage(interaction, categorie, page, tok) {
  const estTonne = tok === 'T';
  const { embed, components } = buildPrixEmbed(categorie, page, estTonne);
  if (!embed) return interaction.update({ embeds: [embedErreur('Erreur.')], components: [] });
  await interaction.update({ embeds: [embed], components });
}

export async function handleToggle(interaction, categorie, page, tok) {
  const estTonne = tok === 'T';
  const { embed, components } = buildPrixEmbed(categorie, page, estTonne);
  if (!embed) return interaction.update({ embeds: [embedErreur('Erreur.')], components: [] });
  await interaction.update({ embeds: [embed], components });
}
