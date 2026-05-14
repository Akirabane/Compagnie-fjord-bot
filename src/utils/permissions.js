import db from '../db/database.js';

export const LEVELS = ['VISITEUR', 'PAYSAN', 'ECUYER', 'NOBLE', 'JARL'];

export const LEVEL_LABELS = {
  JARL:     '👑 Jarl',
  NOBLE:    '⚜️ Noble',
  ECUYER:   '🛡️ Écuyer',
  PAYSAN:   '🌾 Paysan',
  VISITEUR: '🚪 Visiteur',
};

export const LEVEL_DESCRIPTIONS = {
  JARL:     'Chef suprême de la Compagnie. Accès total à toutes les fonctionnalités.',
  NOBLE:    'Dirigeant de haut rang. Gestion complète sauf configuration du bot.',
  ECUYER:   'Marchand confirmé. Gestion du stock, des commandes et des prix.',
  PAYSAN:   'Membre de base. Accès en lecture seule aux statistiques.',
  VISITEUR: 'Visiteur de passage. Commandes publiques Discord uniquement.',
};

export const PERMISSION_KEYS = [
  'can_manage_stock',
  'can_manage_orders',
  'can_view_treasury',
  'can_manage_treasury',
  'can_manage_prices',
  'can_manage_catalog',
  'can_view_analytics',
  'can_manage_market',
  'can_make_announcements',
  'can_manage_forum',
  'can_assign_roles',
  'can_configure_bot',
];

export const PERMISSION_LABELS = {
  can_manage_stock:       '📦 Gérer le stock',
  can_manage_orders:      '📋 Gérer les commandes',
  can_view_treasury:      '🏦 Voir la trésorerie',
  can_manage_treasury:    '💰 Modifier la trésorerie',
  can_manage_prices:      '💹 Gérer les prix',
  can_manage_catalog:     '📖 Gérer le catalogue/recettes',
  can_view_analytics:     '📊 Voir les statistiques',
  can_manage_market:      '📈 Gérer le marché (bourse)',
  can_make_announcements: '📢 Faire des annonces',
  can_manage_forum:       '🗂️ Gérer le forum',
  can_assign_roles:       '🎭 Assigner des rôles',
  can_configure_bot:      '⚙️ Configurer le bot',
};

export const DEFAULT_PERMISSIONS = {
  JARL: {
    can_manage_stock: true,
    can_manage_orders: true,
    can_view_treasury: true,
    can_manage_treasury: true,
    can_manage_prices: true,
    can_manage_catalog: true,
    can_view_analytics: true,
    can_manage_market: true,
    can_make_announcements: true,
    can_manage_forum: true,
    can_assign_roles: true,
    can_configure_bot: true,
  },
  NOBLE: {
    can_manage_stock: true,
    can_manage_orders: true,
    can_view_treasury: true,
    can_manage_treasury: true,
    can_manage_prices: true,
    can_manage_catalog: true,
    can_view_analytics: true,
    can_manage_market: true,
    can_make_announcements: true,
    can_manage_forum: true,
    can_assign_roles: false,
    can_configure_bot: false,
  },
  ECUYER: {
    can_manage_stock: true,
    can_manage_orders: true,
    can_view_treasury: true,
    can_manage_treasury: false,
    can_manage_prices: true,
    can_manage_catalog: true,
    can_view_analytics: true,
    can_manage_market: true,
    can_make_announcements: false,
    can_manage_forum: true,
    can_assign_roles: false,
    can_configure_bot: false,
  },
  PAYSAN: {
    can_manage_stock: false,
    can_manage_orders: false,
    can_view_treasury: false,
    can_manage_treasury: false,
    can_manage_prices: false,
    can_manage_catalog: false,
    can_view_analytics: true,
    can_manage_market: false,
    can_make_announcements: false,
    can_manage_forum: false,
    can_assign_roles: false,
    can_configure_bot: false,
  },
  VISITEUR: {
    can_manage_stock: false,
    can_manage_orders: false,
    can_view_treasury: false,
    can_manage_treasury: false,
    can_manage_prices: false,
    can_manage_catalog: false,
    can_view_analytics: false,
    can_manage_market: false,
    can_make_announcements: false,
    can_manage_forum: false,
    can_assign_roles: false,
    can_configure_bot: false,
  },
};

// Detect RP level from Discord role names
export function detectLevelFromRoleNames(roleNames) {
  const names = roleNames.map(n => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  if (names.some(n => n.includes('jarl')))   return 'JARL';
  if (names.some(n => n.includes('noble')))  return 'NOBLE';
  if (names.some(n => n.includes('ecuyer') || n.includes('ecuyere') || n.includes('écuyer'))) return 'ECUYER';
  if (names.some(n => n.includes('paysan'))) return 'PAYSAN';
  return 'VISITEUR';
}

export function getUserPermissions(userId) {
  const row = db.prepare('SELECT * FROM user_permissions WHERE user_id=?').get(userId);
  if (!row) return null;
  let overrides = {};
  try { overrides = JSON.parse(row.permissions); } catch {}
  return { level: row.permission_level, overrides, username: row.username, display_name: row.display_name };
}

export function getEffectivePermissions(userId) {
  const row = getUserPermissions(userId);
  if (!row) return { level: 'VISITEUR', permissions: { ...DEFAULT_PERMISSIONS.VISITEUR } };
  const defaults = { ...(DEFAULT_PERMISSIONS[row.level] ?? DEFAULT_PERMISSIONS.VISITEUR) };
  return { level: row.level, permissions: { ...defaults, ...row.overrides } };
}

export function hasPermission(userId, permKey, ownerId = null) {
  if (ownerId && userId === ownerId) return true;
  const { permissions } = getEffectivePermissions(userId);
  return permissions[permKey] === true;
}

export function canWriteAny(userId, ownerId = null) {
  if (ownerId && userId === ownerId) return true;
  const { permissions } = getEffectivePermissions(userId);
  return Object.entries(permissions)
    .filter(([k]) => k !== 'can_view_treasury' && k !== 'can_view_analytics')
    .some(([, v]) => v === true);
}

export function upsertUser(userId, username, displayName, level, permOverrides = {}) {
  db.prepare(`
    INSERT INTO user_permissions (user_id, username, display_name, permission_level, permissions, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      username=excluded.username,
      display_name=excluded.display_name,
      permission_level=excluded.permission_level,
      permissions=excluded.permissions,
      updated_at=excluded.updated_at
  `).run(userId, username, displayName, level, JSON.stringify(permOverrides));
}

export function buildPermissionSummary(level, permOverrides = {}) {
  const defaults = DEFAULT_PERMISSIONS[level] ?? DEFAULT_PERMISSIONS.VISITEUR;
  const effective = { ...defaults, ...permOverrides };
  const granted = PERMISSION_KEYS.filter(k => effective[k]);
  const denied  = PERMISSION_KEYS.filter(k => !effective[k]);
  return { granted, denied, effective };
}
