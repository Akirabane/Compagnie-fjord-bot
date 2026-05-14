import { readFileSync } from 'fs';
import { read, utils } from '../../node_modules/xlsx/xlsx.mjs';
import db from './database.js';

const XLSX_PATH = '/home/ubuntu/temp_files/donnes_supp.xlsx';
const wb = read(readFileSync(XLSX_PATH));

// ── Mapping table → profession lisible ───────────────────────────────────────
const PROFESSION_MAP = {
  'Apothecary':        '⚗️ Apothicaire',
  'Carpenter':         '🪵 Charpentier',
  'Cooking':           '🍳 Cuisine',
  'Drinking':          '🍺 Brasserie',
  'ExceptionTools':    '🔧 Outils Spéciaux',
  'Feast':             '🎉 Festin',
  'Forge':             '⚒️ Forge',
  'Locksmith':         '🔐 Serrurerie',
  'Shipbuilder':       '⚓ Construction Navale',
  'Tannery':           '🪡 Tannerie',
  'TanneryExcellence': '🪡 Tannerie Excellence',
  'TanneryLarge':      '🪡 Tannerie Large',
  'WarArchitect':      '🏰 Architecture de Guerre',
  'WarForge':          '⚔️ Forge de Guerre',
  'Worker':            '🔨 Artisan',
};

// ── Import feuille "All" (source principale — 570 recettes) ──────────────────
db.exec('DELETE FROM recettes');

const wsAll  = wb.Sheets['All'];
const rowsAll = utils.sheet_to_json(wsAll, { header: 1, defval: null }).slice(1)
  .filter(r => r[0] && r[2]); // table + objet requis

const stmt = db.prepare(`
  INSERT INTO recettes (table_craft, profession, niveau, objet, qte_produit,
    mat1, qte1, mat2, qte2, mat3, qte3, mat4, qte4, mat5, qte5)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

let countAll = 0;
for (const r of rowsAll) {
  const tableCraft = String(r[0]).trim();
  const profession = PROFESSION_MAP[tableCraft] ?? tableCraft;
  stmt.run(
    tableCraft, profession,
    typeof r[1] === 'number' ? r[1] : 1,
    String(r[2]).trim(),
    typeof r[3] === 'number' ? r[3] : 1,
    r[4]  ?? null, typeof r[5]  === 'number' ? r[5]  : null,
    r[6]  ?? null, typeof r[7]  === 'number' ? r[7]  : null,
    r[8]  ?? null, typeof r[9]  === 'number' ? r[9]  : null,
    r[10] ?? null, typeof r[11] === 'number' ? r[11] : null,
    r[12] ?? null, typeof r[13] === 'number' ? r[13] : null,
  );
  countAll++;
}

// ── Import feuilles spécialisées (Couturiertanneur, Charpentier, Apothicaire) ─
// Format : marqueurs "Lvl.X" ou "Large.X" puis lignes [Objet, Qte, Mat, Qte...]
// Ces feuilles ont des items SUPPLÉMENTAIRES non présents dans All

const SHEETS_SUPP = {
  'Couturiertanneur': { default: '🪡 Tannerie', tableCraft: 'Tannery' },
  'Charpentier':      { default: '🪵 Charpentier', tableCraft: 'Carpenter' },
  'Apothicaire':      { default: '⚗️ Apothicaire', tableCraft: 'Apothecary' },
};

// Items déjà présents dans All (éviter doublons)
const existants = new Set(
  db.prepare('SELECT objet FROM recettes').all().map(r => r.objet.toLowerCase())
);

const stmtSupp = db.prepare(`
  INSERT OR IGNORE INTO recettes (table_craft, profession, niveau, objet, qte_produit,
    mat1, qte1, mat2, qte2, mat3, qte3, mat4, qte4, mat5, qte5)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

// Regex pour détecter les marqueurs de niveau
const LVL_RE   = /^Lvl\.(\d+)$/i;
const LARGE_RE = /^Large\.(\d+)$/i;
const EXC_RE   = /^Exc\.(\d+)$/i;

let countSupp = 0;
for (const [sheetName, cfg] of Object.entries(SHEETS_SUPP)) {
  const ws   = wb.Sheets[sheetName];
  if (!ws) continue;
  const rows = utils.sheet_to_json(ws, { header: 1, defval: null }).slice(1)
    .filter(r => r.some(v => v !== null));

  let currentLevel = 1;
  let currentTable = cfg.tableCraft;
  let currentProf  = cfg.default;

  for (const r of rows) {
    const cell = r[0] ? String(r[0]).trim() : '';
    if (!cell) continue;

    // Marqueurs de niveau
    const mLvl   = cell.match(LVL_RE);
    const mLarge = cell.match(LARGE_RE);
    const mExc   = cell.match(EXC_RE);

    if (mLvl) {
      currentLevel = parseInt(mLvl[1], 10);
      currentTable = cfg.tableCraft;
      currentProf  = cfg.default;
      continue;
    }
    if (mLarge) {
      currentLevel = parseInt(mLarge[1], 10);
      currentTable = 'TanneryLarge';
      currentProf  = '🪡 Tannerie Large';
      continue;
    }
    if (mExc) {
      currentLevel = parseInt(mExc[1], 10);
      currentTable = 'TanneryExcellence';
      currentProf  = '🪡 Tannerie Excellence';
      continue;
    }
    // Marqueurs texte non-niveau (comme "Batelier")
    if (!r[1] && !r[2]) continue;

    // Ligne de recette
    const objet = cell;
    if (existants.has(objet.toLowerCase())) continue; // déjà dans All

    stmtSupp.run(
      currentTable, currentProf, currentLevel,
      objet,
      typeof r[1] === 'number' ? r[1] : 1,
      r[2] ?? null, typeof r[3] === 'number' ? r[3] : null,
      r[4] ?? null, typeof r[5] === 'number' ? r[5] : null,
      r[6] ?? null, typeof r[7] === 'number' ? r[7] : null,
      r[8] ?? null, typeof r[9] === 'number' ? r[9] : null,
      null, null,
    );
    countSupp++;
    existants.add(objet.toLowerCase());
  }
}

// ── Rapport ───────────────────────────────────────────────────────────────────
console.log(`\n✅ Import terminé`);
console.log(`   All sheet   : ${countAll} recettes`);
console.log(`   Feuilles +  : ${countSupp} recettes supplémentaires`);
console.log(`   TOTAL       : ${db.prepare('SELECT COUNT(*) as n FROM recettes').get().n} recettes\n`);

const profs = db.prepare('SELECT profession, COUNT(*) as n FROM recettes GROUP BY profession ORDER BY n DESC').all();
console.log('Répartition par profession :');
for (const p of profs) console.log(`   ${p.profession.padEnd(30)} ${p.n} recettes`);

const niveaux = db.prepare('SELECT MIN(niveau) as min, MAX(niveau) as max FROM recettes').get();
console.log(`\nNiveaux : ${niveaux.min} → ${niveaux.max}`);
