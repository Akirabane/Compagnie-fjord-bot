import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import db from '../db/database.js';
import { isMarchand, refus } from '../utils/auth.js';
import { embedBase, embedErreur, embedSucces, COULEURS } from '../utils/embeds.js';
import { paginationButtons, paginate, PAGE_SIZE } from '../utils/pagination.js';

// ── Constantes ────────────────────────────────────────────────────────────────
const PROFESSIONS = [
  '⚒️ Forge', '🔨 Artisan', '🪵 Charpentier', '🪡 Tannerie',
  '⚔️ Forge de Guerre', '⚗️ Apothicaire', '🍺 Brasserie', '🎉 Festin',
  '🔧 Outils Spéciaux', '🪡 Tannerie Large', '🍳 Cuisine',
  '🪡 Tannerie Excellence', '🏰 Architecture de Guerre',
  '⚓ Construction Navale', '🔐 Serrurerie',
];

// Professions de la Compagnie du Fjord en priorité
const PROFESSIONS_COMPAGNIE = [
  '🪡 Tannerie', '🪡 Tannerie Excellence', '🪡 Tannerie Large',
  '🪵 Charpentier', '🍳 Cuisine', '🎉 Festin', '🍺 Brasserie',
  '⚗️ Apothicaire',
];

// Traduction des matériaux Minecraft → noms RP
const MAT_FR = {
  'string':              'Ficelle',
  'leather':             'Cuir',
  'canvas':              'Toile',
  'spruce_planks':       'Planches épicéa',
  'spruce_log':          'Bûche épicéa',
  'stick':               'Bâton',
  'iron_ingot':          'Lingot de fer',
  'gold_ingot':          'Lingot d\'or',
  'iron_nugget':         'Pépite de fer',
  'gold_nugget':         'Pépite d\'or',
  'white_wool':          'Laine blanche',
  'red_wool':            'Laine rouge',
  'stone':               'Pierre',
  'stone_bricks':        'Briques de pierre',
  'smooth_stone':        'Pierre lisse',
  'cobblestone':         'Cobblestone',
  'oak_planks':          'Planches de chêne',
  'oak_log':             'Bûche de chêne',
  'glass':               'Verre',
  'paper':               'Papier',
  'sugar_cane':          'Canne à sucre',
  'sugar':               'Sucre',
  'wheat':               'Blé',
  'coal':                'Charbon',
  'flint':               'Silex',
  'clay_ball':           'Boule d\'argile',
  'slime_ball':          'Boue de slime',
  'blaze_powder':        'Poudre de blaze',
  'bamboo':              'Bambou',
  'feather':             'Plume',
  'ink_sac':             'Poche d\'encre',
  'bucket':              'Seau',
  'compass':             'Boussole',
  'honey_bottle':        'Flacon de miel',
  'glass_bottle':        'Flacon en verre',
  'kelp':                'Algue',
  'lily_pad':            'Nénuphar',
  'dirt':                'Terre',
  'white_dye':           'Teinture blanche',
  'red_dye':             'Teinture rouge',
  'blue_dye':            'Teinture bleue',
  'green_dye':           'Teinture verte',
  'black_dye':           'Teinture noire',
  'yellow_dye':          'Teinture jaune',
  'terracotta':          'Terracotta',
  'book':                'Livre',
  'dandelion':           'Pissenlit',
  'chamomile_flowers':   'Fleurs de camomille',
  'plantago_leaves':     'Feuilles de plantain',
  'belladonna_berry':    'Baie de belladone',
  'poison':              'Poison',
  'powder_belladonna':   'Poudre de belladone',
  'empty_bottle_clean':  'Flacon propre vide',
};

function tradMat(mat) {
  return MAT_FR[mat] ?? mat.replace(/_/g, ' ');
}

function matIcon(mat) {
  const icons = {
    'iron_ingot': '🔩', 'gold_ingot': '🌕', 'string': '🧵', 'leather': '🟫',
    'canvas': '🪢', 'coal': '🪨', 'glass': '🔷', 'wheat': '🌾',
    'sugar': '🍬', 'wool': '🐑', 'paper': '📄', 'wood': '🪵',
  };
  for (const [k, v] of Object.entries(icons)) {
    if (mat.includes(k)) return v;
  }
  return '▪️';
}

