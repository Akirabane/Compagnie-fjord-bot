import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../db/database.js';
import { embedBase, embedErreur, COULEURS } from '../utils/embeds.js';

const METIERS_ORDER = ['Ouvrier', 'Forgeron', 'Agriculteur', 'Constructeur', 'Apothicaire'];

const METIER_META = {
  Ouvrier:      { emoji: '⚒',  couleur: 0x8B7355 },
  Forgeron:     { emoji: '🛠️', couleur: 0xFF6B35 },
  Agriculteur:  { emoji: '🌾', couleur: 0x3FB950 },
  Constructeur: { emoji: '🏗️', couleur: 0x58A6FF },
  Apothicaire:  { emoji: '⚗️', couleur: 0xA371F7 },
};

const TYPE_LABEL = {
  ressource:     '📦 Ressources',
  main_oeuvre:   '🔨 Main-d\'œuvre',
  fabrication:   '⚙️ Fabrication',
  transformation:'🍳 Transformation',
  construction:  '🏗️ Main-d\'œuvre selon projet',
  avertissement: '⚠️ Avertissement officiel',
};

function getMetierIndex(metier) {
  const idx = METIERS_ORDER.indexOf(metier);
  return idx === -1 ? 0 : idx;
}

function buildTarifsEmbed(metier) {
  const meta  = METIER_META[metier] ?? { emoji: '📜', couleur: COULEURS.or };
  const rows  = db.prepare('SELECT * FROM tarifs_officiels WHERE metier=? ORDER BY type, id').all(metier);

  const embed = embedBase(
    `${meta.emoji} Tarifs officiels — ${metier}`,
    '*Sous l\'autorité du Grand Marchand de Skarn, Monseigneur **Rudeus Boreas Torradsson**.*\n*1 écu = 1 🟤 Bronze*',
    meta.couleur
  );

  if (metier === 'Apothicaire') {
    embed.addFields({
      name: '⚠️ Avertissement officiel',
      value:
        'Les apothicaires ne se sont **pas encore présentés** auprès de la Compagnie du Fjord.\n' +
        'Aucune grille tarifaire officielle n\'a été établie.\n\n' +
        '**Il n\'est pas conseillé d\'acheter** potions, remèdes ou produits alchimiques tant que les prix ne sont pas réglementés.\n' +
        '*Des abus de prix pourraient avoir lieu.*',
      inline: false,
    });
  } else {
    const byType = {};
    for (const row of rows) {
      if (!byType[row.type]) byType[row.type] = [];
      byType[row.type].push(row);
    }

    for (const [type, items] of Object.entries(byType)) {
      const lines = items.map(row => {
        const qte  = row.quantite > 1 ? `×${row.quantite} ` : '';
        const prix = row.prix_ecus !== null
          ? `**${row.prix_ecus} 🟤** / ${qte}${row.unite}`
          : `*Prix en attente*`;
        const note = row.note ? ` · *${row.note}*` : '';
        return `• **${row.item}** — ${prix}${note}`;
      }).join('\n');

      embed.addFields({ name: TYPE_LABEL[type] ?? type, value: lines, inline: false });
    }
  }

  embed.setFooter({ text: 'La Compagnie du Fjord — Les 3 Routes · Tarifs validés par le Grand Marchand' });
  return embed;
}

function buildNavButtons(currentMetier) {
  const idx   = getMetierIndex(currentMetier);
  const prev  = METIERS_ORDER[idx - 1];
  const next  = METIERS_ORDER[idx + 1];
  const meta  = METIER_META[currentMetier] ?? {};

  const row = new ActionRowBuilder();
  if (prev) {
    const pm = METIER_META[prev] ?? {};
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`tarifs_nav:${prev}`)
        .setLabel(`← ${pm.emoji ?? ''} ${prev}`)
        .setStyle(ButtonStyle.Secondary)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`tarifs_nav:${currentMetier}`)
      .setLabel(`${meta.emoji ?? ''} ${currentMetier}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true)
  );

  if (next) {
    const nm = METIER_META[next] ?? {};
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`tarifs_nav:${next}`)
        .setLabel(`${nm.emoji ?? ''} ${next} →`)
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return row;
}

// ── Commande slash ──────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('tarifs')
  .setDescription('Consulter les tarifs officiels de la Compagnie du Fjord par métier')
  .addStringOption(o =>
    o.setName('metier')
      .setDescription('Métier à afficher (défaut : Ouvrier)')
      .addChoices(...METIERS_ORDER.map(m => ({ name: `${METIER_META[m]?.emoji ?? ''} ${m}`, value: m })))
  );

export async function execute(interaction) {
  const metier = interaction.options.getString('metier') ?? METIERS_ORDER[0];
  const embed  = buildTarifsEmbed(metier);
  const row    = buildNavButtons(metier);
  await interaction.reply({ embeds: [embed], components: [row] });
}

export async function handleNav(interaction, metier) {
  if (!METIERS_ORDER.includes(metier)) {
    return interaction.update({ embeds: [embedErreur('Métier inconnu.')], components: [] });
  }
  const embed = buildTarifsEmbed(metier);
  const row   = buildNavButtons(metier);
  await interaction.update({ embeds: [embed], components: [row] });
}
