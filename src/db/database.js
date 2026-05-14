import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'fjord.db'));

// ── PRAGMA performance ────────────────────────────────────────────────────────
db.exec("PRAGMA journal_mode=WAL");       // lectures concurrentes sans lock
db.exec("PRAGMA synchronous=NORMAL");     // fsync moins fréquent, suffisant avec WAL
db.exec("PRAGMA cache_size=-32000");      // 32 MB de cache page en RAM
db.exec("PRAGMA temp_store=MEMORY");      // tables temporaires en RAM
db.exec("PRAGMA mmap_size=134217728");    // 128 MB memory-mapped I/O
db.exec("PRAGMA foreign_keys=ON");

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

db.exec(`
  CREATE TABLE IF NOT EXISTS user_permissions (
    user_id          TEXT PRIMARY KEY,
    username         TEXT NOT NULL,
    display_name     TEXT NOT NULL DEFAULT '',
    permission_level TEXT NOT NULL DEFAULT 'VISITEUR',
    permissions      TEXT NOT NULL DEFAULT '{}',
    updated_at       TEXT DEFAULT (datetime('now')),
    updated_by       TEXT DEFAULT ''
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS contrats (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    vendeur_id      TEXT NOT NULL,
    vendeur_pseudo  TEXT NOT NULL,
    acheteur_id     TEXT DEFAULT NULL,
    acheteur_pseudo TEXT DEFAULT NULL,
    ressource       TEXT NOT NULL,
    quantite        REAL NOT NULL,
    unite           TEXT DEFAULT 'Unité',
    prix_total      INTEGER NOT NULL,
    penalite        INTEGER DEFAULT 0,
    note            TEXT DEFAULT '',
    statut          TEXT DEFAULT 'ouvert',
    echeance_le     TEXT NOT NULL,
    creee_le        TEXT DEFAULT (datetime('now')),
    cloturee_le     TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS client_stats (
    client_id       TEXT PRIMARY KEY,
    client_pseudo   TEXT NOT NULL,
    nb_commandes    INTEGER DEFAULT 0,
    nb_livrees      INTEGER DEFAULT 0,
    nb_annulees     INTEGER DEFAULT 0,
    total_bronze    INTEGER DEFAULT 0,
    segment         TEXT DEFAULT 'NOUVEAU',
    updated_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alertes_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cle         TEXT NOT NULL UNIQUE,
    derniere_le TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS player_profiles (
    user_id    TEXT PRIMARY KEY,
    nom_rp     TEXT DEFAULT '',
    notes      TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversation_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);

// Index (idempotents)
for (const idx of [
  'CREATE INDEX IF NOT EXISTS idx_commandes_statut   ON commandes(statut)',
  'CREATE INDEX IF NOT EXISTS idx_commandes_client   ON commandes(client_id)',
  'CREATE INDEX IF NOT EXISTS idx_commandes_date     ON commandes(creee_le DESC)',
  'CREATE INDEX IF NOT EXISTS idx_transactions_date  ON transactions(date DESC)',
  'CREATE INDEX IF NOT EXISTS idx_transactions_type  ON transactions(type)',
  'CREATE INDEX IF NOT EXISTS idx_stock_categorie    ON stock(categorie)',
  'CREATE INDEX IF NOT EXISTS idx_stock_vente        ON stock(en_vente)',
  'CREATE INDEX IF NOT EXISTS idx_offres_statut      ON offres_vente(statut)',
  'CREATE INDEX IF NOT EXISTS idx_logs_date          ON activity_logs(creee_le DESC)',
  'CREATE INDEX IF NOT EXISTS idx_conv_user          ON conversation_history(user_id, id DESC)',
]) { try { db.exec(idx); } catch {} }

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

// ── Statements préparés une seule fois au démarrage ───────────────────────────
export const stmts = {
  // Stock
  stockAll:       db.prepare("SELECT * FROM stock ORDER BY categorie, ressource"),
  stockVente:     db.prepare("SELECT * FROM stock WHERE en_vente=1 AND quantite>0 ORDER BY categorie, ressource"),
  stockById:      db.prepare("SELECT * FROM stock WHERE id=?"),
  stockByName:    db.prepare("SELECT * FROM stock WHERE LOWER(ressource)=?"),
  stockUpdate:    db.prepare("UPDATE stock SET quantite=?, prix_bronze=?, en_vente=? WHERE id=?"),
  stockInsert:    db.prepare("INSERT INTO stock (categorie,ressource,unite,prix_bronze,quantite,en_vente) VALUES (?,?,?,?,?,1)"),
  stockDelete:    db.prepare("DELETE FROM stock WHERE id=?"),

  // Commandes
  cmdById:        db.prepare("SELECT * FROM commandes WHERE id=?"),
  cmdActives:     db.prepare("SELECT * FROM commandes WHERE statut IN ('en_attente','en_cours','prete') ORDER BY creee_le DESC"),
  cmdByClient:    db.prepare("SELECT * FROM commandes WHERE client_id=? AND statut NOT IN ('livree','annulee') ORDER BY id"),
  cmdSetStatut:   db.prepare("UPDATE commandes SET statut=?, traitee_le=datetime('now') WHERE id=?"),
  cmdInsert:      db.prepare("INSERT INTO commandes (client_id,client_pseudo,ressource,quantite,unite,prix_total,note,vendeur_pseudo,vendeur_id) VALUES (?,?,?,?,?,?,?,?,?)"),

  // Config
  cfgGet:         db.prepare("SELECT value FROM config WHERE key=?"),
  cfgSet:         db.prepare("INSERT OR REPLACE INTO config (key,value) VALUES (?,?)"),

  // Trésorerie
  tresorGet:      db.prepare("SELECT value FROM config WHERE key='TRESOR_BRONZE'"),
  tresorHistIns:  db.prepare("INSERT INTO tresorerie_history (montant,solde_apres,motif,auteur) VALUES (?,?,?,?)"),

  // Offres
  offresAttente:  db.prepare("SELECT * FROM offres_vente WHERE statut='en_attente' ORDER BY id"),
  offreById:      db.prepare("SELECT * FROM offres_vente WHERE id=?"),
  offreSetStatut: db.prepare("UPDATE offres_vente SET statut=? WHERE id=?"),

  // Logs
  logInsert:      db.prepare("INSERT INTO activity_logs (action,detail,auteur) VALUES (?,?,?)"),

  // Transactions
  txInsert:       db.prepare("INSERT INTO transactions (type,ressource,quantite,prix_bronze,client_pseudo) VALUES (?,?,?,?,?)"),

  // Permissions
  permGet:        db.prepare("SELECT * FROM user_permissions WHERE user_id=?"),
  permUpsert:     db.prepare("INSERT INTO user_permissions (user_id,username,display_name,permission_level,permissions,updated_at) VALUES (?,?,?,?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,permission_level=excluded.permission_level,permissions=excluded.permissions,updated_at=excluded.updated_at"),

  // Contrats
  contratInsert:    db.prepare("INSERT INTO contrats (vendeur_id,vendeur_pseudo,ressource,quantite,unite,prix_total,penalite,note,echeance_le) VALUES (?,?,?,?,?,?,?,?,?)"),
  contratById:      db.prepare("SELECT * FROM contrats WHERE id=?"),
  contratOuverts:   db.prepare("SELECT * FROM contrats WHERE statut='ouvert' ORDER BY echeance_le ASC"),
  contratByUser:    db.prepare("SELECT * FROM contrats WHERE vendeur_id=? OR acheteur_id=? ORDER BY creee_le DESC LIMIT 10"),
  contratSetStatut: db.prepare("UPDATE contrats SET statut=?, cloturee_le=datetime('now') WHERE id=?"),
  contratAccepter:  db.prepare("UPDATE contrats SET acheteur_id=?, acheteur_pseudo=?, statut='accepte' WHERE id=?"),
  contratExpirant:  db.prepare("SELECT * FROM contrats WHERE statut IN ('ouvert','accepte') AND echeance_le <= datetime('now','+24 hours')"),

  // Stats clients
  clientStatsGet:    db.prepare("SELECT * FROM client_stats WHERE client_id=?"),
  clientStatsUpsert: db.prepare("INSERT INTO client_stats (client_id,client_pseudo,nb_commandes,nb_livrees,nb_annulees,total_bronze,segment) VALUES (?,?,?,?,?,?,?) ON CONFLICT(client_id) DO UPDATE SET client_pseudo=excluded.client_pseudo, nb_commandes=excluded.nb_commandes, nb_livrees=excluded.nb_livrees, nb_annulees=excluded.nb_annulees, total_bronze=excluded.total_bronze, segment=excluded.segment, updated_at=datetime('now')"),

  // Alertes log (anti-spam)
  alerteLogGet:    db.prepare("SELECT derniere_le FROM alertes_log WHERE cle=?"),
  alerteLogUpsert: db.prepare("INSERT INTO alertes_log (cle,derniere_le) VALUES (?,datetime('now')) ON CONFLICT(cle) DO UPDATE SET derniere_le=datetime('now')"),

  // Profils joueurs
  profileGet:     db.prepare("SELECT * FROM player_profiles WHERE user_id=?"),
  profileUpsert:  db.prepare("INSERT INTO player_profiles (user_id, nom_rp, notes) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET nom_rp=excluded.nom_rp, notes=excluded.notes, updated_at=datetime('now')"),

  // Conversation history
  convLoad:       db.prepare("SELECT role, content FROM conversation_history WHERE user_id=? ORDER BY id DESC LIMIT ?"),
  convInsert:     db.prepare("INSERT INTO conversation_history (user_id, role, content) VALUES (?,?,?)"),
  convPrune:      db.prepare("DELETE FROM conversation_history WHERE user_id=? AND id NOT IN (SELECT id FROM conversation_history WHERE user_id=? ORDER BY id DESC LIMIT ?)"),
  convDelete:     db.prepare("DELETE FROM conversation_history WHERE user_id=?"),
  convLastAt:     db.prepare("SELECT created_at FROM conversation_history WHERE user_id=? ORDER BY id DESC LIMIT 1"),

  // Sessions
  sessionGet:     db.prepare("SELECT data FROM sessions WHERE sid=? AND expires_at>?"),
  sessionSet:     db.prepare("INSERT OR REPLACE INTO sessions (sid,data,expires_at) VALUES (?,?,?)"),
  sessionDel:     db.prepare("DELETE FROM sessions WHERE sid=?"),
  sessionClean:   db.prepare("DELETE FROM sessions WHERE expires_at<=?"),
};

export default { prepare, transaction, exec: (sql) => db.exec(sql) };