// ── Helpers embed ─────────────────────────────────────────────────────────────
function buildListeEmbed(profession, page, filtreNiv) {
  let query = 'SELECT * FROM recettes WHERE profession=?';
  const params = [profession];
  if (filtreNiv) { query += ' AND niveau=?'; params.push(filtreNiv); }
  query += ' ORDER BY niveau, objet';

  const all   = db.prepare(query).all(...params);
  const items = paginate(all, page);
  const maxPage = Math.ceil(all.length / PAGE_SIZE);
  const niveaux = [...new Set(db.prepare('SELECT DISTINCT niveau FROM recettes WHERE profession=? ORDER BY niveau').all(profession).map(r => r.niveau))];

  const embed = embedBase(
    `${profession} — Recettes`,
    `*${all.length} recette${all.length > 1 ? 's' : ''} · Page ${page + 1}/${maxPage || 1}${filtreNiv ? ` · Niveau ${filtreNiv}` : ''}*`,
    COULEURS.bleu
  );

  for (const r of items) {
    const mats = [];
    for (let i = 1; i <= 5; i++) {
      if (r[`mat${i}`]) mats.push(`${r[`qte${i}`]}× ${tradMat(r[`mat${i}`])}`);
    }
    embed.addFields({
      name: `Niv.${r.niveau} — ${r.objet}${r.qte_produit > 1 ? ` (×${r.qte_produit})` : ''}`,
      value: mats.length ? mats.join(' · ') : '*Aucun ingrédient*',
      inline: false,
    });
  }

  // Row 1 : select profession
  const menuProf = new StringSelectMenuBuilder()
    .setCustomId('rec_prof')
    .setPlaceholder(`📋 ${profession}`)
    .addOptions(PROFESSIONS.map(p => ({ label: p, value: p })));

  // Row 2 : filtre niveau (max 25 options)
  const optsNiv = [{ label: '📊 Tous les niveaux', value: 'all' }];
  for (const n of niveaux.slice(0, 24)) optsNiv.push({ label: `Niveau ${n}`, value: String(n) });
  const menuNiv = new StringSelectMenuBuilder()
    .setCustomId(`rec_niv:${profession}:${page}`)
    .setPlaceholder(filtreNiv ? `Niveau ${filtreNiv}` : '🔢 Filtrer par niveau')
    .addOptions(optsNiv);

  // Row 3 : pagination + bouton détail
  const baseId   = `rec:${profession}:${filtreNiv ?? 'all'}`;
  const pageRows = paginationButtons(baseId, page, all.length);

  return {
    embed,
    components: [
      new ActionRowBuilder().addComponents(menuProf),
      new ActionRowBuilder().addComponents(menuNiv),
      ...pageRows,
    ],
  };
}

function buildDetailEmbed(recetteId) {
  const r = db.prepare('SELECT * FROM recettes WHERE id=?').get(recetteId);
  if (!r) return null;

  const mats = [];
  for (let i = 1; i <= 5; i++) {
    if (r[`mat${i}`]) {
      const matBrut = r[`mat${i}`];
      const icon = matIcon(matBrut);
      mats.push({ name: `${icon} ${tradMat(matBrut)}`, value: `Quantité : **${r[`qte${i}`]}**`, inline: true });
    }
  }

  // Rembourrage grille 3×N
  const rem = mats.length % 3;
  if (rem === 1) mats.push({ name: '​', value: '​', inline: true }, { name: '​', value: '​', inline: true });
  if (rem === 2) mats.push({ name: '​', value: '​', inline: true });

  const embed = embedBase(
    `📖 ${r.objet}${r.qte_produit > 1 ? ` (×${r.qte_produit})` : ''}`,
    `**Profession :** ${r.profession}\n**Table :** \`${r.table_craft}\`\n**Niveau requis :** ${r.niveau}`,
    COULEURS.bleu
  );

  if (mats.length) embed.addFields(...mats);
  else embed.addFields({ name: 'Ingrédients', value: '*Aucun ingrédient listé*', inline: false });

  // Lien vers les prix si des matériaux correspondent
  const matConnus = [];
  for (let i = 1; i <= 5; i++) {
    if (!r[`mat${i}`]) continue;
    const nom = tradMat(r[`mat${i}`]);
    const prix = db.prepare('SELECT prix_skanor FROM prix_regions WHERE LOWER(produit) LIKE ?').get(`%${nom.toLowerCase()}%`);
    if (prix?.prix_skanor) matConnus.push(`${nom} → ${prix.prix_skanor}🟤/unité (Skanor)`);
  }
  if (matConnus.length) {
    embed.addFields({ name: '💰 Prix Skanor des ingrédients', value: matConnus.join('\n'), inline: false });
  }

  return embed;
}

