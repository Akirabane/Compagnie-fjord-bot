import { readFileSync } from 'fs';
import { read, utils } from '../../node_modules/xlsx/xlsx.mjs';
import db from './database.js';

const wb = read(readFileSync('/home/ubuntu/temp_files/Skanor_Guide_Commercial.xlsx'));
const ws = wb.Sheets['📊 Prix Comparatifs'];
const rows = utils.sheet_to_json(ws, { header: 1, defval: null });

const EMOJIS_CAT = ['🌾', '🐄', '⛏️', '🪵', '⚔️'];
const CAT_NOMS = {
  '🌾': '🌾 Agriculture',
  '🐄': '🐄 Élevage & Chasse',
  '⛏️': '⛏️ Minerais',
  '🪵': '🪵 Construction',
  '⚔️': '⚔️ Forge & Armement',
};

const toInt = (v) => {
  if (v === null || v === undefined || v === '—' || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : Math.round(n);
};

const HEADER_VALS = new Set(['produit', 'catégorie / produit', 'catégorie']);

// Vider la table avant réimport
db.exec('DELETE FROM prix_regions');

const stmt = db.prepare(`
  INSERT OR REPLACE INTO prix_regions
    (categorie, produit, unite_base, prix_min, prix_pdm, prix_rheme, prix_skanor, prix_byb, prix_yuhang)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let currentCat = null;
let count = 0;

for (const row of rows) {
  if (!row || row.every(v => v === null)) continue;

  const cell0 = String(row[0] ?? '').trim();

  // Détecter une ligne de catégorie
  const emoji = EMOJIS_CAT.find(e => cell0.includes(e));
  if (emoji) {
    currentCat = CAT_NOMS[emoji] ?? cell0;
    continue;
  }

  // Ignorer les lignes d'en-tête et de légende
  if (!currentCat) continue;
  if (HEADER_VALS.has(cell0.toLowerCase())) continue;
  if (cell0.startsWith('🟦') || cell0.startsWith('🟧') || cell0.startsWith('🟩')) continue;
  if (cell0.length === 0) continue;

  // Ligne de données valide
  const produit = cell0;
  const unite   = String(row[1] ?? '1 Unité').trim();

  stmt.run(
    currentCat, produit, unite,
    toInt(row[2]),  // prix_min
    toInt(row[3]),  // pdm
    toInt(row[4]),  // rheme
    toInt(row[5]),  // skanor
    toInt(row[6]),  // byb
    toInt(row[7])   // yuhang
  );
  count++;
}

console.log(`✅ ${count} produits importés dans prix_regions`);
const cats = db.prepare('SELECT categorie, COUNT(*) as n FROM prix_regions GROUP BY categorie ORDER BY id').all();
for (const c of cats) console.log(`   ${c.categorie}: ${c.n} produits`);
console.log('\nAperçu Agriculture:');
db.prepare("SELECT produit, unite_base, prix_skanor, prix_pdm, prix_rheme FROM prix_regions WHERE categorie LIKE '%griculture'").all()
  .forEach(r => console.log(`  ${r.produit} | ${r.unite_base} | Skanor:${r.prix_skanor} PdM:${r.prix_pdm} Rhême:${r.prix_rheme}`));
