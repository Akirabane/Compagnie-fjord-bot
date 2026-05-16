import db, { stmts } from '../db/database.js';

export const SAISONS       = ['printemps', 'ete', 'automne', 'hiver'];
export const SAISON_EMOJIS = { printemps: '🌸', ete: '☀️', automne: '🍂', hiver: '❄️' };
export const SAISON_LABELS = { printemps: 'Printemps', ete: 'Été', automne: 'Automne', hiver: 'Hiver' };

// 1 saison = 2h réelles
const DUREE_SAISON_MS = 4 * 60 * 60 * 1000;

export function getSaisonCourante() {
  const actuelle = stmts.cfgGet.get('SAISON_ACTUELLE')?.value;
  const setAt    = stmts.cfgGet.get('SAISON_SET_AT')?.value;
  if (!actuelle || !setAt) return null;

  const idx = SAISONS.indexOf(actuelle);
  if (idx === -1) return null;

  const elapsed  = Date.now() - parseInt(setAt);
  const decalage = Math.floor(elapsed / DUREE_SAISON_MS);
  return SAISONS[(idx + decalage) % 4];
}

export function getSaisonInfo() {
  const actuelle = stmts.cfgGet.get('SAISON_ACTUELLE')?.value;
  const setAt    = stmts.cfgGet.get('SAISON_SET_AT')?.value;
  if (!actuelle || !setAt) return null;

  const idx      = SAISONS.indexOf(actuelle);
  const elapsed  = Date.now() - parseInt(setAt);
  const decalage = Math.floor(elapsed / DUREE_SAISON_MS);
  const saisonIdx = (idx + decalage) % 4;
  const saison   = SAISONS[saisonIdx];

  const debutSaison    = parseInt(setAt) + decalage * DUREE_SAISON_MS;
  const finSaison      = debutSaison + DUREE_SAISON_MS;
  const prochaineIdx   = (saisonIdx + 1) % 4;
  const prochaineSaison = SAISONS[prochaineIdx];

  return {
    saison,
    label:           SAISON_LABELS[saison],
    emoji:           SAISON_EMOJIS[saison],
    prochaineSaison,
    prochaineLabel:  SAISON_LABELS[prochaineSaison],
    prochaineEmoji:  SAISON_EMOJIS[prochaineSaison],
    finSaisonTs:     finSaison,
    setAt:           parseInt(setAt),
  };
}

export function setSaison(saison) {
  if (!SAISONS.includes(saison)) throw new Error(`Saison inconnue : ${saison}`);
  stmts.cfgSet.run('SAISON_ACTUELLE', saison);
  stmts.cfgSet.run('SAISON_SET_AT', Date.now().toString());
  stmts.cfgSet.run('SAISON_PRECEDENTE', saison);
}

export function getCulturesParSaison(saison) {
  try {
    return db.prepare("SELECT * FROM cultures WHERE saisons LIKE ? ORDER BY nom")
      .all(`%"${saison}"%`);
  } catch { return []; }
}

export function getStatutCulture(culture, saison) {
  try {
    const c = db.prepare("SELECT saisons, resistante FROM cultures WHERE LOWER(nom)=?")
      .get(culture.toLowerCase());
    if (!c) return null;
    const saisons = JSON.parse(c.saisons);
    if (saisons.includes(saison)) return 'en_saison';
    if (c.resistante) return 'resistante';
    return 'hors_saison';
  } catch { return null; }
}

export function getAllCultures() {
  try {
    return db.prepare("SELECT * FROM cultures ORDER BY nom").all();
  } catch { return []; }
}

export function getSaisonSummaryText() {
  const info = getSaisonInfo();
  if (!info) return null;

  const cultures = getCulturesParSaison(info.saison);
  const perennes = cultures.filter(c => c.perenne);
  const normales = cultures.filter(c => !c.perenne);

  const maintenant = Date.now();
  const resteMs    = info.finSaisonTs - maintenant;
  const resteMin   = Math.max(0, Math.round(resteMs / 60000));
  const resteH     = Math.floor(resteMin / 60);
  const resteM     = resteMin % 60;
  const dureeStr   = resteH > 0 ? `${resteH}h${resteM.toString().padStart(2,'0')}` : `${resteM} min`;

  return {
    info,
    cultures: normales.map(c => c.nom),
    perennes: perennes.map(c => c.nom),
    dureeStr,
    resteMs,
  };
}
