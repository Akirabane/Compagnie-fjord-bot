import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../db/database.js';
import { bronzeVersTexte, prixAvecVariation } from '../utils/monnaie.js';
import { embedBase, embedErreur, COULEURS } from '../utils/embeds.js';
import { paginationButtons, categoryMenu, paginate, PAGE_SIZE } from '../utils/pagination.js';

const CAT_EMOJI = {
  'Agriculture':       '🌾',
  'Élevage & Chasse':  '🐄',
  'Minerais':          '⛏️',
  'Construction':      '🪵',
  'Forge & Armement':  '⚔️',
  'Cuisine & Taverne': '🍖',
  'Artisanat & Cuir':  '🪡',
};

function getCategories() {
  return db.prepare("SELECT DISTINCT categorie FROM stock WHERE en_vente=1 ORDER BY categorie").all().map(r => r.categorie);
}

function buildCatalogueEmbed(categorie, page) {
  const all = db.prepare('SELECT * FROM stock WHERE en_vente=1 AND categorie=? ORDER BY ressource').all(categorie);
  if (all.length === 0) return { embed: null, components: [] };

  const items   = paginate(all, page);
  const maxPage = Math.ceil(all.length / PAGE_SIZE);
  const emoji   = CAT_EMOJI[categorie] ?? '📦';

  const embed = embedBase(
    `${emoji} Catalogue — ${categorie}`,
    `*Page ${page + 1}/${maxPage} · ${all.length} article${all.length > 1 ? 's' : ''}*`,
    COULEURS.or
  );

  for (const row of items) {
    const variation = db.prepare('SELECT variation FROM marche WHERE ressource=?').get(row.ressource);
    const vari      = variation?.variation ?? 0;
    const prix      = prixAvecVariation(row.prix_bronze, vari);
    const variTag   = vari > 0 ? ` 📈 +${vari}%` : vari < 0 ? ` 📉 ${vari}%` : '';
    const stock     = row.quantite > 0 ? `📦 ${row.quantite} ${row.unite}` : '📦 *Sur commande*';
    embed.addFields({
      name: row.ressource,
      value: `💰 **${bronzeVersTexte(prix)}** / ${row.unite}${variTag}\n${stock}`,
      inline: true,
    });
  }

  // Rembourrage pour aligner la grille 3×N
  const rem = items.length % 3;
  if (rem === 1) embed.addFields({ name: '​', value: '​', inline: true }, { name: '​', value: '​', inline: true });
  if (rem === 2) embed.addFields({ name: '​', value: '​', inline: true });

  const baseId   = `cat:${categorie}`;
  const cats     = getCategories();
  const menuRow  = categoryMenu('cat_select', cats, `Catégorie : ${categorie}`);
  const pageRows = paginationButtons(baseId, page, all.length);

  return { embed, components: [menuRow, ...pageRows] };
}

// ── Commande slash ──────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('catalogue')
  .setDescription('Parcourir le catalogue de la Compagnie du Fjord');

export async function execute(interaction) {
  const cats = getCategories();
  if (cats.length === 0) {
    return interaction.reply({ embeds: [embedErreur('Aucun article disponible. Utilisez `/stock init` d\'abord.')], flags: 64 });
  }

  const menuRow = categoryMenu('cat_select', cats);
  const embed   = embedBase(
    '📜 Catalogue — La Compagnie du Fjord',
    '*Choisissez une catégorie dans le menu ci-dessous pour parcourir nos marchandises.*',
    COULEURS.or
  );
  await interaction.reply({ embeds: [embed], components: [menuRow] });
}

// ── Gestionnaire select menu ─────────────────────────────────────────────────
export async function handleSelect(interaction) {
  const categorie = interaction.values[0];
  const { embed, components } = buildCatalogueEmbed(categorie, 0);
  if (!embed) return interaction.update({ embeds: [embedErreur('Aucun article dans cette catégorie.')], components: [] });
  await interaction.update({ embeds: [embed], components });
}

// ── Gestionnaire boutons pagination ─────────────────────────────────────────
export async function handlePage(interaction, categorie, page) {
  const { embed, components } = buildCatalogueEmbed(categorie, page);
  if (!embed) return interaction.update({ embeds: [embedErreur('Erreur.')], components: [] });
  await interaction.update({ embeds: [embed], components });
}
