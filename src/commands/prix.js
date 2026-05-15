import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import db from '../db/database.js';
import { isMarchand, refus } from '../utils/auth.js';
import { embedBase, embedErreur, embedSucces, COULEURS } from '../utils/embeds.js';

const REGIONS = [
  { col: 'prix_pdm',    label: '⚓ Peuple de la Mer', couleur: 0x1A3A5C },
  { col: 'prix_rheme',  label: '🛡️ Rhême',            couleur: 0x8B1A1A },
  { col: 'prix_skanor', label: '⚔️ Skanor',            couleur: 0xC9A84C },
  { col: 'prix_byb',    label: '🏜️ Byb-Razad',         couleur: 0xD2691E },
  { col: 'prix_yuhang', label: '🌾 Yuhang',             couleur: 0x2D6A2D },
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

function regionMenu(selected = null) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('prix_region')
      .setPlaceholder(selected ? `Région : ${REGIONS.find(r => r.col === selected)?.label}` : '📍 Choisir une région…')
      .addOptions(REGIONS.map(r => ({ label: r.label, value: r.col, default: r.col === selected })))
  );
}

function catMenu(regionCol, selected = null) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`prix_cat:${regionCol}`)
      .setPlaceholder(selected ? `Catégorie : ${selected}` : '📦 Choisir une catégorie…')
      .addOptions(CATS.map(c => ({ label: c, value: c, default: c === selected })))
  );
}

function buildPrixEmbed(regionCol, categorie, estTonne) {
  const region = REGIONS.find(r => r.col === regionCol);
  if (!region) return null;
  const all = getPrixData(categorie);
  if (!all.length) return null;

  const unite = estTonne ? '1 Tonne (×64)' : '1 Unité';

  // min/max toutes régions pour comparaison
  const stats = {};
  for (const row of all) {
    const vals = REGIONS.map(r => calcPrix(row[r.col], row.unite_base, estTonne)).filter(v => v !== null);
    stats[row.produit] = { min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null };
  }

  const embed = embedBase(
    `${region.label} — ${categorie}`,
    `*Unité : **${unite}** · 🔵 Prix le plus bas toutes régions · 🔴 Prix le plus haut*`,
    region.couleur
  );

  for (const row of all) {
    const v = calcPrix(row[regionCol], row.unite_base, estTonne);
    const { min, max } = stats[row.produit];
    let display = v === null ? '*inconnu*' : `**${v}🟤**`;
    if (v !== null && min !== null && max !== null && min !== max) {
      if (v === min) display += ' 🔵';
      else if (v === max) display += ' 🔴';
    }
    embed.addFields({ name: `${row.produit} *(${row.unite_base})*`, value: display, inline: true });
  }

  const rem = all.length % 3;
  if (rem === 1) embed.addFields({ name: '​', value: '​', inline: true }, { name: '​', value: '​', inline: true });
  if (rem === 2) embed.addFields({ name: '​', value: '​', inline: true });

  return embed;
}

function buildPrixComponents(regionCol, categorie, estTonne) {
  const toggleBtn = new ButtonBuilder()
    .setCustomId(`prix_toggle:${regionCol}:${categorie}:${estTonne ? 'U' : 'T'}`)
    .setLabel(estTonne ? '🔄 Afficher par Unité' : '🔄 Afficher par Tonne (×64)')
    .setStyle(ButtonStyle.Secondary);
  return [
    regionMenu(regionCol),
    catMenu(regionCol, categorie),
    new ActionRowBuilder().addComponents(toggleBtn),
  ];
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
    const embed = embedBase(
      '📊 Prix en temps réel — Par région',
      '*Commencez par choisir une région, puis une catégorie de produits.*\n*🔵 Prix le plus bas · 🔴 Prix le plus haut*',
      COULEURS.or
    );
    return interaction.reply({ embeds: [embed], components: [regionMenu()] });
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

// Sélection région → affiche menu catégorie
export async function handleRegionSelect(interaction) {
  const regionCol = interaction.values[0];
  const embed = embedBase(
    `${REGIONS.find(r => r.col === regionCol)?.label} — Choisissez une catégorie`,
    '*Sélectionnez une catégorie de produits pour afficher les prix.*',
    REGIONS.find(r => r.col === regionCol)?.couleur ?? COULEURS.or
  );
  await interaction.update({ embeds: [embed], components: [regionMenu(regionCol), catMenu(regionCol)] });
}

// Sélection catégorie (customId: prix_cat:<regionCol>)
export async function handleCatSelect(interaction) {
  const regionCol = interaction.customId.split(':')[1];
  const categorie = interaction.values[0];
  const embed = buildPrixEmbed(regionCol, categorie, false);
  if (!embed) return interaction.update({ embeds: [embedErreur('Aucun produit dans cette catégorie.')], components: [] });
  await interaction.update({ embeds: [embed], components: buildPrixComponents(regionCol, categorie, false) });
}

// Toggle unité/tonne (customId: prix_toggle:<regionCol>:<categorie>:<tok>)
export async function handleToggle(interaction, regionCol, categorie, tok) {
  const estTonne = tok === 'T';
  const embed = buildPrixEmbed(regionCol, categorie, estTonne);
  if (!embed) return interaction.update({ embeds: [embedErreur('Erreur.')], components: [] });
  await interaction.update({ embeds: [embed], components: buildPrixComponents(regionCol, categorie, estTonne) });
}

// Conservé pour compatibilité ascendante
export async function handleSelect(interaction) { return handleRegionSelect(interaction); }
export async function handlePage(interaction, cat, page, tok) { return handleToggle(interaction, cat, page, tok); }