// ── Commande slash ────────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('recette')
  .setDescription('Consulter les recettes de craft du serveur')
  .addSubcommand(sub =>
    sub.setName('voir')
      .setDescription('Parcourir les recettes par profession')
      .addStringOption(o =>
        o.setName('profession').setDescription('Profession').addChoices(...PROFESSIONS.slice(0,25).map(p => ({ name: p, value: p })))
      )
  )
  .addSubcommand(sub =>
    sub.setName('chercher')
      .setDescription('Rechercher une recette par nom d\'objet')
      .addStringOption(o => o.setName('nom').setDescription('Nom de l\'objet').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('compagnie')
      .setDescription('Voir les recettes des métiers de la Compagnie du Fjord')
  )
  .addSubcommand(sub =>
    sub.setName('ajouter')
      .setDescription('Ajouter une recette [Marchands uniquement]')
      .addStringOption(o => o.setName('profession').setDescription('Profession').setRequired(true).addChoices(...PROFESSIONS.slice(0,25).map(p => ({ name: p, value: p }))))
      .addIntegerOption(o => o.setName('niveau').setDescription('Niveau requis').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('objet').setDescription('Nom de l\'objet produit').setRequired(true))
      .addIntegerOption(o => o.setName('qte_produit').setDescription('Quantité produite').setMinValue(1))
      .addStringOption(o => o.setName('mat1').setDescription('Matériau 1 (ID Minecraft)'))
      .addIntegerOption(o => o.setName('qte1').setDescription('Quantité mat. 1').setMinValue(1))
      .addStringOption(o => o.setName('mat2').setDescription('Matériau 2'))
      .addIntegerOption(o => o.setName('qte2').setDescription('Quantité mat. 2').setMinValue(1))
      .addStringOption(o => o.setName('mat3').setDescription('Matériau 3'))
      .addIntegerOption(o => o.setName('qte3').setDescription('Quantité mat. 3').setMinValue(1))
      .addStringOption(o => o.setName('mat4').setDescription('Matériau 4'))
      .addIntegerOption(o => o.setName('qte4').setDescription('Quantité mat. 4').setMinValue(1))
      .addStringOption(o => o.setName('mat5').setDescription('Matériau 5'))
      .addIntegerOption(o => o.setName('qte5').setDescription('Quantité mat. 5').setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('modifier')
      .setDescription('Modifier une recette existante [Marchands uniquement]')
      .addStringOption(o => o.setName('id').setDescription('ID de la recette (via /recette chercher)').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('champ').setDescription('Champ à modifier').setRequired(true).addChoices(
        { name: 'Niveau',          value: 'niveau' },
        { name: 'Objet produit',   value: 'objet' },
        { name: 'Qté produite',    value: 'qte_produit' },
        { name: 'Matériau 1',      value: 'mat1' },
        { name: 'Qté mat. 1',      value: 'qte1' },
        { name: 'Matériau 2',      value: 'mat2' },
        { name: 'Qté mat. 2',      value: 'qte2' },
        { name: 'Matériau 3',      value: 'mat3' },
        { name: 'Qté mat. 3',      value: 'qte3' },
      ))
      .addStringOption(o => o.setName('valeur').setDescription('Nouvelle valeur').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('supprimer')
      .setDescription('Supprimer une recette [Marchands uniquement]')
      .addStringOption(o => o.setName('id').setDescription('ID de la recette (via /recette chercher)').setRequired(true).setAutocomplete(true))
  );

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const saisie  = focused.value.toLowerCase();
  if (focused.name === 'id') {
    const rows = db.prepare('SELECT id, objet, profession, niveau FROM recettes WHERE LOWER(objet) LIKE ? LIMIT 25').all(`%${saisie}%`);
    return interaction.respond(rows.map(r => ({ name: `#${r.id} — ${r.objet} (${r.profession}, Niv.${r.niveau})`, value: String(r.id) })));
  }
  // nom (chercher)
  const rows = db.prepare('SELECT id, objet, profession, niveau FROM recettes WHERE LOWER(objet) LIKE ? LIMIT 25').all(`%${saisie}%`);
  await interaction.respond(rows.map(r => ({ name: `${r.objet} (${r.profession}, Niv.${r.niveau})`, value: String(r.id) })));
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'voir') {
    const prof = interaction.options.getString('profession') ?? PROFESSIONS[0];
    const { embed, components } = buildListeEmbed(prof, 0, null);
    return interaction.reply({ embeds: [embed], components });
  }

  if (sub === 'compagnie') {
    // Menu dédié aux métiers de la Compagnie
    const menuRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('rec_prof')
        .setPlaceholder('🏴‍☠️ Métiers de la Compagnie du Fjord…')
        .addOptions(PROFESSIONS_COMPAGNIE.map(p => ({ label: p, value: p })))
    );
    const embed = embedBase(
      '🏴‍☠️ Recettes — La Compagnie du Fjord',
      '*Choisissez un métier pour consulter ses recettes.*\n\n' +
      '**Métiers disponibles :**\n' +
      PROFESSIONS_COMPAGNIE.map(p => `• ${p}`).join('\n'),
      COULEURS.or
    );
    return interaction.reply({ embeds: [embed], components: [menuRow] });
  }

  if (sub === 'ajouter') {
    if (!isMarchand(interaction)) return refus(interaction);
    const profession = interaction.options.getString('profession');
    const niveau     = interaction.options.getInteger('niveau');
    const objet      = interaction.options.getString('objet');
    const qteProd    = interaction.options.getInteger('qte_produit') ?? 1;
    const profMap    = { '⚒️ Forge':'Forge','🔨 Artisan':'Worker','🪵 Charpentier':'Carpenter','🪡 Tannerie':'Tannery','⚔️ Forge de Guerre':'WarForge','⚗️ Apothicaire':'Apothecary','🍺 Brasserie':'Drinking','🎉 Festin':'Feast','🔧 Outils Spéciaux':'ExceptionTools','🪡 Tannerie Large':'TanneryLarge','🍳 Cuisine':'Cooking','🪡 Tannerie Excellence':'TanneryExcellence','🏰 Architecture de Guerre':'WarArchitect','⚓ Construction Navale':'Shipbuilder','🔐 Serrurerie':'Locksmith' };
    const tableCraft = profMap[profession] ?? profession;
    db.prepare(`INSERT INTO recettes (table_craft, profession, niveau, objet, qte_produit, mat1, qte1, mat2, qte2, mat3, qte3, mat4, qte4, mat5, qte5) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(tableCraft, profession, niveau, objet, qteProd,
        interaction.options.getString('mat1') ?? null, interaction.options.getInteger('qte1') ?? null,
        interaction.options.getString('mat2') ?? null, interaction.options.getInteger('qte2') ?? null,
        interaction.options.getString('mat3') ?? null, interaction.options.getInteger('qte3') ?? null,
        interaction.options.getString('mat4') ?? null, interaction.options.getInteger('qte4') ?? null,
        interaction.options.getString('mat5') ?? null, interaction.options.getInteger('qte5') ?? null,
      );
    return interaction.reply({ embeds: [embedSucces(`Recette **${objet}** (${profession}, Niv.${niveau}) ajoutée.`)], flags: 64 });
  }

  if (sub === 'modifier') {
    if (!isMarchand(interaction)) return refus(interaction);
    const recId  = interaction.options.getString('id');
    const champ  = interaction.options.getString('champ');
    const valeur = interaction.options.getString('valeur');
    const CHAMPS_ENTIER = ['niveau', 'qte_produit', 'qte1', 'qte2', 'qte3', 'qte4', 'qte5'];
    const val = CHAMPS_ENTIER.includes(champ) ? parseInt(valeur, 10) : valeur;
    if (CHAMPS_ENTIER.includes(champ) && isNaN(val))
      return interaction.reply({ embeds: [embedErreur('La valeur doit être un entier pour ce champ.')], flags: 64 });
    const res = db.prepare(`UPDATE recettes SET ${champ}=? WHERE id=?`).run(val, parseInt(recId, 10));
    if (res.changes === 0) return interaction.reply({ embeds: [embedErreur(`Recette #${recId} introuvable.`)], flags: 64 });
    return interaction.reply({ embeds: [embedSucces(`Recette #${recId} — **${champ}** → \`${valeur}\` mis à jour.`)], flags: 64 });
  }

  if (sub === 'supprimer') {
    if (!isMarchand(interaction)) return refus(interaction);
    const recId = interaction.options.getString('id');
    const rec   = db.prepare('SELECT objet, profession FROM recettes WHERE id=?').get(parseInt(recId, 10));
    if (!rec) return interaction.reply({ embeds: [embedErreur(`Recette #${recId} introuvable.`)], flags: 64 });
    db.prepare('DELETE FROM recettes WHERE id=?').run(parseInt(recId, 10));
    return interaction.reply({ embeds: [embedSucces(`Recette **${rec.objet}** (${rec.profession}) supprimée.`)], flags: 64 });
  }

  if (sub === 'chercher') {
    const nom   = interaction.options.getString('nom');
    const rows  = db.prepare("SELECT * FROM recettes WHERE LOWER(objet) LIKE ? ORDER BY niveau LIMIT 20").all(`%${nom.toLowerCase()}%`);

    if (rows.length === 0) {
      return interaction.reply({ embeds: [embedErreur(`Aucune recette trouvée pour **"${nom}"**.`)], flags: 64 });
    }

    if (rows.length === 1) {
      // Afficher directement le détail
      const embed = buildDetailEmbed(rows[0].id);
      return interaction.reply({ embeds: [embed] });
    }

    // Plusieurs résultats → liste avec boutons de sélection
    const embed = embedBase(
      `🔍 Résultats pour "${nom}"`,
      `*${rows.length} recette${rows.length > 1 ? 's' : ''} trouvée${rows.length > 1 ? 's' : ''}*`,
      COULEURS.bleu
    );

    for (const r of rows.slice(0, 6)) {
      const mats = [];
      for (let i = 1; i <= 5; i++) { if (r[`mat${i}`]) mats.push(`${r[`qte${i}`]}× ${tradMat(r[`mat${i}`])}`); }
      embed.addFields({
        name: `Niv.${r.niveau} — ${r.objet} (${r.profession})`,
        value: mats.join(' · ') || '*Aucun ingrédient*',
        inline: false,
      });
    }

    // Boutons pour voir le détail
    const btns = rows.slice(0, 5).map(r =>
      new ButtonBuilder()
        .setCustomId(`rec_detail:${r.id}`)
        .setLabel(`📖 ${r.objet.slice(0, 20)}`)
        .setStyle(ButtonStyle.Primary)
    );
    const components = btns.length ? [new ActionRowBuilder().addComponents(...btns)] : [];
    return interaction.reply({ embeds: [embed], components });
  }
}

// ── Gestionnaires composants ──────────────────────────────────────────────────
export async function handleProfSelect(interaction) {
  const { embed, components } = buildListeEmbed(interaction.values[0], 0, null);
  await interaction.update({ embeds: [embed], components });
}

export async function handleNivSelect(interaction) {
  const [, prof] = interaction.customId.split(':');
  const val      = interaction.values[0];
  const filtreNiv = val === 'all' ? null : parseInt(val, 10);
  const { embed, components } = buildListeEmbed(prof, 0, filtreNiv);
  await interaction.update({ embeds: [embed], components });
}

export async function handlePage(interaction, profession, filtreNivStr, page) {
  const filtreNiv = filtreNivStr === 'all' ? null : parseInt(filtreNivStr, 10);
  const { embed, components } = buildListeEmbed(profession, page, filtreNiv);
  await interaction.update({ embeds: [embed], components });
}

export async function handleDetail(interaction, recetteId) {
  const embed = buildDetailEmbed(parseInt(recetteId, 10));
  if (!embed) return interaction.update({ embeds: [embedErreur('Recette introuvable.')], components: [] });
  await interaction.reply({ embeds: [embed], flags: 64 });
}
