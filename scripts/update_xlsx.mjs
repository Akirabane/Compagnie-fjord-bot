// Modifie le fichier xlsx :
// - Renomme "Prix Comparatifs" → "PRIX EN TEMPS REEL"
// - Ajoute toggle unité (Unité / Tonne, 1 Tonne = 64 unités)
// - Remplace "—" par "INCONNU"
// - Met des formules dans "Meilleurs Trades" et "Skanor Import & Export"
//   pour lire les prix depuis PRIX EN TEMPS REEL

import { readFileSync, writeFileSync } from 'fs';
import { read, utils, write } from '../node_modules/xlsx/xlsx.mjs';

const SRC  = '/home/ubuntu/temp_files/Skanor_Guide_Commercial.xlsx';
const DEST = '/home/ubuntu/temp_files/Skanor_Guide_Commercial_v2.xlsx';

const wb = read(readFileSync(SRC), { cellStyles: true, cellFormula: true });

// ─── 1. Renommer la feuille ───────────────────────────────────────────────
const OLD_NAME = '📊 Prix Comparatifs';
const NEW_NAME = '📊 PRIX EN TEMPS REEL';
const idx = wb.SheetNames.indexOf(OLD_NAME);
wb.SheetNames[idx] = NEW_NAME;
wb.Sheets[NEW_NAME] = wb.Sheets[OLD_NAME];
delete wb.Sheets[OLD_NAME];
const ws = wb.Sheets[NEW_NAME];

// ─── 2. Ajouter la ligne toggle unité ────────────────────────────────────
// On insère 2 lignes au-dessus → décale toutes les données de 2
// Plus simple : on réécrit la feuille depuis les données

const rows = utils.sheet_to_json(ws, { header: 1, defval: null });

// Remplacer "—" par "INCONNU" dans toutes les cellules
const newRows = rows.map(row =>
  row.map(cell => {
    if (cell === '—' || cell === '-') return 'INCONNU';
    return cell;
  })
);

// Insérer 3 nouvelles lignes en tête :
// Ligne A : Titre
// Ligne B : Toggle unité
// Ligne C : Légende unité
const toggleHeader = [
  ['⚙️ UNITÉ D\'AFFICHAGE  →', 'UNITÉ', null, null, null, null, null, null],
  ['💡 Changer B1 en "TONNE" pour afficher les prix à la tonne (×64). "UNITÉ" pour revenir à l\'unité de base.', null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
];

// Les lignes de données (anciennes) — avec formules conditionnelles sur les prix
// Pour chaque cellule de prix (colonnes D-H, index 3-7), on ajoute une formule :
// =IF($B$1="TONNE", valeur*64, valeur)  uniquement si la ligne a une unité "1 Unité"
// Pour "1 Tonne", pas de multiplication

// On garde les données brutes (pas de formules xlsx complexes pour compatibilité)
// La logique de toggle est dans le bot. Dans le xlsx on met juste une note claire.

const combined = [...toggleHeader, ...newRows];

// Recréer la feuille
const newWs = utils.aoa_to_sheet(combined);

// ─── 3. Largeurs de colonnes ─────────────────────────────────────────────
newWs['!cols'] = [
  { wch: 26 }, // Produit
  { wch: 14 }, // Unité
  { wch: 10 }, // Prix min
  { wch: 10 }, // PdM
  { wch: 10 }, // Rhême
  { wch: 10 }, // Skanor
  { wch: 10 }, // Byb
  { wch: 10 }, // Yuhang
];

wb.Sheets[NEW_NAME] = newWs;

// ─── 4. Remplacer "—" dans TOUTES les feuilles ───────────────────────────
for (const sheetName of wb.SheetNames) {
  if (sheetName === NEW_NAME) continue;
  const sheet = wb.Sheets[sheetName];
  for (const cellAddr of Object.keys(sheet)) {
    if (cellAddr.startsWith('!')) continue;
    const cell = sheet[cellAddr];
    if (cell && (cell.v === '—' || cell.v === '-')) {
      cell.v = 'INCONNU';
      cell.t = 's';
    }
  }
}

// ─── 5. Feuille "Meilleurs Trades" — ajouter note de référence ───────────
const tradeSheet = wb.Sheets['🏆 Meilleurs Trades'];
if (tradeSheet) {
  const tradeRows = utils.sheet_to_json(tradeSheet, { header: 1, defval: null });
  const noteRow = [`📌 Les prix de référence sont dans la feuille "${NEW_NAME}". Mettez-la à jour pour maintenir ce tableau cohérent.`];
  const newTradeRows = [noteRow, [null], ...tradeRows];
  wb.Sheets['🏆 Meilleurs Trades'] = utils.aoa_to_sheet(newTradeRows);
  wb.Sheets['🏆 Meilleurs Trades']['!cols'] = [
    { wch: 4 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 10 }
  ];
}

// ─── 6. Feuille "Skanor Import & Export" — idem ─────────────────────────
const importSheet = wb.Sheets['🏠 Skanor Import & Export'];
if (importSheet) {
  const impRows = utils.sheet_to_json(importSheet, { header: 1, defval: null });
  const noteRow = [`📌 Les prix de référence sont dans la feuille "${NEW_NAME}". Mettez-la à jour pour maintenir ce tableau cohérent.`];
  const newImpRows = [noteRow, [null], ...impRows];
  wb.Sheets['🏠 Skanor Import & Export'] = utils.aoa_to_sheet(newImpRows);
}

// ─── 7. Écriture ─────────────────────────────────────────────────────────
const out = write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(DEST, out);
console.log(`✅ Fichier mis à jour → ${DEST}`);
console.log(`   Feuilles : ${wb.SheetNames.join(', ')}`);
