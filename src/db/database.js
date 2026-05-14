import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'fjord.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categorie TEXT NOT NULL,
    ressource TEXT NOT NULL UNIQUE,
    quantite REAL DEFAULT 0,
    unite TEXT NOT NULL,
    prix_bronze INTEGER NOT NULL,
    en_vente INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS prix_regions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categorie TEXT NOT NULL,
    produit TEXT NOT NULL UNIQUE,
    unite_base TEXT NOT NULL DEFAULT '1 Unité',
    prix_min INTEGER,
    prix_pdm INTEGER,
    prix_rheme INTEGER,
    prix_skanor INTEGER,
    prix_byb INTEGER,
    prix_yuhang INTEGER
  );

  CREATE TABLE IF NOT EXISTS recettes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_craft TEXT NOT NULL,
    profession TEXT NOT NULL,
    niveau INTEGER DEFAULT 1,
    objet TEXT NOT NULL,
    qte_produit INTEGER DEFAULT 1,
    mat1 TEXT, qte1 INTEGER,
    mat2 TEXT, qte2 INTEGER,
    mat3 TEXT, qte3 INTEGER,
    mat4 TEXT, qte4 INTEGER,
    mat5 TEXT, qte5 INTEGER
  );

  CREATE TABLE IF NOT EXISTS commandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    client_pseudo TEXT NOT NULL,
    ressource TEXT NOT NULL,
    quantite REAL NOT NULL,
    unite TEXT NOT NULL,
    prix_total INTEGER NOT NULL,
    statut TEXT DEFAULT 'en_attente',
    note TEXT DEFAULT '',
    creee_le TEXT DEFAULT (datetime('now')),
    traitee_le TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    ressource TEXT NOT NULL,
    quantite REAL NOT NULL,
    prix_bronze INTEGER NOT NULL,
    client_pseudo TEXT DEFAULT NULL,
    date TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS marche (
    ressource TEXT PRIMARY KEY,
    variation INTEGER DEFAULT 0,
    derniere_maj TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mat_prix (
    mat_id TEXT PRIMARY KEY,
    prix_bronze INTEGER
  );

  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS offres_vente (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    vendeur_id     TEXT NOT NULL,
    vendeur_pseudo TEXT NOT NULL,
    ressource      TEXT NOT NULL,
    quantite       REAL NOT NULL,
    unite          TEXT DEFAULT 'Unité',
    prix_demande   INTEGER DEFAULT 0,
    note           TEXT DEFAULT '',
    statut         TEXT DEFAULT 'en_attente',
    ticket_id      TEXT DEFAULT NULL,
    ticket_msg_id  TEXT DEFAULT NULL,
    creee_le       TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS forum_posts_acheteurs (
    client_id TEXT PRIMARY KEY,
    post_id   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS forum_posts_vendeurs (
    vendeur_id TEXT PRIMARY KEY,
    post_id    TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    action   TEXT NOT NULL,
    detail   TEXT DEFAULT '',
    auteur   TEXT DEFAULT '',
    creee_le TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tresorerie_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    montant    INTEGER NOT NULL,
    solde_apres INTEGER NOT NULL,
    motif      TEXT DEFAULT '',
    auteur     TEXT DEFAULT '',
    creee_le   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS client_notes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id      TEXT NOT NULL,
    client_pseudo  TEXT NOT NULL,
    note           INTEGER DEFAULT 3,
    commentaire    TEXT DEFAULT '',
    auteur         TEXT DEFAULT '',
    creee_le       TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tarifs_officiels (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    metier   TEXT NOT NULL,
    type     TEXT NOT NULL DEFAULT 'ressource',
    item     TEXT NOT NULL,
    quantite INTEGER DEFAULT 1,
    unite    TEXT DEFAULT 'Unité',
    prix_ecus INTEGER,
    note     TEXT DEFAULT ''
  );
`);

// Migrations (idempotentes)
for (const col of [
  "ALTER TABLE commandes ADD COLUMN ticket_id TEXT DEFAULT NULL",
  "ALTER TABLE commandes ADD COLUMN ticket_msg_id TEXT DEFAULT NULL",
  "ALTER TABLE commandes ADD COLUMN vendeur_pseudo TEXT DEFAULT NULL",
  "ALTER TABLE commandes ADD COLUMN vendeur_id TEXT DEFAULT NULL",
  "ALTER TABLE stock ADD COLUMN seuil_alerte INTEGER DEFAULT 0",
]) { try { db.exec(col); } catch {} }

const prepare = (sql) => {
  const stmt = db.prepare(sql);
  return {
    run:  (...args) => stmt.run(...args),
    get:  (...args) => stmt.get(...args),
    all:  (...args) => stmt.all(...args),
  };
};

const transaction = (fn) => () => {
  db.exec('BEGIN');
  try { fn(); db.exec('COMMIT'); }
  catch (e) { db.exec('ROLLBACK'); throw e; }
};

export default { prepare, transaction, exec: (sql) => db.exec(sql) };
