import db from './database.js';

const TARIFS = [
  // ── Ouvrier ────────────────────────────────────────────────────────────────
  { metier: 'Ouvrier', type: 'ressource',    item: 'Fer brut',  quantite: 1,  unite: 'Unité',   prix_ecus: 2,    note: '' },
  { metier: 'Ouvrier', type: 'ressource',    item: 'Bois',      quantite: 16, unite: 'Unités',  prix_ecus: 6,    note: '' },
  { metier: 'Ouvrier', type: 'ressource',    item: 'Pierre',    quantite: 32, unite: 'Unités',  prix_ecus: 6,    note: '' },
  { metier: 'Ouvrier', type: 'ressource',    item: 'Charbon',   quantite: 16, unite: 'Unités',  prix_ecus: 8,    note: '' },

  // ── Forgeron ───────────────────────────────────────────────────────────────
  { metier: 'Forgeron', type: 'main_oeuvre', item: 'Main-d\'œuvre — Ouvriers',       quantite: 1, unite: 'Pièce', prix_ecus: 2, note: 'Tarif réduit réservé aux ouvriers de la Compagnie' },
  { metier: 'Forgeron', type: 'main_oeuvre', item: 'Main-d\'œuvre — Tout le monde',  quantite: 1, unite: 'Pièce', prix_ecus: 3, note: 'Tarif standard' },
  { metier: 'Forgeron', type: 'fabrication', item: 'Lingot de fer', quantite: 1, unite: 'Unité',  prix_ecus: 4,  note: '' },
  { metier: 'Forgeron', type: 'fabrication', item: 'Pioche',        quantite: 1, unite: 'Unité',  prix_ecus: 11, note: '' },
  { metier: 'Forgeron', type: 'fabrication', item: 'Pelle',         quantite: 1, unite: 'Unité',  prix_ecus: 11, note: '' },
  { metier: 'Forgeron', type: 'fabrication', item: 'Hache',         quantite: 1, unite: 'Unité',  prix_ecus: 11, note: '' },
  { metier: 'Forgeron', type: 'fabrication', item: 'Houe',          quantite: 1, unite: 'Unité',  prix_ecus: 11, note: '' },
  { metier: 'Forgeron', type: 'fabrication', item: 'Seau',          quantite: 1, unite: 'Unité',  prix_ecus: 12, note: '' },

  // ── Agriculteur ────────────────────────────────────────────────────────────
  { metier: 'Agriculteur', type: 'ressource',      item: 'Œuf au plat',             quantite: 1,  unite: 'Unité',  prix_ecus: 1,  note: '' },
  { metier: 'Agriculteur', type: 'ressource',      item: 'Pain',                    quantite: 1,  unite: 'Unité',  prix_ecus: 1,  note: '' },
  { metier: 'Agriculteur', type: 'ressource',      item: 'Blé',                     quantite: 64, unite: 'Unités', prix_ecus: 16, note: '4 blés = 1 écu' },
  { metier: 'Agriculteur', type: 'ressource',      item: 'Mouton cru',              quantite: 1,  unite: 'Unité',  prix_ecus: 3,  note: '' },
  { metier: 'Agriculteur', type: 'ressource',      item: 'Cochon cru',              quantite: 1,  unite: 'Unité',  prix_ecus: 3,  note: '' },
  { metier: 'Agriculteur', type: 'ressource',      item: 'Lapin cru',               quantite: 1,  unite: 'Unité',  prix_ecus: 2,  note: '' },
  { metier: 'Agriculteur', type: 'ressource',      item: 'Cerf cru',                quantite: 1,  unite: 'Unité',  prix_ecus: 1,  note: '' },
  { metier: 'Agriculteur', type: 'ressource',      item: 'Canard cru',              quantite: 1,  unite: 'Unité',  prix_ecus: 3,  note: '' },
  { metier: 'Agriculteur', type: 'ressource',      item: 'Poulet cru',              quantite: 1,  unite: 'Unité',  prix_ecus: 3,  note: '' },
  { metier: 'Agriculteur', type: 'transformation', item: 'Pâte sèche',              quantite: 1,  unite: 'Unité',  prix_ecus: null, note: 'Prix en attente de validation' },
  { metier: 'Agriculteur', type: 'transformation', item: 'Sauce tomate',            quantite: 1,  unite: 'Unité',  prix_ecus: null, note: 'Prix en attente de validation' },
  { metier: 'Agriculteur', type: 'transformation', item: 'Beurre',                  quantite: 1,  unite: 'Unité',  prix_ecus: null, note: 'Prix en attente de validation' },
  { metier: 'Agriculteur', type: 'transformation', item: 'Fromage frais',           quantite: 1,  unite: 'Unité',  prix_ecus: null, note: 'Prix en attente de validation' },
  { metier: 'Agriculteur', type: 'transformation', item: 'Morceau de pain nourrissant', quantite: 1, unite: 'Unité', prix_ecus: 2, note: '' },

  // ── Constructeur ───────────────────────────────────────────────────────────
  { metier: 'Constructeur', type: 'construction', item: 'Enclos / petites modifications',    quantite: 1, unite: 'Projet', prix_ecus: null, note: 'Main-d\'œuvre = valeur des matériaux × 10%' },
  { metier: 'Constructeur', type: 'construction', item: 'Maison simple / petit édifice',     quantite: 1, unite: 'Projet', prix_ecus: null, note: 'Main-d\'œuvre = valeur des matériaux × 25%' },
  { metier: 'Constructeur', type: 'construction', item: 'Grande bâtisse / forge / tannerie', quantite: 1, unite: 'Projet', prix_ecus: null, note: 'Main-d\'œuvre = valeur des matériaux × 40%' },
  { metier: 'Constructeur', type: 'construction', item: 'Autres projets',                    quantite: 1, unite: 'Projet', prix_ecus: null, note: 'Voir directement avec les bâtisseurs. Si les matériaux sont fournis, seule la main-d\'œuvre est due.' },

  // ── Apothicaire ────────────────────────────────────────────────────────────
  { metier: 'Apothicaire', type: 'avertissement', item: 'Potions, remèdes, produits alchimiques', quantite: 1, unite: 'Unité', prix_ecus: null, note: 'Les apothicaires ne se sont pas encore présentés à la Compagnie. Aucune grille tarifaire officielle. Des abus de prix sont possibles — acheter avec prudence.' },
];

const existing = db.prepare('SELECT COUNT(*) as n FROM tarifs_officiels').get();
if (existing.n === 0) {
  const ins = db.prepare('INSERT INTO tarifs_officiels (metier,type,item,quantite,unite,prix_ecus,note) VALUES (?,?,?,?,?,?,?)');
  for (const t of TARIFS) {
    ins.run(t.metier, t.type, t.item, t.quantite, t.unite, t.prix_ecus ?? null, t.note);
  }
  console.log(`[tarifs] ${TARIFS.length} tarifs officiels insérés.`);
} else {
  console.log(`[tarifs] Table déjà peuplée (${existing.n} entrées).`);
}
