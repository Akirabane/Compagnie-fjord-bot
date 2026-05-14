// ── Utils ─────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const api = async (method, url, body) => {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { showLogin(); return null; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur');
  return data;
};
const get  = url      => api('GET',    url);
const post = (url, b) => api('POST',   url, b);
const put  = (url, b) => api('PUT',    url, b);
const del  = url      => api('DELETE', url);

function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = type === 'ok' ? `✓ ${msg}` : `✗ ${msg}`;
  $('toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3200);
}

function bronze(v) {
  if (!v && v !== 0) return '—';
  if (v === 0) return '0🟤';
  const or = Math.floor(v / 100), ag = Math.floor((v % 100) / 10), br = v % 10;
  const parts = [];
  if (or) parts.push(`${or}🟡`);
  if (ag) parts.push(`${ag}⚪`);
  if (br || !parts.length) parts.push(`${br}🟤`);
  return parts.join(' ');
}

function bronzeShort(v) {
  if (!v) return '—';
  if (v >= 100) return `${(v/100).toFixed(1)}🟡`;
  if (v >= 10)  return `${Math.floor(v/10)}⚪${v%10>0?v%10+'🟤':''}`;
  return `${v}🟤`;
}

function bronzeToDisplay(v) {
  v = parseInt(v) || 0;
  if (v === 0) return '0 Bronze';
  const or = Math.floor(v / 100), ag = Math.floor((v % 100) / 10), br = v % 10;
  const parts = [];
  if (or) parts.push(`${or} Or 🟡`);
  if (ag) parts.push(`${ag} Argent ⚪`);
  if (br) parts.push(`${br} Bronze 🟤`);
  return parts.join(' · ') || '0 Bronze';
}

async function saveTresor() {
  const or     = parseInt($('tresor-or')?.value)     || 0;
  const argent = parseInt($('tresor-argent')?.value) || 0;
  const bronze = parseInt($('tresor-bronze')?.value) || 0;
  const total  = or * 100 + argent * 10 + bronze;
  try {
    await put('/api/tresor', { bronze: total });
    const display = $('tresor-display');
    if (display) display.textContent = bronzeToDisplay(total);
    toast('Trésor mis à jour — embed Discord rafraîchi');
  } catch (e) { toast(e.message, 'err'); }
}

function statutBadge(s) {
  const map = {
    en_attente: ['badge-attente','⏳ En attente'],
    en_cours:   ['badge-cours',  '⚒️ En cours'],
    prete:      ['badge-prete',  '📦 Prête'],
    livree:     ['badge-livree', '✅ Livrée'],
    annulee:    ['badge-annulee','❌ Annulée'],
  };
  const [cls, label] = map[s] ?? ['badge-attente', s];
  return `<span class="badge ${cls}">${label}</span>`;
}

function openModal(title, bodyHTML, footerHTML) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHTML;
  $('modal-footer').innerHTML = footerHTML;
  $('modal').classList.add('open');
}
function closeModal(e) {
  if (e && e.target !== $('modal')) return;
  $('modal').classList.remove('open');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('modal').classList.remove('open'); });

let _confirmCallback = null;
function confirmDlg(msg, onOk) {
  _confirmCallback = onOk;
  openModal('Confirmation',
    `<p style="color:var(--text-dim);line-height:1.7">${msg}</p>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-danger" onclick="closeModal();_confirmCallback&&_confirmCallback()">Supprimer</button>`
  );
}

// ── Mobile table scroll wrap ──────────────────────────────────────────────────
function wrapTables(root) {
  const el = root || $('page-content');
  if (!el) return;
  el.querySelectorAll('table').forEach(t => {
    if (t.parentElement?.classList.contains('tbl-scroll')) return;
    const wrap = document.createElement('div');
    wrap.className = 'tbl-scroll';
    wrap.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:inherit';
    t.parentNode.insertBefore(wrap, t);
    wrap.appendChild(t);
  });
}

// ── Sort system ───────────────────────────────────────────────────────────────
const sortStates = {};

function sortData(data, key, dir) {
  return [...data].sort((a, b) => {
    let va = a[key], vb = b[key];
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr', { numeric: true });
    return dir === 'asc' ? cmp : -cmp;
  });
}

function th(page, key, label, extra = '') {
  const s = sortStates[page];
  const active = s?.key === key;
  const dir    = active ? s.dir : 'asc';
  const next   = active && dir === 'asc' ? 'desc' : 'asc';
  const arrow  = active ? (dir === 'asc' ? '▲' : '▼') : '⇅';
  return `<th class="sortable${active?' sort-active':''}" ${extra} onclick="setSort('${page}','${key}','${next}')">${label} <span class="sort-arrow">${arrow}</span></th>`;
}

function setSort(page, key, dir) {
  sortStates[page] = { key, dir };
  const fns = { stock: loadStock, prix: loadPrix, commandes: loadCommandes, recettes: loadRecettes, offres: loadOffres };
  fns[page]?.();
}

function applySort(page, data) {
  const s = sortStates[page];
  return s ? sortData(data, s.key, s.dir) : data;
}

// ── Charts registry ───────────────────────────────────────────────────────────
const charts = {};
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
function mkChart(id, cfg) {
  destroyChart(id);
  const ctx = $(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, cfg);
}

const CHART_DEFAULTS = {
  color: '#e2e8f0',
  borderColor: '#2a3047',
  plugins: { legend: { labels: { color: '#8892a4', font: { size: 12 } } } },
  scales: {
    x: { ticks: { color: '#8892a4', font: { size: 11 } }, grid: { color: '#1e2433' } },
    y: { ticks: { color: '#8892a4', font: { size: 11 } }, grid: { color: '#1e2433' } },
  },
};

function chartColors(n) {
  const base = ['#c9a84c','#58a6ff','#3fb950','#f85149','#e3b341','#a371f7','#79c0ff','#56d364'];
  return Array.from({ length: n }, (_, i) => base[i % base.length]);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function showLogin() { $('app').style.display = 'none'; $('login-screen').style.display = 'flex'; $('visiteur-blocked').style.display = 'none'; }
function showApp()   { $('login-screen').style.display = 'none'; $('visiteur-blocked').style.display = 'none'; $('app').style.display = 'flex'; }
async function logout() { await fetch('/auth/logout', { method: 'POST' }); showLogin(); }
function showVisiteurBlocked() {
  $('app').style.display = 'none';
  $('login-screen').style.display = 'none';
  $('visiteur-blocked').style.display = 'flex';
}

// ── Mobile sidebar ────────────────────────────────────────────────────────────
function toggleSidebar() {
  const sb = $('sidebar'), ov = $('sidebar-overlay');
  const open = sb.classList.toggle('open');
  ov.classList.toggle('visible', open);
  document.body.style.overflow = open ? 'hidden' : '';
}
function closeSidebar() {
  $('sidebar')?.classList.remove('open');
  $('sidebar-overlay')?.classList.remove('visible');
  document.body.style.overflow = '';
}
// Close sidebar on Escape key
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });

// ── WebSocket temps réel ──────────────────────────────────────────────────────
let _socket = null;
function initSocket() {
  if (_socket) return;
  _socket = io({ transports: ['websocket'] });

  _socket.on('stock:update', () => {
    if (currentPage === 'stock' || currentPage === 'dashboard') PAGES[currentPage]?.render();
  });

  _socket.on('commandes:update', ({ id, statut }) => {
    if (currentPage === 'commandes' || currentPage === 'dashboard') PAGES[currentPage]?.render();
    // Flash visuel sur la ligne si la page commandes est ouverte
    const row = document.querySelector(`[data-cmd-id="${id}"]`);
    if (row) { row.style.transition = 'background .4s'; row.style.background = 'rgba(201,168,76,.18)'; setTimeout(() => row.style.background = '', 1500); }
  });

  _socket.on('tresor:update', ({ bronze }) => {
    if (currentPage === 'tresorerie' || currentPage === 'dashboard') PAGES[currentPage]?.render();
    // Mini-update du header trésorerie si visible sans rerender
    const el = $('tresor-display');
    if (el) el.textContent = bronzeToDisplay(bronze);
  });

  _socket.on('offres:update', () => {
    if (currentPage === 'offres') PAGES.offres?.render();
  });

  _socket.on('connect', () => console.log('[WS] connecté'));
  _socket.on('disconnect', () => console.log('[WS] déconnecté'));
}

// ── Router ────────────────────────────────────────────────────────────────────
const PAGES = {
  dashboard:  { title: '📊 Tableau de bord',        render: renderDashboard },
  tarifs:     { title: '⚖️ Tarifs officiels',         render: renderTarifs },
  logs:       { title: '📋 Journaux d\'activité',    render: renderLogs },
  stock:      { title: '📦 Stock',                   render: renderStock },
  prix:       { title: '💰 Prix en temps réel',      render: renderPrix },
  commandes:  { title: '🛒 Commandes',               render: renderCommandes },
  offres:     { title: '🛍️ Offres de vente',         render: renderOffres },
  tresorerie: { title: '🏦 Trésorerie',              render: renderTresorerie },
  recettes:   { title: '📖 Recettes',                render: renderRecettes },
  ia:         { title: '🤖 Config Intendant IA',     render: renderIA },
  permissions:{ title: '🛡️ Gestion des Permissions', render: renderPermissions },
  wiki:       { title: '📚 Wiki & Commandes',        render: renderWiki },
  'ia-chat':  { title: '💬 Chat Intendant',          render: renderIAChat },
  analyser:   { title: '🔍 Analyse d\'image IA',     render: renderAnalyser },
  negocier:   { title: '🤝 Négociation commerciale', render: renderNegocier },
  bourse:     { title: '💱 Bourse & Conversions',    render: renderBourse },
  contrats:   { title: '📜 Contrats',                render: renderContrats },
  modifier:   { title: '🛠️ Demandes de modification', render: renderModifier },
};

let currentPage = 'dashboard';
function navigate(page) {
  if (!PAGES[page]) return;
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  $('page-title').textContent = PAGES[page].title;
  $('topbar-actions').innerHTML = '';
  $('page-content').innerHTML = '<div class="empty"><div class="spinner"></div></div>';
  Object.values(charts).forEach(c => c.destroy());
  for (const k of Object.keys(charts)) delete charts[k];
  if (_modifierRefreshTimer) { clearInterval(_modifierRefreshTimer); _modifierRefreshTimer = null; }
  if (_modifierPollTimer)    { clearInterval(_modifierPollTimer);    _modifierPollTimer    = null; }
  const p = Promise.resolve(PAGES[page].render());
  p.then(() => {
    const el = $('page-content');
    if (el) { el.classList.remove('page-enter'); void el.offsetWidth; el.classList.add('page-enter'); }
    wrapTables();
  });
}
document.querySelectorAll('.nav-item').forEach(el =>
  el.addEventListener('click', () => { navigate(el.dataset.page); closeSidebar(); }));

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function renderDashboard() {
  const [d, tresorData] = await Promise.all([get('/api/stats'), get('/api/tresor')]);
  if (!d) return;
  const { kpis, ventesJ30, cmdParStatut, topProduits, stockParCat, ventesParVendeur, cmdRecentes } = d;
  const tresorBronze = tresorData?.bronze ?? 0;

  $('page-content').innerHTML = `
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
    ${kpi('📦 En stock', kpis.stockCount, `sur ${kpis.stockTotal} référencées`)}
    ${kpi('💰 Valeur stock', bronzeShort(kpis.stockValeur), 'en vente (qté × prix)')}
    ${kpi('📋 Actives', kpis.cmdActives, `sur ${kpis.cmdTotal} total`, kpis.cmdActives > 0 ? 'var(--orange)' : 'var(--green)')}
    ${kpi('📅 Aujourd\'hui', kpis.cmdAujourdhui, 'nouvelle(s) commande(s)')}
    ${kpi('📈 Ventes semaine', bronzeShort(kpis.ventesSemaine), '7 derniers jours')}
    ${kpi('📈 Ventes mois', bronzeShort(kpis.ventesMois), '30 derniers jours')}
  </div>

  <div class="table-wrap" style="margin-bottom:20px;padding:20px 24px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <span style="font-size:20px">🏦</span>
      <span style="font-weight:700;color:var(--gold);font-size:15px">Trésor de la Compagnie</span>
      <span id="tresor-display" style="margin-left:8px;color:var(--text-dim);font-size:13px">${bronzeToDisplay(tresorBronze)}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;max-width:520px">
      <label style="display:flex;flex-direction:column;gap:6px">
        <span style="font-size:12px;color:var(--text-dim);font-weight:600;letter-spacing:.04em">OR</span>
        <div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px">
          <span style="font-size:20px;line-height:1">🟡</span>
          <input id="tresor-or" type="number" min="0" value="${Math.floor(tresorBronze/100)}"
            style="border:none;background:none;padding:0;font-size:18px;font-weight:700;color:var(--gold);width:100%;outline:none">
        </div>
        <span style="font-size:11px;color:var(--text-dim);text-align:center">1 Or = 100🟤</span>
      </label>
      <label style="display:flex;flex-direction:column;gap:6px">
        <span style="font-size:12px;color:var(--text-dim);font-weight:600;letter-spacing:.04em">ARGENT</span>
        <div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px">
          <span style="font-size:20px;line-height:1">⚪</span>
          <input id="tresor-argent" type="number" min="0" value="${Math.floor((tresorBronze%100)/10)}"
            style="border:none;background:none;padding:0;font-size:18px;font-weight:700;color:#e2e8f0;width:100%;outline:none">
        </div>
        <span style="font-size:11px;color:var(--text-dim);text-align:center">1 Argent = 10🟤</span>
      </label>
      <label style="display:flex;flex-direction:column;gap:6px">
        <span style="font-size:12px;color:var(--text-dim);font-weight:600;letter-spacing:.04em">BRONZE</span>
        <div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px">
          <span style="font-size:20px;line-height:1">🟤</span>
          <input id="tresor-bronze" type="number" min="0" value="${tresorBronze%10}"
            style="border:none;background:none;padding:0;font-size:18px;font-weight:700;color:#cd7f32;width:100%;outline:none">
        </div>
        <span style="font-size:11px;color:var(--text-dim);text-align:center">Unité de base</span>
      </label>
    </div>
    <button class="btn btn-sm btn-primary" style="margin-top:14px" onclick="saveTresor()">💾 Sauvegarder & publier sur Discord</button>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:16px">
    <div class="chart-card">
      <div class="chart-header"><span>📈 Revenus des 30 derniers jours</span></div>
      <div class="chart-body"><canvas id="c-ventes"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-header"><span>📋 Commandes par statut</span></div>
      <div class="chart-body"><canvas id="c-statuts"></canvas></div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:16px">
    <div class="chart-card">
      <div class="chart-header"><span>🏆 Top produits (revenus)</span></div>
      <div class="chart-body"><canvas id="c-top"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-header"><span>📦 Valeur du stock par catégorie</span></div>
      <div class="chart-body"><canvas id="c-stock"></canvas></div>
    </div>
  </div>

  ${ventesParVendeur.length ? `
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:16px">
    <div class="chart-card">
      <div class="chart-header"><span>⚓ Ventes par marchand</span></div>
      <div class="chart-body"><canvas id="c-vendeurs"></canvas></div>
    </div>
    <div class="table-wrap" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)">
      <div class="table-toolbar"><h3>🕐 Dernières commandes</h3></div>
      ${recentTable(cmdRecentes)}
    </div>
  </div>` : `
  <div class="table-wrap">
    <div class="table-toolbar"><h3>🕐 Dernières commandes</h3></div>
    ${recentTable(cmdRecentes)}
  </div>`}
  `;

  // Graphique ventes J30
  const labels30 = [];
  const vals30   = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const str = d.toISOString().slice(0, 10);
    labels30.push(str.slice(5));
    const found = ventesJ30.find(r => r.jour === str);
    vals30.push(found ? found.total : 0);
  }
  mkChart('c-ventes', {
    type: 'line',
    data: {
      labels: labels30,
      datasets: [{ label: 'Bronze', data: vals30, borderColor: '#c9a84c', backgroundColor: 'rgba(201,168,76,0.1)', fill: true, tension: 0.4, pointRadius: 3 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, ...CHART_DEFAULTS.plugins }, scales: CHART_DEFAULTS.scales },
  });

  // Donut statuts
  const STAT_LABELS = { en_attente:'⏳ En attente', en_cours:'⚒️ En cours', prete:'📦 Prête', livree:'✅ Livrée', annulee:'❌ Annulée' };
  const STAT_COLORS = { en_attente:'#e3b341', en_cours:'#58a6ff', prete:'#3fb950', livree:'#3fb95060', annulee:'#f8514960' };
  mkChart('c-statuts', {
    type: 'doughnut',
    data: {
      labels: cmdParStatut.map(r => STAT_LABELS[r.statut] ?? r.statut),
      datasets: [{ data: cmdParStatut.map(r => r.n), backgroundColor: cmdParStatut.map(r => STAT_COLORS[r.statut] ?? '#8892a4'), borderWidth: 0 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#8892a4', boxWidth: 14 } } }, cutout: '65%' },
  });

  // Top produits
  mkChart('c-top', {
    type: 'bar',
    data: {
      labels: topProduits.map(r => r.ressource.length > 15 ? r.ressource.slice(0,13)+'…' : r.ressource),
      datasets: [{ label: 'Revenus (bronze)', data: topProduits.map(r => r.revenus), backgroundColor: chartColors(topProduits.length), borderWidth: 0 }],
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: CHART_DEFAULTS.scales.x, y: CHART_DEFAULTS.scales.y } },
  });

  // Stock par catégorie
  mkChart('c-stock', {
    type: 'bar',
    data: {
      labels: stockParCat.map(r => r.categorie.replace(/^[^ ]+ /, '')),
      datasets: [{ label: 'Valeur (bronze)', data: stockParCat.map(r => r.valeur ?? 0), backgroundColor: chartColors(stockParCat.length), borderWidth: 0 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: CHART_DEFAULTS.scales },
  });

  // Ventes par vendeur
  if (ventesParVendeur.length) {
    mkChart('c-vendeurs', {
      type: 'doughnut',
      data: {
        labels: ventesParVendeur.map(r => r.vendeur_pseudo),
        datasets: [{ data: ventesParVendeur.map(r => r.total), backgroundColor: chartColors(ventesParVendeur.length), borderWidth: 0 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#8892a4', boxWidth: 14, font: { size: 11 } } } }, cutout: '55%' },
    });
  }
}

function kpi(label, value, sub, color = 'var(--gold)') {
  return `<div class="stat-card"><div class="label">${label}</div><div class="value" style="color:${color}">${value}</div><div class="sub">${sub}</div></div>`;
}

function recentTable(rows) {
  if (!rows.length) return '<div class="empty"><div class="empty-icon">📭</div><div>Aucune commande</div></div>';
  return `<table><thead><tr><th>#</th><th>Client</th><th>Ressource</th><th>Total</th><th>Vendeur</th><th>Statut</th></tr></thead><tbody>
    ${rows.map(r => `<tr>
      <td><code>#${String(r.id).padStart(4,'0')}</code></td>
      <td><strong>${r.client_pseudo}</strong></td>
      <td>${r.ressource} ×${r.quantite}</td>
      <td>${bronze(r.prix_total)}</td>
      <td style="color:var(--text-dim);font-size:12px">${r.vendeur_pseudo||'—'}</td>
      <td>${statutBadge(r.statut)}</td>
    </tr>`).join('')}
  </tbody></table>`;
}

// ── STOCK ─────────────────────────────────────────────────────────────────────
let stockFilters = { cat:'', q:'', vente:'', prix_min:'', prix_max:'' };

const CAT_COLORS = {
  'Agriculture':'#3fb950','Élevage':'#e3b341','Minerais':'#58a6ff',
  'Construction':'#a371f7','Forge':'#f85149','Cuisine':'#e3b341',
  'Artisan':'#79c0ff','Cuir':'#c9a84c','Bois':'#a371f7','Pêche':'#58a6ff',
};
function catColor(cat) {
  for (const [k, v] of Object.entries(CAT_COLORS)) { if (cat.includes(k)) return v; }
  return '#8892a4';
}

async function renderStock() {
  $('topbar-actions').innerHTML = `<button class="btn btn-primary" onclick="openAddStock()">+ Ajouter</button>`;
  await loadStock();
}

async function loadStock() {
  const params = new URLSearchParams(Object.fromEntries(Object.entries(stockFilters).filter(([,v]) => v !== '')));
  const d = await get(`/api/stock?${params}`);
  if (!d) return;

  const catOptions = d.cats.map(c => `<option value="${c}" ${c===stockFilters.cat?'selected':''}>${c}</option>`).join('');
  const sorted = applySort('stock', d.rows);
  const maxQty = Math.max(...sorted.map(r => r.quantite), 1);

  const cards = sorted.length ? sorted.map(r => {
    const color = catColor(r.categorie);
    const pct = Math.min(100, Math.round((r.quantite / maxQty) * 100));
    const barColor = pct < 15 ? 'var(--red)' : pct < 40 ? 'var(--orange)' : 'var(--green)';
    return `
    <div class="stock-card">
      <div class="stock-card-top">
        <span class="cat-chip" style="color:${color};background:${color}22;border-color:${color}44">${r.categorie}</span>
        <button class="btn btn-sm btn-danger btn-icon" title="Supprimer" onclick="deleteStock(${r.id},'${esc(r.ressource)}')">🗑</button>
      </div>
      <div class="stock-name">${r.ressource}</div>
      <div class="stock-qty-row">
        <span style="font-size:22px;font-weight:700;color:${barColor}">${r.quantite}</span>
        <span class="stock-unit">${r.unite}</span>
        <button class="btn btn-sm btn-primary" style="margin-left:auto;padding:4px 10px;font-size:12px"
          onclick="openStockApprovisionnement(${r.id},'${esc(r.ressource)}',${r.quantite},'${esc(r.unite)}')">＋</button>
      </div>
      <div class="stock-bar-wrap"><div class="stock-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
      <div class="stock-prix-row">
        <span class="editable" contenteditable="true" data-id="${r.id}" data-field="prix_bronze"
          onblur="saveStockField(this)" onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault()}"
        >${r.prix_bronze}</span><span style="color:var(--text-dim)">🟤 / ${r.unite}</span>
        <span style="color:var(--text-dim);font-size:11px">(${bronze(r.prix_bronze)})</span>
      </div>
      <button class="vente-pill ${r.en_vente?'on':'off'}" id="vp-${r.id}"
        onclick="toggleVente(${r.id},${r.en_vente?0:1},this)"
        title="Visible dans /catalogue Discord si activé">
        ${r.en_vente?'🟢 En vente':'🔴 Masqué'}
      </button>
      <div style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:11px;color:var(--text-dim)">
        🔔 Alerte si &lt;
        <span class="editable" contenteditable="true" data-id="${r.id}" data-field="seuil"
          style="min-width:28px;text-align:center;font-size:11px"
          onblur="saveSeuilAlerte(this)" onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault()}"
        >${r.seuil_alerte||0}</span>
        ${r.unite}
      </div>
    </div>`;
  }).join('') : `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">📦</div><div>Aucun résultat</div></div>`;

  $('page-content').innerHTML = `
    <div class="filter-bar">
      <div class="search-box" style="flex:2;min-width:200px">
        <input placeholder="Rechercher une ressource…" value="${stockFilters.q}"
          oninput="stockFilters.q=this.value;clearTimeout(window._st);window._st=setTimeout(loadStock,280)">
      </div>
      <select class="filter-select" onchange="stockFilters.cat=this.value;loadStock()">
        <option value="">Toutes catégories</option>${catOptions}
      </select>
      <select class="filter-select" onchange="stockFilters.vente=this.value;loadStock()">
        <option value="" ${stockFilters.vente===''?'selected':''}>Tout le stock</option>
        <option value="1" ${stockFilters.vente==='1'?'selected':''}>🟢 En vente</option>
        <option value="0" ${stockFilters.vente==='0'?'selected':''}>🔴 Masqué</option>
      </select>
      <input type="number" placeholder="Prix min 🟤" style="width:100px" value="${stockFilters.prix_min}"
        onchange="stockFilters.prix_min=this.value;loadStock()">
      <input type="number" placeholder="Prix max 🟤" style="width:100px" value="${stockFilters.prix_max}"
        onchange="stockFilters.prix_max=this.value;loadStock()">
      <div style="display:flex;gap:6px;margin-left:auto">
        ${th('stock','ressource','','').replace('<th','<button class="btn btn-ghost btn-sm sort-btn"').replace('</th>','</button>').replace('Ressource','↕ Nom')}
        ${th('stock','quantite','','').replace('<th','<button class="btn btn-ghost btn-sm sort-btn"').replace('</th>','</button>').replace('Stock','↕ Stock')}
        ${th('stock','prix_bronze','','').replace('<th','<button class="btn btn-ghost btn-sm sort-btn"').replace('</th>','</button>').replace('Prix/unité 🟤','↕ Prix')}
        <button class="btn btn-ghost btn-sm" onclick="stockFilters={cat:'',q:'',vente:'',prix_min:'',prix_max:''};loadStock()">↺</button>
      </div>
    </div>
    <div style="color:var(--text-dim);font-size:12px;margin:10px 0 14px">${d.rows.length} article${d.rows.length>1?'s':''} — cliquez sur la quantité ou le prix pour modifier</div>
    <div class="stock-grid">${cards}</div>`;
}

function openStockApprovisionnement(id, nom, qteActuelle, unite) {
  // Retire un panneau existant
  document.getElementById('appro-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'appro-panel';
  panel.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999" onclick="document.getElementById('appro-panel').remove()"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:var(--surface);border:1px solid var(--border);border-radius:12px;
      padding:24px 28px;z-index:1000;width:340px;box-shadow:0 24px 64px rgba(0,0,0,.6)">
      <div style="font-weight:700;font-size:16px;color:var(--gold);margin-bottom:4px">📦 ${nom}</div>
      <div style="color:var(--text-dim);font-size:13px;margin-bottom:20px">Stock actuel : <strong style="color:var(--text)">${qteActuelle} ${unite}</strong></div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text-dim)">
          Ajouter au stock
          <div style="display:flex;gap:8px;align-items:center">
            <input id="appro-add" type="number" min="0" step="0.1" placeholder="ex: 64"
              style="flex:1;font-size:18px;font-weight:700;color:var(--green)"
              onkeydown="if(event.key==='Enter')saveAppro(${id},${qteActuelle},'add')">
            <span style="color:var(--text-dim)">${unite}</span>
          </div>
        </label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text-dim)">
          Ou définir le total exact
          <div style="display:flex;gap:8px;align-items:center">
            <input id="appro-set" type="number" min="0" step="0.1" placeholder="${qteActuelle}"
              style="flex:1;font-size:18px;font-weight:700;color:var(--blue)"
              onkeydown="if(event.key==='Enter')saveAppro(${id},${qteActuelle},'set')">
            <span style="color:var(--text-dim)">${unite}</span>
          </div>
        </label>
      </div>
      <div style="display:flex;gap:8px;margin-top:20px">
        <button class="btn btn-primary" style="flex:1" onclick="saveAppro(${id},${qteActuelle},'add')">＋ Ajouter</button>
        <button class="btn btn-primary" style="flex:1;background:var(--blue);border-color:var(--blue)" onclick="saveAppro(${id},${qteActuelle},'set')">✏️ Définir</button>
        <button class="btn btn-ghost" onclick="document.getElementById('appro-panel').remove()">Annuler</button>
      </div>
    </div>`;
  document.body.appendChild(panel);
  document.getElementById('appro-add').focus();
}

async function saveAppro(id, qteActuelle, mode) {
  const addVal = parseFloat(document.getElementById('appro-add')?.value);
  const setVal = parseFloat(document.getElementById('appro-set')?.value);
  const newQty = mode === 'add'
    ? qteActuelle + (isNaN(addVal) ? 0 : addVal)
    : (isNaN(setVal) ? qteActuelle : setVal);
  if (newQty === qteActuelle) { document.getElementById('appro-panel')?.remove(); return; }
  try {
    await put(`/api/stock/${id}`, { quantite: newQty });
    toast(`Stock mis à jour → ${newQty}`);
    document.getElementById('appro-panel')?.remove();
    loadStock();
  } catch (e) { toast(e.message, 'error'); }
}

async function saveStockField(el) {
  const val = parseFloat(el.textContent.trim());
  if (isNaN(val)) return;
  try { await put(`/api/stock/${el.dataset.id}`, { [el.dataset.field]: val }); toast('Mis à jour'); }
  catch (e) { toast(e.message, 'error'); }
}
async function saveSeuilAlerte(el) {
  const seuil = parseInt(el.textContent.trim()) || 0;
  try { await put(`/api/stock/${el.dataset.id}/seuil`, { seuil }); toast('Seuil mis à jour'); }
  catch (e) { toast(e.message, 'error'); }
}
async function toggleVente(id, newVal, btn) {
  // Optimistic UI : on change immédiatement, on annule si erreur
  const prevClass = btn.className;
  const prevText  = btn.textContent;
  btn.className   = `vente-pill ${newVal ? 'on' : 'off'}`;
  btn.textContent = newVal ? '🟢 En vente' : '🔴 Masqué';
  btn.disabled    = true;
  // Met à jour l'onclick pour le prochain clic avec la valeur inversée
  btn.setAttribute('onclick', `toggleVente(${id},${newVal?0:1},this)`);
  try {
    await put(`/api/stock/${id}`, { en_vente: newVal });
    toast('Mis à jour');
  } catch(e) {
    btn.className = prevClass;
    btn.textContent = prevText;
    btn.setAttribute('onclick', `toggleVente(${id},${newVal},this)`);
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}
async function deleteStock(id, nom) {
  confirmDlg(`Supprimer <strong>${nom}</strong> du stock ?`, async () => {
    try { await del(`/api/stock/${id}`); toast(`${nom} supprimé`); loadStock(); } catch (e) { toast(e.message,'error'); }
  });
}

function openAddStock() {
  openModal('Ajouter une ressource', `
    <div class="form-grid">
      <div class="field"><label>Ressource *</label><input id="s-ressource" placeholder="Cuir brut…"></div>
      <div class="field"><label>Catégorie *</label><input id="s-categorie" placeholder="Artisanat & Cuir"></div>
      <div class="field"><label>Unité *</label><input id="s-unite" placeholder="Unité / Tonne"></div>
      <div class="field"><label>Prix bronze *</label><input id="s-prix" type="number" min="1" placeholder="100"></div>
      <div class="field field-full"><label>Stock initial</label><input id="s-qte" type="number" min="0" value="0"></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="submitAddStock()">Ajouter</button>`);
}
async function submitAddStock() {
  const body = { ressource:$('s-ressource').value.trim(), categorie:$('s-categorie').value.trim(), unite:$('s-unite').value.trim(), prix_bronze:parseInt($('s-prix').value), quantite:parseFloat($('s-qte').value)||0 };
  if (!body.ressource||!body.categorie||!body.unite||!body.prix_bronze) return toast('Champs requis manquants','error');
  try { await post('/api/stock',body); toast('Ressource ajoutée'); closeModal(); loadStock(); } catch(e){toast(e.message,'error');}
}

// ── PRIX ──────────────────────────────────────────────────────────────────────
const REGIONS = [
  { col:'prix_pdm',    label:'⚓ PdM'   },
  { col:'prix_rheme',  label:'🛡️ Rhême' },
  { col:'prix_skanor', label:'⚔️ Skanor' },
  { col:'prix_byb',    label:'🏜️ Byb'   },
  { col:'prix_yuhang', label:'🌾 Yuhang' },
];
let prixFilters = { cat:'', q:'' };

async function renderPrix() {
  $('topbar-actions').innerHTML = `<button class="btn btn-primary" onclick="openAddPrix()">+ Ajouter</button>`;
  await loadPrix();
}

async function loadPrix() {
  const params = new URLSearchParams(Object.fromEntries(Object.entries(prixFilters).filter(([,v])=>v)));
  const d = await get(`/api/prix?${params}`);
  if (!d) return;
  const catOptions = d.cats.map(c=>`<option value="${c}" ${c===prixFilters.cat?'selected':''}>${c}</option>`).join('');
  const regionHeaders = REGIONS.map(r=>`<th class="prix-cell sortable${sortStates['prix']?.key===r.col?' sort-active':''}" onclick="setSort('prix','${r.col}','${sortStates['prix']?.key===r.col&&sortStates['prix']?.dir==='asc'?'desc':'asc'}">${r.label} <span class="sort-arrow">${sortStates['prix']?.key===r.col?(sortStates['prix'].dir==='asc'?'▲':'▼'):'⇅'}</span></th>`).join('');
  const sorted_prix = applySort('prix', d.rows);
  const rows = sorted_prix.map(r => {
    const cells = REGIONS.map(reg => {
      const v = r[reg.col];
      return `<td class="prix-cell">
        <span class="editable" contenteditable="true" data-id="${r.id}" data-region="${reg.col}"
          onblur="savePrixCell(this)" onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault()}"
        >${v??''}</span>${v===null?'<div class="prix-inconnu">inconnu</div>':''}
      </td>`;
    }).join('');
    return `<tr><td><strong>${r.produit}</strong></td><td style="color:var(--text-dim)">${r.unite_base}</td><td style="color:var(--text-dim);font-size:12px">${r.categorie}</td>${cells}
      <td><div class="actions"><button class="btn btn-sm btn-danger btn-icon" onclick="deletePrix(${r.id},'${esc(r.produit)}')">🗑</button></div></td></tr>`;
  }).join('');

  $('page-content').innerHTML = `
    <div class="filter-bar">
      <div class="search-box" style="flex:2;min-width:200px">
        <input placeholder="Rechercher un produit…" value="${prixFilters.q}"
          oninput="prixFilters.q=this.value;clearTimeout(window._pt);window._pt=setTimeout(loadPrix,280)">
      </div>
      <select class="filter-select" onchange="prixFilters.cat=this.value;loadPrix()">
        <option value="">Toutes catégories</option>${catOptions}
      </select>
      <button class="btn btn-ghost btn-sm" onclick="prixFilters={cat:'',q:''};loadPrix()">↺ Reset</button>
    </div>
    <p style="color:var(--text-dim);font-size:12px;margin:10px 0">💡 Cliquez sur une cellule pour modifier. Vide = inconnu.</p>
    <div class="table-wrap">
      <div class="table-toolbar">
        <h3>💰 Prix comparatifs</h3>
        <span style="color:var(--text-dim);font-size:12px">${d.rows.length} produit${d.rows.length>1?'s':''}</span>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            ${th('prix','produit','Produit')}
            ${th('prix','unite_base','Unité')}
            ${th('prix','categorie','Catégorie')}
            ${regionHeaders}<th></th>
          </tr></thead>
          <tbody>${rows||'<tr><td colspan="9"><div class="empty"><div class="empty-icon">💰</div><div>Aucun résultat</div></div></td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

async function savePrixCell(el) {
  const raw = el.textContent.trim(), prix = raw===''?null:parseInt(raw);
  if (raw!==''&&isNaN(prix)){el.textContent='';return;}
  try { await put(`/api/prix/${el.dataset.id}`,{region:el.dataset.region,prix}); toast('Prix mis à jour'); }
  catch(e){toast(e.message,'error');}
}
async function deletePrix(id,nom) {
  confirmDlg(`Supprimer <strong>${nom}</strong> du tableau ?`, async()=>{
    try{await del(`/api/prix/${id}`);toast(`${nom} supprimé`);loadPrix();}catch(e){toast(e.message,'error');}
  });
}
const CATS_PRIX = ['🌾 Agriculture','🐄 Élevage & Chasse','⛏️ Minerais','🪵 Construction','⚔️ Forge & Armement'];
function openAddPrix(){
  openModal('Ajouter un produit',`
    <div class="form-grid">
      <div class="field field-full"><label>Produit *</label><input id="p-produit" placeholder="Cuir…"></div>
      <div class="field"><label>Catégorie *</label><select id="p-categorie">${CATS_PRIX.map(c=>`<option>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Unité *</label><select id="p-unite"><option value="1 Unité">1 Unité</option><option value="1 Tonne">1 Tonne</option></select></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="submitAddPrix()">Ajouter</button>`);
}
async function submitAddPrix(){
  const body={produit:$('p-produit').value.trim(),categorie:$('p-categorie').value,unite_base:$('p-unite').value};
  if(!body.produit)return toast('Nom requis','error');
  try{await post('/api/prix',body);toast('Produit ajouté');closeModal();loadPrix();}catch(e){toast(e.message,'error');}
}

// ── COMMANDES ────────────────────────────────────────────────────────────────
let cmdFiltre = 'actives', cmdSearch = '', cmdPage = 1;
const CMD_LIMIT = 50;

async function renderCommandes(){
  $('topbar-actions').innerHTML = `
    <a class="btn btn-ghost btn-sm" href="/api/commandes/export.csv" download>⬇ Export CSV</a>
    <button class="btn btn-primary" onclick="openNewCommande()">+ Nouvelle commande</button>`;
  cmdPage = 1;
  await loadCommandes();
}

async function loadCommandes(){
  const params = new URLSearchParams({ statut: cmdFiltre, page: cmdPage, limit: CMD_LIMIT });
  if (cmdSearch) params.set('q', cmdSearch);
  const d = await get(`/api/commandes?${params}`);
  if (!d) return;
  const { rows, total, pages } = d;

  const STATUTS = [
    {value:'actives',label:'🔄 Actives'},{value:'all',label:'📜 Toutes'},
    {value:'en_attente',label:'⏳ En attente'},{value:'en_cours',label:'⚒️ En cours'},
    {value:'prete',label:'📦 Prêtes'},{value:'livree',label:'✅ Livrées'},{value:'annulee',label:'❌ Annulées'},
  ];
  const tabs = STATUTS.map(s=>`<button class="btn btn-sm ${s.value===cmdFiltre?'btn-primary':'btn-ghost'}" onclick="cmdFiltre='${s.value}';cmdPage=1;loadCommandes()">${s.label}</button>`).join('');

  // Pagination controls
  const pageInfo = pages > 1 ? `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="cmdPage=${Math.max(1,cmdPage-1)};loadCommandes()" ${cmdPage<=1?'disabled':''}>← Préc.</button>
      <span style="color:var(--text-dim);font-size:12px">Page ${cmdPage} / ${pages}</span>
      <button class="btn btn-ghost btn-sm" onclick="cmdPage=${Math.min(pages,cmdPage+1)};loadCommandes()" ${cmdPage>=pages?'disabled':''}>Suiv. →</button>
    </div>` : '';

  $('page-content').innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${tabs}</div>
    <div class="filter-bar" style="margin-bottom:14px">
      <div class="search-box" style="flex:1;min-width:220px">
        <input placeholder="Rechercher client, ressource…" value="${cmdSearch}"
          oninput="cmdSearch=this.value;cmdPage=1;clearTimeout(window._ct);window._ct=setTimeout(loadCommandes,280)">
      </div>
      <span style="color:var(--text-dim);font-size:12px;align-self:center">${total} commande${total>1?'s':''}</span>
      ${pageInfo}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${th('commandes','id','#')}
          ${th('commandes','client_pseudo','Client')}
          ${th('commandes','vendeur_pseudo','Vendeur')}
          ${th('commandes','ressource','Ressource')}
          ${th('commandes','quantite','Qté')}
          ${th('commandes','prix_total','Total')}
          ${th('commandes','creee_le','Date')}
          ${th('commandes','statut','Statut')}
          <th>Actions</th>
        </tr></thead>
        <tbody>${rows.length ? rows.map(r=>`
          <tr data-cmd-id="${r.id}">
            <td><code>#${String(r.id).padStart(4,'0')}</code></td>
            <td>
              <strong>${r.client_pseudo}</strong>
              ${r.client_id && r.client_id!=='0' ? `<button class="btn btn-sm btn-ghost" style="font-size:10px;padding:2px 6px;margin-left:4px" title="Réputation client" onclick="openClientReputation('${r.client_id}','${esc(r.client_pseudo)}')">★</button>` : ''}
            </td>
            <td style="color:var(--text-dim);font-size:12px">${r.vendeur_pseudo||'—'}</td>
            <td>${r.ressource}</td>
            <td>${r.quantite} ${r.unite}</td>
            <td>${bronze(r.prix_total)}</td>
            <td style="font-size:12px;color:var(--text-dim)">${(r.creee_le||'').slice(0,10)}</td>
            <td>${statutBadge(r.statut)}</td>
            <td>
              <div class="actions" style="opacity:1;gap:4px;flex-wrap:wrap">
                ${r.statut!=='en_cours'?`<button class="btn btn-sm btn-ghost" title="En cours" onclick="setCmd(${r.id},'en_cours')">⚒️</button>`:''}
                ${r.statut!=='prete'   ?`<button class="btn btn-sm btn-success" title="Prête" onclick="setCmd(${r.id},'prete')">📦</button>`:''}
                ${r.statut!=='livree'  ?`<button class="btn btn-sm btn-success" title="Livrée" onclick="setCmd(${r.id},'livree')">✅</button>`:''}
                ${r.statut!=='annulee' ?`<button class="btn btn-sm btn-danger" title="Annuler" onclick="setCmd(${r.id},'annulee')">❌</button>`:''}
                ${r.ticket_id?`<a class="btn btn-sm btn-ghost" style="font-size:11px" href="https://discord.com/channels/${GUILD_ID}/${r.ticket_id}" target="_blank">🎫</a>`:''}
              </div>
            </td>
          </tr>`).join('') : '<tr><td colspan="9"><div class="empty"><div class="empty-icon">📭</div><div>Aucune commande</div></div></td></tr>'}
        </tbody>
      </table>
    </div>
    ${pages > 1 ? `<div style="display:flex;justify-content:center;padding:16px">${pageInfo}</div>` : ''}`;
}

async function setCmd(id, statut){
  try{await put(`/api/commandes/${id}/statut`,{statut});toast('Statut mis à jour');loadCommandes();}catch(e){toast(e.message,'error');}
}

let stockCache = [];
async function openNewCommande(){
  if (!stockCache.length) stockCache = await get('/api/stock/search?q=') || [];
  const ressourceOptions = stockCache.map(r=>`<option value="${r.ressource}" data-prix="${r.prix_bronze}" data-unite="${r.unite}">${r.ressource} (${r.prix_bronze}🟤/${r.unite})</option>`).join('');

  openModal('Nouvelle commande',`
    <div class="form-grid">
      <div class="field"><label>Client (pseudo RP) *</label><input id="nc-client" placeholder="Björn le Tanneur…"></div>
      <div class="field"><label>Discord ID client</label><input id="nc-discord" placeholder="123456789012345678" type="number"></div>
      <div class="field field-full"><label>Ressource *</label>
        <select id="nc-ressource" onchange="updatePrixAuto()">
          <option value="">-- Choisir --</option>
          ${ressourceOptions}
          <option value="__autre__">Autre (saisie libre)</option>
        </select>
      </div>
      <div id="nc-ressource-libre-wrap" class="field field-full" style="display:none">
        <label>Ressource (libre)</label><input id="nc-ressource-libre" placeholder="Nom de la ressource…">
      </div>
      <div class="field"><label>Quantité *</label><input id="nc-qte" type="number" min="0.1" step="0.1" value="1" oninput="updatePrixAuto()"></div>
      <div class="field"><label>Unité</label>
        <select id="nc-unite"><option value="Unité">Unité</option><option value="Tonne">Tonne</option></select>
      </div>
      <div class="field"><label>Prix total (bronze)</label><input id="nc-prix" type="number" min="0" placeholder="Auto depuis stock"></div>
      <div class="field field-full"><label>Note</label><input id="nc-note" placeholder="Instructions spéciales…"></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="submitNewCommande()">✅ Créer + Ticket Discord</button>`);
}

function updatePrixAuto(){
  const sel = $('nc-ressource');
  const opt = sel.options[sel.selectedIndex];
  const libre = sel.value === '__autre__';
  $('nc-ressource-libre-wrap').style.display = libre ? 'block' : 'none';
  if (libre) return;
  const prix = parseInt(opt?.dataset.prix || 0);
  const qte  = parseFloat($('nc-qte')?.value || 1);
  if (prix && qte) $('nc-prix').value = Math.round(prix * qte);
}

async function submitNewCommande(){
  const sel = $('nc-ressource');
  const ressource = sel.value === '__autre__' ? $('nc-ressource-libre').value.trim() : sel.value;
  const body = {
    client_pseudo: $('nc-client').value.trim(),
    client_id:     $('nc-discord').value.trim() || undefined,
    ressource,
    quantite:  parseFloat($('nc-qte').value),
    unite:     $('nc-unite').value,
    prix_total: parseInt($('nc-prix').value) || 0,
    note:      $('nc-note').value.trim(),
  };
  if (!body.client_pseudo||!body.ressource||!body.quantite) return toast('Champs requis manquants','error');
  try {
    const r = await post('/api/commandes',body);
    toast(`Commande #${String(r.id).padStart(4,'0')} créée${r.ticket_id?' + ticket Discord':''}`);
    closeModal();
    loadCommandes();
  } catch(e){toast(e.message,'error');}
}

// ── CLIENT RÉPUTATION ─────────────────────────────────────────────────────────
async function openClientReputation(clientId, pseudo) {
  const data = await get(`/api/clients/${clientId}/inventaire`);
  if (!data) return;
  const rep = data.reputation;
  const moy = rep?.moyenne ?? null;
  const starsHtml = (n) => [1,2,3,4,5].map(i=>`<span style="color:${i<=n?'#e3b341':'#2a3047'}">★</span>`).join('');
  const notesRows = data.commandes.slice(0,5).map(c=>`
    <tr>
      <td><code>#${String(c.id).padStart(4,'0')}</code></td>
      <td>${c.ressource}</td>
      <td>${c.quantite} ${c.unite}</td>
      <td>${bronze(c.prix_total)}</td>
      <td>${statutBadge(c.statut)}</td>
    </tr>`).join('');

  openModal(`★ Réputation — ${pseudo}`, `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding:16px;background:var(--surface2);border-radius:8px">
      <div style="font-size:36px">${moy ? starsHtml(Math.round(moy)) : '★★★☆☆'}</div>
      <div>
        <div style="font-size:22px;font-weight:800;color:var(--gold)">${moy ?? '—'} / 5</div>
        <div style="font-size:12px;color:var(--text-dim)">${rep?.total ?? 0} évaluation${(rep?.total??0)>1?'s':''}</div>
      </div>
    </div>
    <h4 style="font-size:13px;font-weight:700;margin-bottom:10px">Ajouter une évaluation</h4>
    <div style="display:flex;gap:6px;margin-bottom:10px" id="star-selector">
      ${[1,2,3,4,5].map(i=>`<button class="star-btn" data-v="${i}" onclick="selectStar(${i})" style="color:${i<=3?'#e3b341':'#2a3047'}">★</button>`).join('')}
    </div>
    <input id="rep-comment" placeholder="Commentaire (optionnel)…" style="width:100%;margin-bottom:16px">
    <h4 style="font-size:13px;font-weight:700;margin-bottom:8px">Dernières commandes</h4>
    <div style="overflow-x:auto;max-height:200px;overflow-y:auto">
      <table style="width:100%"><thead><tr>
        <th style="font-size:11px">#</th><th style="font-size:11px">Ressource</th>
        <th style="font-size:11px">Qté</th><th style="font-size:11px">Total</th><th style="font-size:11px">Statut</th>
      </tr></thead><tbody>${notesRows||'<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:12px">Aucune commande</td></tr>'}</tbody></table>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Fermer</button>
     <button class="btn btn-primary" onclick="submitReputation('${clientId}','${esc(pseudo)}')">Enregistrer l'évaluation</button>`
  );
  window._repStars = 3;
}

let _repStars = 3;
function selectStar(n) {
  _repStars = n;
  document.querySelectorAll('#star-selector .star-btn').forEach(b => {
    b.style.color = parseInt(b.dataset.v) <= n ? '#e3b341' : '#2a3047';
  });
}

async function submitReputation(clientId, pseudo) {
  const comment = $('rep-comment')?.value.trim() || '';
  try {
    await post(`/api/clients/${clientId}/notes`, { note: _repStars, commentaire: comment, pseudo });
    toast('Évaluation enregistrée');
    closeModal();
  } catch(e) { toast(e.message, 'error'); }
}

// ── OFFRES DE VENTE ───────────────────────────────────────────────────────────
let offresFiltre = 'en_attente';
async function renderOffres() {
  $('topbar-actions').innerHTML = '';
  await loadOffres();
}

async function loadOffres() {
  const params = offresFiltre === 'all' ? '' : `?statut=${offresFiltre}`;
  const rows = await get(`/api/offres_vente${params}`);
  if (!rows) return;

  const TABS = [
    { v:'en_attente', l:'⏳ En attente' },
    { v:'accepte',    l:'✅ Acceptées' },
    { v:'refuse',     l:'❌ Refusées' },
    { v:'all',        l:'📜 Toutes' },
  ];
  const tabs = TABS.map(t=>`<button class="btn btn-sm ${t.v===offresFiltre?'btn-primary':'btn-ghost'}" onclick="offresFiltre='${t.v}';loadOffres()">${t.l}</button>`).join('');

  const badgeOffre = (s) => {
    const m = { en_attente:['badge-offre-attente','⏳ En attente'], accepte:['badge-offre-accepte','✅ Acceptée'], refuse:['badge-offre-refuse','❌ Refusée'] };
    const [cls, label] = m[s] ?? ['badge-attente', s];
    return `<span class="badge ${cls}">${label}</span>`;
  };

  const sorted = applySort('offres', rows);
  $('page-content').innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">${tabs}</div>
    <div class="table-wrap">
      <div class="table-toolbar">
        <h3>🛒 Offres de vente</h3>
        <span style="color:var(--text-dim);font-size:12px">${rows.length} offre${rows.length>1?'s':''}</span>
      </div>
      <table>
        <thead><tr>
          ${th('offres','id','#')}
          ${th('offres','vendeur_pseudo','Vendeur')}
          ${th('offres','ressource','Ressource')}
          ${th('offres','quantite','Quantité')}
          ${th('offres','prix_demande','Prix demandé')}
          <th>Note</th>
          ${th('offres','creee_le','Date')}
          ${th('offres','statut','Statut')}
          <th>Actions</th>
        </tr></thead>
        <tbody>${sorted.length ? sorted.map(o=>`
          <tr>
            <td><code>#${String(o.id).padStart(4,'0')}</code></td>
            <td><strong>${o.vendeur_pseudo}</strong></td>
            <td>${o.ressource}</td>
            <td>${o.quantite} ${o.unite||'Unité'}</td>
            <td>${o.prix_demande ? bronze(o.prix_demande) : '<span style="color:var(--text-dim)">à négocier</span>'}</td>
            <td style="font-size:12px;color:var(--text-dim);max-width:200px">${o.note||'—'}</td>
            <td style="font-size:12px;color:var(--text-dim)">${(o.creee_le||'').slice(0,10)}</td>
            <td>${badgeOffre(o.statut)}</td>
            <td>
              <div class="actions" style="opacity:1;gap:4px">
                ${o.statut==='en_attente'?`
                  <button class="btn btn-sm btn-success" title="Accepter" onclick="setOffre(${o.id},'accepte')">✅ Accepter</button>
                  <button class="btn btn-sm btn-danger" title="Refuser" onclick="setOffre(${o.id},'refuse')">❌ Refuser</button>
                `:''}
              </div>
            </td>
          </tr>`).join('') : `<tr><td colspan="9"><div class="empty"><div class="empty-icon">🛒</div><div>Aucune offre</div></div></td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function setOffre(id, statut) {
  try {
    await put(`/api/offres_vente/${id}/statut`, { statut });
    toast(statut === 'accepte' ? 'Offre acceptée' : 'Offre refusée');
    loadOffres();
  } catch(e) { toast(e.message, 'error'); }
}

// ── TRÉSORERIE ────────────────────────────────────────────────────────────────
async function renderTresorerie() {
  $('topbar-actions').innerHTML = '';
  const [tresorData, history] = await Promise.all([get('/api/tresor'), get('/api/tresorerie/history')]);
  if (!tresorData) return;

  const solde = tresorData.bronze;
  const or = Math.floor(solde/100), ag = Math.floor((solde%100)/10), br = solde%10;

  // Build chart data (last 30 entries reversed to be chronological)
  const chartData = [...history].reverse().slice(0, 30);
  const labels = chartData.map(h => (h.creee_le||'').slice(0,10));
  const values = chartData.map(h => h.solde_apres);

  const histRows = history.slice(0, 50).map(h => {
    const cls = h.montant > 0 ? 'history-row-positive' : h.montant < 0 ? 'history-row-negative' : '';
    const sign = h.montant > 0 ? '+' : '';
    return `<tr>
      <td class="${cls}" style="font-weight:600">${sign}${bronze(h.montant)}</td>
      <td>${bronze(h.solde_apres)}</td>
      <td style="font-size:12px;max-width:240px">${h.motif||'—'}</td>
      <td style="font-size:12px;color:var(--text-dim)">${h.auteur||'—'}</td>
      <td style="font-size:12px;color:var(--text-dim)">${(h.creee_le||'').slice(0,16)}</td>
    </tr>`;
  }).join('');

  $('page-content').innerHTML = `
    <div class="tresor-hero">
      <div>
        <div class="tresor-hero-sub">Solde actuel de la Compagnie</div>
        <div class="tresor-hero-amount">${bronze(solde)}</div>
        <div class="tresor-hero-sub" style="margin-top:6px">${or} Or · ${ag} Argent · ${br} Bronze</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-ghost" onclick="openMouvementForm()">± Enregistrer un mouvement</button>
        <button class="btn btn-ghost" onclick="openSetTresor()">✏️ Définir solde exact</button>
      </div>
    </div>

    <div class="chart-card" style="margin-bottom:24px">
      <div class="chart-header">📈 Évolution du solde (50 derniers mouvements)</div>
      <div class="chart-body"><canvas id="tresor-chart"></canvas></div>
    </div>

    <div class="table-wrap">
      <div class="table-toolbar">
        <h3>📜 Historique des mouvements</h3>
        <span style="color:var(--text-dim);font-size:12px">${history.length} entrée${history.length>1?'s':''}</span>
      </div>
      <table>
        <thead><tr>
          <th>Mouvement</th><th>Solde après</th><th>Motif</th><th>Auteur</th><th>Date</th>
        </tr></thead>
        <tbody>${histRows || '<tr><td colspan="5"><div class="empty"><div class="empty-icon">📜</div><div>Aucun mouvement enregistré</div></div></td></tr>'}</tbody>
      </table>
    </div>`;

  // Chart
  if (chartData.length > 1) {
    mkChart('tresor-chart', {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Solde (bronze)',
          data: values,
          borderColor: '#c9a84c',
          backgroundColor: 'rgba(201,168,76,.12)',
          tension: 0.3,
          fill: true,
          pointBackgroundColor: '#c9a84c',
          pointRadius: 4,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: { legend: { display: false } },
        scales: {
          x: { ...CHART_DEFAULTS.scales.x, ticks: { ...CHART_DEFAULTS.scales.x.ticks, maxTicksLimit: 8 } },
          y: { ...CHART_DEFAULTS.scales.y, beginAtZero: false },
        },
      },
    });
  }
}

function openMouvementForm() {
  openModal('± Enregistrer un mouvement', `
    <div class="form-grid full">
      <div class="field">
        <label>Type</label>
        <select id="mv-type">
          <option value="1">➕ Entrée (revenus, don…)</option>
          <option value="-1">➖ Dépense (achat, frais…)</option>
        </select>
      </div>
      <div class="field">
        <label>Montant (bronze)</label>
        <input id="mv-montant" type="number" min="1" placeholder="ex: 50">
      </div>
      <div class="field field-full">
        <label>Motif</label>
        <input id="mv-motif" placeholder="Vente de bois, achat de minerais…">
      </div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="submitMouvement()">Enregistrer</button>`
  );
}

async function submitMouvement() {
  const type   = parseInt($('mv-type').value);
  const montant = parseInt($('mv-montant')?.value);
  const motif  = $('mv-motif')?.value.trim();
  if (!montant || montant <= 0) return toast('Montant invalide', 'error');
  try {
    await post('/api/tresorerie/mouvement', { delta: type * montant, motif });
    toast(type > 0 ? `+${bronze(montant)} ajouté` : `-${bronze(montant)} déduit`);
    closeModal();
    renderTresorerie();
  } catch(e) { toast(e.message, 'error'); }
}

function openSetTresor() {
  openModal('Définir le solde exact', `
    <p style="color:var(--text-dim);font-size:13px;margin-bottom:16px;line-height:1.7">Saisissez le nouveau solde exact. Un mouvement d'ajustement sera enregistré automatiquement.</p>
    <div class="form-grid">
      <div class="field"><label>Or 🟡</label><input id="ts-or" type="number" min="0" placeholder="0"></div>
      <div class="field"><label>Argent ⚪</label><input id="ts-argent" type="number" min="0" placeholder="0"></div>
      <div class="field"><label>Bronze 🟤</label><input id="ts-bronze" type="number" min="0" placeholder="0"></div>
      <div class="field field-full"><label>Motif</label><input id="ts-motif" placeholder="Recomptage, ajustement…"></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="submitSetTresor()">Mettre à jour</button>`
  );
}

async function submitSetTresor() {
  const or = parseInt($('ts-or')?.value)||0;
  const ag = parseInt($('ts-argent')?.value)||0;
  const br = parseInt($('ts-bronze')?.value)||0;
  const total = or*100 + ag*10 + br;
  const motif = $('ts-motif')?.value.trim();
  try {
    await put('/api/tresor', { bronze: total, motif: motif||'Ajustement manuel' });
    toast('Trésorerie mise à jour');
    closeModal();
    renderTresorerie();
  } catch(e) { toast(e.message, 'error'); }
}

// ── RECETTES ──────────────────────────────────────────────────────────────────
let recFilters = { group:'', niveau:'', q:'' };
async function renderRecettes(){
  $('topbar-actions').innerHTML = `
    <button class="btn btn-ghost" onclick="openMatPrix()" title="Gérer les prix des ingrédients bruts">⚙️ Prix ingrédients</button>
    <button class="btn btn-primary" onclick="openAddRecette()">+ Ajouter</button>`;
  await loadRecettes();
}

function recetteCout(r) {
  if (!r.prix_theorique) return '<span style="color:var(--text-dim)">—</span>';
  const c = `${r.prix_theorique}🟤`;
  if (!r.prix_theorique_complet) return `<span style="color:var(--orange)" title="Certains ingrédients sans prix">~${c}</span>`;
  return `<span style="color:var(--blue)">${c}</span>`;
}

function recetteMarge(r) {
  if (!r.prix_reel) return '<span style="color:var(--text-dim)">—</span>';
  const label = `${r.prix_reel}🟤`;
  if (!r.prix_theorique) return `<span style="color:var(--text-dim)">${label}</span>`;
  const marge = r.prix_reel - r.prix_theorique;
  const pct = Math.round((marge / r.prix_theorique) * 100);
  const color = marge >= 0 ? 'var(--green)' : 'var(--red)';
  const sign = marge >= 0 ? '+' : '';
  return `<span style="color:var(--text-dim)">${label}</span> <span style="color:${color};font-size:11px">${sign}${pct}%</span>`;
}

async function loadRecettes(){
  const params = new URLSearchParams(Object.fromEntries(Object.entries(recFilters).filter(([,v])=>v)));
  const d = await get(`/api/recettes?${params}`);
  if (!d) return;

  const groupOptions = d.groups.map(g=>`<option value="${g}" ${g===recFilters.group?'selected':''}>${g}</option>`).join('');
  $('page-content').innerHTML = `
    <div class="filter-bar">
      <div class="search-box" style="flex:2;min-width:200px">
        <input placeholder="Rechercher un objet…" value="${recFilters.q}"
          oninput="recFilters.q=this.value;clearTimeout(window._rt);window._rt=setTimeout(loadRecettes,280)">
      </div>
      <select class="filter-select" onchange="recFilters.group=this.value;loadRecettes()">
        <option value="">Toutes les professions</option>${groupOptions}
      </select>
      <input type="number" min="1" max="20" placeholder="Niveau…" style="width:90px" value="${recFilters.niveau}"
        onchange="recFilters.niveau=this.value;loadRecettes()">
      <button class="btn btn-ghost btn-sm" onclick="recFilters={group:'',niveau:'',q:''};loadRecettes()">↺ Reset</button>
    </div>
    <div class="table-wrap" style="margin-top:12px">
      <div class="table-toolbar">
        <h3>📖 Recettes</h3>
        <span style="color:var(--text-dim);font-size:12px">${d.rows.length} recette${d.rows.length>1?'s':''}</span>
      </div>
      <table>
        <thead><tr>
          ${th('recettes','id','ID')}
          ${th('recettes','objet','Objet')}
          ${th('recettes','profession','Profession')}
          ${th('recettes','niveau','Niv.')}
          <th>Ingrédients</th>
          ${th('recettes','prix_theorique','💰 Coût prod.')}
          ${th('recettes','prix_reel','🏷️ Prix vente')}
          <th></th>
        </tr></thead>
        <tbody>${(()=>{
          const sorted = applySort('recettes', d.rows);
          if (!sorted.length) return '<tr><td colspan="8"><div class="empty"><div class="empty-icon">📖</div><div>Aucun résultat</div></div></td></tr>';
          return sorted.map(r => {
            const mats = [];
            for (let i = 1; i <= 5; i++) if (r[`mat${i}`]) {
              const fr = r[`mat${i}_fr`] || r[`mat${i}`];
              const p  = r[`mat${i}_prix`];
              const total = p != null ? ` <span style="color:var(--text-dim);font-size:10px">(${r[`qte${i}`]*p}🟤)</span>` : ' <span style="color:var(--red);font-size:10px">(?)</span>';
              mats.push(`${r[`qte${i}`]}× ${fr}${total}`);
            }
            return `<tr>
              <td><code style="color:var(--text-dim);font-size:11px">#${r.id}</code></td>
              <td><strong>${r.objet}</strong>${r.qte_produit>1?` <span style="color:var(--gold)">×${r.qte_produit}</span>`:''}</td>
              <td style="color:var(--text-dim);font-size:12px">${r.profession}</td>
              <td style="text-align:center"><span class="badge badge-attente" style="font-size:11px">Niv.${r.niveau}</span></td>
              <td class="ingredients">${mats.join('<br>')||'<span style="color:var(--text-dim)">—</span>'}</td>
              <td style="text-align:right;white-space:nowrap">${recetteCout(r)}</td>
              <td style="text-align:right;white-space:nowrap">${recetteMarge(r)}</td>
              <td><div class="actions">
                <button class="btn btn-sm btn-ghost btn-icon" onclick="openEditRecette(${r.id})">✏️</button>
                <button class="btn btn-sm btn-danger btn-icon" onclick="deleteRecette(${r.id},'${esc(r.objet)}')">🗑</button>
              </div></td>
            </tr>`;
          }).join('');
        })()}
        </tbody>
      </table>
    </div>
    <p style="color:var(--text-dim);font-size:11px;margin-top:8px">💡 <strong style="color:var(--blue)">Coût prod.</strong> = prix cumulé des ingrédients · <strong style="color:var(--text-dim)">Prix vente</strong> = votre prix dans le stock · % = marge brute. Configurez les prix ingrédients via ⚙️.</p>`;
}

async function openMatPrix() {
  const rows = await get('/api/mat-prix');
  const allMats = await get('/api/recettes?q=');
  if (!rows || !allMats) return;
  // Collect unique mats from all recettes
  const matSet = new Set();
  allMats.rows.forEach(r => { for (let i=1;i<=5;i++) if (r[`mat${i}`]) matSet.add(r[`mat${i}`]); });
  const overrides = Object.fromEntries(rows.map(r => [r.mat_id, r.prix_bronze]));
  const matList = [...matSet].sort();
  openModal('⚙️ Prix des ingrédients bruts',
    `<p style="color:var(--text-dim);font-size:12px;margin-bottom:14px">Définissez le prix d'achat en bronze de chaque matière première. Les IDs Minecraft déjà reconnus utilisent automatiquement le prix du stock.</p>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto">
    ${matList.map(mat => `
      <div style="display:flex;align-items:center;gap:10px">
        <code style="flex:1;font-size:12px;color:var(--text-dim)">${mat}</code>
        <input id="mp-${mat}" type="number" min="0" placeholder="auto"
          style="width:90px" value="${overrides[mat]??''}"
          onchange="saveMatPrix('${mat}',this.value)">
        <span style="font-size:11px;color:var(--text-dim)">🟤</span>
      </div>`).join('')}
    </div>`,
    `<button class="btn btn-primary" onclick="closeModal();loadRecettes()">Fermer & actualiser</button>`);
}

async function saveMatPrix(matId, val) {
  try {
    await put(`/api/mat-prix/${encodeURIComponent(matId)}`, { prix: val === '' ? null : parseInt(val) });
  } catch(e) { toast(e.message, 'error'); }
}

function recetteForm(r={}){
  const PROFS=['⚒️ Forge','🔨 Artisan','🪵 Charpentier','🪡 Tannerie','⚔️ Forge de Guerre','⚗️ Apothicaire','🍺 Brasserie','🎉 Festin','🔧 Outils Spéciaux','🪡 Tannerie Large','🍳 Cuisine','🪡 Tannerie Excellence','🏰 Architecture de Guerre','⚓ Construction Navale','🔐 Serrurerie'];
  return `<div class="form-grid">
    <div class="field field-full"><label>Objet *</label><input id="r-objet" value="${r.objet||''}"></div>
    <div class="field"><label>Profession *</label>
      <select id="r-profession">${PROFS.map(p=>`<option ${p===r.profession?'selected':''}>${p}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Niveau *</label><input id="r-niveau" type="number" min="1" max="20" value="${r.niveau||1}"></div>
    <div class="field"><label>Qté produite</label><input id="r-qteprod" type="number" min="1" value="${r.qte_produit||1}"></div>
    <hr class="form-sep">
    ${[1,2,3,4,5].map(i=>`
      <div class="field"><label>Mat. ${i}</label><input id="r-mat${i}" placeholder="iron_ingot…" value="${r[`mat${i}`]||''}"></div>
      <div class="field"><label>Qté ${i}</label><input id="r-qte${i}" type="number" min="1" value="${r[`qte${i}`]||''}"></div>
    `).join('<hr class="form-sep">')}
  </div>`;
}

function recetteBody(){
  return {
    profession:$('r-profession').value, niveau:parseInt($('r-niveau').value)||1,
    objet:$('r-objet').value.trim(), qte_produit:parseInt($('r-qteprod').value)||1,
    ...[1,2,3,4,5].reduce((a,i)=>({...a,[`mat${i}`]:$(`r-mat${i}`).value.trim()||null,[`qte${i}`]:parseInt($(`r-qte${i}`).value)||null}),{}),
  };
}

function openAddRecette(){
  openModal('Ajouter une recette',recetteForm(),
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="submitAddRecette()">Ajouter</button>`);
}
async function submitAddRecette(){
  const body=recetteBody();
  if(!body.objet)return toast('Nom requis','error');
  try{await post('/api/recettes',body);toast('Recette ajoutée');closeModal();loadRecettes();}catch(e){toast(e.message,'error');}
}

let _recCache=null;
async function openEditRecette(id){
  if(!_recCache||!_recCache.rows){_recCache=await get('/api/recettes?q=');if(!_recCache)return;}
  const r=_recCache.rows.find(x=>x.id===id);
  if(!r)return;
  openModal(`Modifier — ${r.objet}`,recetteForm(r),
    `<button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
     <button class="btn btn-primary" onclick="submitEditRecette(${id})">Enregistrer</button>`);
}
async function submitEditRecette(id){
  try{await put(`/api/recettes/${id}`,recetteBody());toast('Recette modifiée');closeModal();_recCache=null;loadRecettes();}catch(e){toast(e.message,'error');}
}
async function deleteRecette(id,nom){
  confirmDlg(`Supprimer la recette <strong>${nom}</strong> ?`,async()=>{
    try{await del(`/api/recettes/${id}`);toast(`${nom} supprimée`);_recCache=null;loadRecettes();}catch(e){toast(e.message,'error');}
  });
}

// ── IA ────────────────────────────────────────────────────────────────────────
async function renderIA() {
  $('topbar-actions').innerHTML =
    `<button class="btn btn-ghost" onclick="loadIAPrompt()">↺ Actualiser le preview</button>`;
  await loadIAPrompt();
}

async function loadIAPrompt() {
  const data = await get('/api/ia/prompt');
  if (!data) return;

  $('page-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">

      <div class="table-wrap" style="padding:20px 24px">
        <h3 style="margin:0 0 4px">✏️ Pré-prompt de base</h3>
        <p style="color:var(--text-dim);font-size:12px;margin:0 0 14px;line-height:1.6">
          Instructions permanentes envoyées à l'IA. Les données en temps réel (stock, trésor, commandes) sont <strong style="color:var(--gold)">injectées automatiquement</strong> après ce texte à chaque message.
        </p>
        <textarea id="ia-base-prompt"
          style="width:100%;box-sizing:border-box;height:360px;resize:vertical;font-family:monospace;font-size:12px;line-height:1.65;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:12px;outline:none"
        >${escHtml(data.base)}</textarea>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="saveIAPrompt()">💾 Sauvegarder</button>
          <button class="btn btn-ghost" onclick="resetIAPrompt(${JSON.stringify(data.default)})" title="Remettre le prompt d'origine">↺ Réinitialiser</button>
        </div>
      </div>

      <div class="table-wrap" style="padding:20px 24px">
        <h3 style="margin:0 0 4px">👁️ Prompt complet envoyé (preview temps réel)</h3>
        <p style="color:var(--text-dim);font-size:12px;margin:0 0 14px;line-height:1.6">
          Aperçu exact de ce que l'IA reçoit à chaque message, avec les données actuelles injectées.
        </p>
        <textarea readonly
          style="width:100%;box-sizing:border-box;height:360px;resize:vertical;font-family:monospace;font-size:11px;line-height:1.65;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-dim);padding:12px;cursor:default;outline:none"
        >${escHtml(data.preview)}</textarea>
        <p style="font-size:11px;color:var(--text-dim);margin-top:8px">
          🔄 Stock, trésor et commandes sont mis à jour en temps réel à chaque message Discord reçu dans le salon IA.
        </p>
      </div>

    </div>`;
}

async function saveIAPrompt() {
  const val = $('ia-base-prompt')?.value;
  if (val === undefined) return;
  try {
    await put('/api/ia/prompt', { base: val });
    toast('Pré-prompt sauvegardé');
    loadIAPrompt();
  } catch(e) { toast(e.message, 'error'); }
}

function resetIAPrompt(defaultText) {
  const ta = $('ia-base-prompt');
  if (ta) ta.value = defaultText;
  toast('Prompt remis à zéro — cliquez Sauvegarder pour confirmer', 'ok');
}

// ── LOGS D'ACTIVITÉ ───────────────────────────────────────────────────────────
const LOG_LABELS = {
  stock_ajout:          { icon: '➕', label: 'Stock ajouté',        color: 'var(--green)' },
  stock_maj:            { icon: '✏️', label: 'Stock modifié',        color: 'var(--blue)' },
  stock_suppression:    { icon: '🗑️', label: 'Stock supprimé',       color: 'var(--red)' },
  commande_statut:      { icon: '📋', label: 'Commande mise à jour', color: 'var(--gold)' },
  tresorerie_maj:       { icon: '🏦', label: 'Trésorerie modifiée',  color: 'var(--gold)' },
  tresorerie_mouvement: { icon: '💸', label: 'Mouvement trésorerie', color: 'var(--orange)' },
  offre_statut:         { icon: '🛒', label: 'Offre mise à jour',    color: 'var(--blue)' },
};

let logsData = [];
let logsFilter = '';

async function renderLogs() {
  $('page-content').innerHTML = `
  <div class="table-wrap">
    <div class="table-toolbar">
      <select id="logs-filter" onchange="filterLogs(this.value)" style="width:220px">
        <option value="">Toutes les actions</option>
        ${Object.entries(LOG_LABELS).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
      </select>
      <span id="logs-count" style="color:var(--text-dim);font-size:13px"></span>
    </div>
    <table>
      <thead><tr>
        <th style="width:160px">Date</th>
        <th style="width:180px">Action</th>
        <th>Détail</th>
        <th style="width:130px">Auteur</th>
      </tr></thead>
      <tbody id="logs-body"><tr><td colspan="4" class="empty">Chargement…</td></tr></tbody>
    </table>
  </div>`;
  await loadLogs();
}

async function loadLogs() {
  const url = logsFilter ? `/api/logs?limit=300&action=${logsFilter}` : '/api/logs?limit=300';
  logsData = await get(url) ?? [];
  renderLogsTable();
}

function filterLogs(val) {
  logsFilter = val;
  loadLogs();
}

function renderLogsTable() {
  const tbody = $('logs-body');
  if (!tbody) return;
  const count = $('logs-count');
  if (count) count.textContent = `${logsData.length} entrée${logsData.length > 1 ? 's' : ''}`;
  if (!logsData.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">Aucun journal pour le moment.</td></tr>';
    return;
  }
  tbody.innerHTML = logsData.map(row => {
    const meta  = LOG_LABELS[row.action] ?? { icon: '📝', label: row.action, color: 'var(--text-dim)' };
    const date  = new Date(row.creee_le + 'Z').toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    return `<tr>
      <td style="color:var(--text-dim);font-size:12px">${date}</td>
      <td><span style="color:${meta.color};font-weight:600">${meta.icon} ${meta.label}</span></td>
      <td style="font-size:13px">${escHtml(row.detail)}</td>
      <td style="color:var(--text-dim)">${escHtml(row.auteur || '—')}</td>
    </tr>`;
  }).join('');
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s){ return String(s).replace(/'/g,"\\'").replace(/"/g,'&quot;'); }

let GUILD_ID = '';

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  const params = new URLSearchParams(location.search);
  const err = params.get('error');
  const meRes = await fetch('/api/me');

  if (meRes.status === 403) {
    const data = await meRes.json().catch(() => ({}));
    if (data.error === 'VISITEUR_BLOCKED') {
      showVisiteurBlocked();
      return;
    }
  }

  const me = meRes.ok ? await meRes.json() : null;

  if (!me) {
    showLogin();
    if (err) {
      const el = $('login-error');
      el.textContent = err==='unauthorized' ? '🔒 Accès refusé — Rôle Marchand requis.' : '❌ Erreur d\'authentification. Réessayez.';
      el.style.display = 'block';
    }
    return;
  }
  if (err) history.replaceState({}, '', '/');

  // Récupère le guild_id depuis la config
  fetch('/api/config').then(r=>r.ok?r.json():null).then(c=>{if(c?.GUILD_ID)GUILD_ID=c.GUILD_ID;}).catch(()=>{});

  window._canWrite = !!me.canWrite;
  window._isAdmin  = !!me.isAdmin;
  window._me = me;

  // Masquer la section Administration si pas admin
  if (!me.isAdmin) {
    document.querySelectorAll('.nav-section, .nav-item').forEach(el => {
      if (el.classList.contains('nav-section') && el.textContent.trim() === 'Administration') el.style.display = 'none';
      if (el.dataset.page === 'permissions') el.style.display = 'none';
    });
  }
  $('user-avatar').src  = me.avatar;
  $('user-name').textContent = me.nick;
  // Show permission level badge in sidebar
  const roleEl = document.querySelector('.user-role');
  if (roleEl && me.permLevel) {
    const labels = { JARL:'👑 Jarl', NOBLE:'⚜️ Noble', ECUYER:'🛡️ Écuyer', PAYSAN:'🌾 Paysan', VISITEUR:'🚪 Visiteur' };
    roleEl.textContent = labels[me.permLevel] ?? '⚓ Membre';
  }
  showApp();
  initSocket();
  navigate('dashboard');
})();

// ── TARIFS OFFICIELS ──────────────────────────────────────────────────────────
const TYPE_LABEL_TARIFS = {
  ressource:      '📦 Ressources',
  main_oeuvre:    '🔨 Main-d\'œuvre',
  fabrication:    '⚙️ Fabrication',
  transformation: '🍳 Transformation',
  construction:   '🏗️ Main-d\'œuvre selon projet',
  avertissement:  '⚠️ Avertissement officiel',
};

const METIER_EMOJI = {
  Ouvrier:      '⚒️',
  Forgeron:     '🛠️',
  Agriculteur:  '🌾',
  Constructeur: '🏗️',
  Apothicaire:  '⚗️',
};

let tarifsData = null;
let tarifsMetierActif = null;

async function renderTarifs() {
  tarifsData = await get('/api/tarifs');
  if (!tarifsData) return;
  tarifsMetierActif = tarifsData.metiers[0] ?? null;
  renderTarifsPage();
}

function renderTarifsPage() {
  const { metiers, rows } = tarifsData;
  const metier = tarifsMetierActif;

  const tabs = metiers.map(m =>
    `<button class="btn ${m === metier ? 'btn-primary' : 'btn-ghost'}" onclick="tarifsSelectMetier('${m}')">${METIER_EMOJI[m] ?? '📜'} ${m}</button>`
  ).join('');

  const filtered = rows.filter(r => r.metier === metier);

  let content = '';
  if (metier === 'Apothicaire') {
    content = `
      <div class="card" style="border:1px solid var(--red);background:rgba(248,81,73,.07)">
        <h3 style="color:var(--red)">⚠️ Avertissement officiel</h3>
        <p style="color:var(--text);line-height:1.8">
          Les apothicaires ne se sont <strong>pas encore présentés</strong> auprès de la Compagnie du Fjord.<br>
          Aucune grille tarifaire officielle n'a été établie à ce jour.<br><br>
          <strong>Il n'est pas conseillé d'acheter</strong> potions, remèdes ou produits alchimiques tant qu'aucune réglementation officielle n'a été établie.<br>
          <em>Des abus de prix pourraient avoir lieu.</em><br><br>
          — La Compagnie du Fjord
        </p>
      </div>`;
  } else {
    const byType = {};
    for (const row of filtered) {
      if (!byType[row.type]) byType[row.type] = [];
      byType[row.type].push(row);
    }

    for (const [type, items] of Object.entries(byType)) {
      const label = TYPE_LABEL_TARIFS[type] ?? type;
      const trs = items.map(row => {
        const qte   = row.quantite > 1 ? `×${row.quantite} ${row.unite}` : row.unite;
        const prix  = row.prix_ecus !== null
          ? `<strong>${bronze(row.prix_ecus)}</strong> <small style="color:var(--text-dim)">/ ${qte}</small>`
          : `<span class="badge badge-attente">En attente</span>`;
        const note  = row.note ? `<small style="color:var(--text-dim)">${row.note}</small>` : '';
        const edit  = window._canWrite
          ? `<button class="btn btn-ghost btn-xs" onclick="tarifsEditRow(${row.id})">✏️</button>`
          : '';
        return `<tr><td>${row.item}</td><td>${prix}</td><td>${note}</td><td>${edit}</td></tr>`;
      }).join('');

      content += `
        <div class="card" style="margin-bottom:1rem">
          <h4 style="color:var(--gold);margin-bottom:.75rem">${label}</h4>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="color:var(--text-dim);font-size:.8rem;border-bottom:1px solid var(--border)">
              <th style="text-align:left;padding:.4rem .5rem">Article</th>
              <th style="text-align:left;padding:.4rem .5rem">Prix</th>
              <th style="text-align:left;padding:.4rem .5rem">Note</th>
              <th style="padding:.4rem .5rem"></th>
            </tr></thead>
            <tbody>${trs}</tbody>
          </table>
        </div>`;
    }
  }

  $('page-content').innerHTML = `
    <div style="margin-bottom:1rem">
      <p style="color:var(--text-dim);font-size:.9rem">
        ⚖️ Tarifs validés par <strong>Monseigneur Rudeus Boreas Torradsson</strong>, Grand Marchand de Skarn.
        <em>1 écu = 1 🟤 Bronze</em>
      </p>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem">${tabs}</div>
    </div>
    <div id="tarifs-content">${content}</div>`;
}

window.tarifsSelectMetier = function(metier) {
  tarifsMetierActif = metier;
  renderTarifsPage();
};

window.tarifsEditRow = async function(id) {
  const row = tarifsData.rows.find(r => r.id === id);
  if (!row) return;
  openModal(`✏️ Modifier — ${row.item}`,
    `<div class="form-group">
       <label>Prix (écus/bronze) <small style="color:var(--text-dim)">vide = en attente</small></label>
       <input id="te-prix" type="number" min="0" class="input" value="${row.prix_ecus ?? ''}" placeholder="En attente">
     </div>
     <div class="form-group">
       <label>Note</label>
       <input id="te-note" type="text" class="input" value="${row.note ?? ''}">
     </div>`,
    `<button class="btn btn-ghost" onclick="$('modal').classList.remove('open')">Annuler</button>
     <button class="btn btn-primary" onclick="tarifsEditSave(${id})">Enregistrer</button>`
  );
};

window.tarifsEditSave = async function(id) {
  const prixRaw = $('te-prix').value;
  const note    = $('te-note').value;
  const prix_ecus = prixRaw === '' ? null : parseInt(prixRaw);
  try {
    await put(`/api/tarifs/${id}`, { prix_ecus, note });
    $('modal').classList.remove('open');
    tarifsData = await get('/api/tarifs');
    renderTarifsPage();
    toast('Tarif mis à jour');
  } catch (e) { toast(e.message, 'err'); }
};

// ── PERMISSIONS ───────────────────────────────────────────────────────────────
let _permMeta = null;
let _permMembers = [];
let _permFilter = 'ALL';
let _permSearch = '';

const PERM_LABELS = {
  can_manage_stock:       '📦 Stock',
  can_manage_orders:      '📋 Commandes',
  can_view_treasury:      '🏦 Voir tréso.',
  can_manage_treasury:    '💰 Modifier tréso.',
  can_manage_prices:      '💹 Prix',
  can_manage_catalog:     '📖 Catalogue',
  can_view_analytics:     '📊 Stats',
  can_manage_market:      '📈 Marché',
  can_make_announcements: '📢 Annonces',
  can_manage_forum:       '🗂️ Forum',
  can_assign_roles:       '🎭 Rôles',
  can_configure_bot:      '⚙️ Config bot',
};

const LEVEL_ORDER = ['JARL','NOBLE','ECUYER','PAYSAN','VISITEUR'];
const LEVEL_LABELS_FR = { JARL:'👑 Jarl', NOBLE:'⚜️ Noble', ECUYER:'🛡️ Écuyer', PAYSAN:'🌾 Paysan', VISITEUR:'🚪 Visiteur' };

async function renderPermissions() {
  $('topbar-actions').innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="loadPermMembers()">🔄 Actualiser</button>`;

  $('page-content').innerHTML = `
    <div style="margin-bottom:20px">
      <p style="color:var(--text-dim);font-size:13px;line-height:1.7">
        Gérez les droits de chaque membre Discord. Le niveau de permission est détecté automatiquement depuis les rôles Discord,
        et peut être personnalisé manuellement. Les modifications sont effectives immédiatement sur le bot Discord et la webapp.
      </p>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:20px">
      <div class="search-box" style="max-width:260px">
        <input id="perm-search" placeholder="Rechercher un membre…" oninput="filterPermMembers()">
      </div>
      <select id="perm-filter" class="filter-select" onchange="filterPermMembers()">
        <option value="ALL">Tous les grades</option>
        ${LEVEL_ORDER.map(l => `<option value="${l}">${LEVEL_LABELS_FR[l]}</option>`).join('')}
      </select>
      <span id="perm-count" style="color:var(--text-dim);font-size:12px"></span>
    </div>
    <div id="perm-legend" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">
      ${LEVEL_ORDER.map(l => `
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-dim)">
          <span class="perm-level-badge perm-${l}">${LEVEL_LABELS_FR[l]}</span>
        </div>`).join('')}
    </div>
    <div id="perm-members-grid" class="members-grid">
      <div class="empty"><div class="spinner"></div></div>
    </div>`;

  if (!_permMeta) _permMeta = await get('/api/permissions/meta');
  await loadPermMembers();
}

async function loadPermMembers() {
  const grid = $('perm-members-grid');
  if (grid) grid.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
  _permMembers = await get('/api/members') ?? [];
  renderPermGrid();
}

function filterPermMembers() {
  _permSearch = $('perm-search')?.value?.toLowerCase() ?? '';
  _permFilter = $('perm-filter')?.value ?? 'ALL';
  renderPermGrid();
}

function renderPermGrid() {
  const grid = $('perm-members-grid');
  if (!grid) return;

  let members = _permMembers;
  if (_permFilter !== 'ALL') members = members.filter(m => m.permission_level === _permFilter);
  if (_permSearch) members = members.filter(m =>
    m.display_name.toLowerCase().includes(_permSearch) ||
    m.username.toLowerCase().includes(_permSearch));

  // Sort by level hierarchy then name
  members = [...members].sort((a, b) => {
    const li = LEVEL_ORDER.indexOf(a.permission_level);
    const lj = LEVEL_ORDER.indexOf(b.permission_level);
    if (li !== lj) return li - lj;
    return a.display_name.localeCompare(b.display_name, 'fr');
  });

  const countEl = $('perm-count');
  if (countEl) countEl.textContent = `${members.length} membre${members.length > 1 ? 's' : ''}`;

  if (members.length === 0) {
    grid.innerHTML = '<div class="empty"><div class="empty-icon">👥</div><p>Aucun membre trouvé.</p></div>';
    return;
  }

  grid.innerHTML = members.map(m => renderMemberCard(m)).join('');
}

function renderMemberCard(m) {
  const level = m.permission_level;
  const levelLabel = LEVEL_LABELS_FR[level] ?? level;
  const canEdit = window._canWrite;

  const permKeys = Object.keys(PERM_LABELS);
  const permFlags = permKeys.map(k => {
    const active = m.effective[k];
    const isOverride = m.overrides && k in m.overrides;
    return `
      <label class="perm-flag ${active ? 'active' : 'inactive'}" title="${PERM_LABELS[k]}${isOverride ? ' (personnalisé)' : ''}">
        <input type="checkbox" ${active ? 'checked' : ''} ${canEdit ? '' : 'disabled'}
          onchange="permToggleFlag('${m.user_id}','${k}',this.checked)"
          ${isOverride ? 'style="outline:2px solid var(--gold)"' : ''}>
        <span style="font-size:11px">${PERM_LABELS[k]}</span>
        ${isOverride ? '<span style="color:var(--gold);font-size:9px">✦</span>' : ''}
      </label>`;
  }).join('');

  const levelOptions = LEVEL_ORDER.map(l =>
    `<option value="${l}" ${l === level ? 'selected' : ''}>${LEVEL_LABELS_FR[l]}</option>`
  ).join('');

  return `
    <div class="member-card" id="mc-${m.user_id}">
      <div class="member-header">
        <img class="member-avatar" src="${m.avatar}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
        <div class="member-info">
          <div class="member-name">${escHtml(m.display_name)}</div>
          <div class="member-username">@${escHtml(m.username)}</div>
        </div>
        <span class="perm-level-badge perm-${level}">${levelLabel}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <label style="font-size:12px;color:var(--text-dim);flex-shrink:0">Grade :</label>
        <select class="level-select" ${canEdit ? '' : 'disabled'}
          onchange="permChangeLevel('${m.user_id}',this.value)">
          ${levelOptions}
        </select>
        ${!m.in_db ? `<span style="font-size:11px;color:var(--orange)" title="Pas encore connecté à la webapp">⚠️ jamais connecté</span>` : ''}
      </div>
      <div class="perm-grid">${permFlags}</div>
      ${Object.keys(m.overrides ?? {}).length > 0 ? `
        <div style="display:flex;justify-content:flex-end;margin-top:2px">
          <button class="btn btn-ghost btn-sm" onclick="permResetOverrides('${m.user_id}')" title="Réinitialiser aux permissions par défaut du grade">↺ Réinitialiser</button>
        </div>` : ''}
    </div>`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.filterPermMembers = filterPermMembers;
window.loadPermMembers = loadPermMembers;

window.permChangeLevel = async function(userId, newLevel) {
  const member = _permMembers.find(m => m.user_id === userId);
  if (!member) return;
  const oldLevel = member.permission_level;
  member.permission_level = newLevel;
  // Reset overrides when changing level
  member.overrides = {};
  const defaults = _permMeta?.DEFAULT_PERMISSIONS?.[newLevel] ?? {};
  member.effective = { ...defaults };
  // Re-render card
  const card = $(`mc-${userId}`);
  if (card) card.outerHTML = renderMemberCard(member);

  if (!member.in_db) {
    toast('Ce membre n\'a jamais visité la webapp — impossible de sauvegarder.', 'error');
    member.permission_level = oldLevel;
    renderPermGrid();
    return;
  }
  try {
    const result = await put(`/api/permissions/${userId}`, { permission_level: newLevel, overrides: {} });
    if (result?.warned) toast(`⚠️ ${result.warned}`, 'error');
    else if (result?.roleAssigned) toast(`${member.display_name} → ${LEVEL_LABELS_FR[newLevel]} · Rôle Discord "${result.roleAssigned}" assigné`);
    else toast(`Grade de ${member.display_name} → ${LEVEL_LABELS_FR[newLevel]}`);
  } catch (e) { toast(e.message, 'error'); member.permission_level = oldLevel; renderPermGrid(); }
};

window.permToggleFlag = async function(userId, permKey, checked) {
  const member = _permMembers.find(m => m.user_id === userId);
  if (!member) return;
  if (!member.in_db) {
    toast('Ce membre n\'a jamais visité la webapp — impossible de sauvegarder.', 'error');
    renderPermGrid(); return;
  }
  const defaults = _permMeta?.DEFAULT_PERMISSIONS?.[member.permission_level] ?? {};
  // Only store as override if different from default
  if (!member.overrides) member.overrides = {};
  if (defaults[permKey] === checked) {
    delete member.overrides[permKey];
  } else {
    member.overrides[permKey] = checked;
  }
  member.effective[permKey] = checked;

  try {
    await put(`/api/permissions/${userId}`, { permission_level: member.permission_level, overrides: member.overrides });
    // Re-render card to update override indicators
    const card = $(`mc-${userId}`);
    if (card) card.outerHTML = renderMemberCard(member);
    toast('Permission mise à jour');
  } catch (e) { toast(e.message, 'error'); await loadPermMembers(); }
};

window.permResetOverrides = async function(userId) {
  const member = _permMembers.find(m => m.user_id === userId);
  if (!member) return;
  member.overrides = {};
  const defaults = _permMeta?.DEFAULT_PERMISSIONS?.[member.permission_level] ?? {};
  member.effective = { ...defaults };
  try {
    await put(`/api/permissions/${userId}`, { permission_level: member.permission_level, overrides: {} });
    const card = $(`mc-${userId}`);
    if (card) card.outerHTML = renderMemberCard(member);
    toast('Permissions réinitialisées aux valeurs par défaut du grade');
  } catch (e) { toast(e.message, 'error'); }
};

// ── Wiki ──────────────────────────────────────────────────────────────────────
const WIKI_ENTRIES = [
  // ── IA Village ──
  {
    cat: 'ia', tags: ['ia','bot','village'],
    icon: '🏰', title: 'Intendant IA — Salon Village',
    tag: 'IA', tagClass: 'ia',
    desc: 'L\'IA principale de la Compagnie. Répond à tous les membres (Paysan et +) dans le salon #intendant-village. Connaît en temps réel le stock, les commandes actives, les offres de vente, la trésorerie, les recettes et les tarifs officiels.',
    usage: '#intendant-village → écrire un message',
    options: [
      ['Accès','Membres Discord avec grade Paysan ou supérieur'],
      ['Contexte injecté','Stock complet · Commandes actives · Offres · Trésorerie · Tarifs officiels · Coûts de craft'],
      ['Mémoire','25 messages par personne · persistante en base · TTL 30 min d\'inactivité'],
      ['Langues','Détecte la langue et répond dans la même (FR par défaut)'],
      ['Ton','Adapté au grade RP : Jarl (institutionnel) · Noble (pro) · Écuyer (collègue) · Paysan (pédagogique)'],
    ],
    note: 'Chaque message est supprimé après envoi pour garder le salon propre. La réponse s\'auto-supprime après 60s.'
  },
  {
    cat: 'ia', tags: ['ia','bot','visiteurs'],
    icon: '🚪', title: 'Commis IA — Salon Visiteurs',
    tag: 'IA', tagClass: 'ia',
    desc: 'Version publique de l\'IA pour les visiteurs et marchands de passage. Répond dans #intendant-visiteurs. Montre uniquement le stock en vente, aide à commander ou vendre, présente Fjordheim.',
    usage: '#intendant-visiteurs → écrire un message',
    options: [
      ['Accès','Tous les membres du serveur Discord'],
      ['Stock visible','Uniquement les ressources en vente (pas l\'inventaire interne complet)'],
      ['Trésorerie','Non divulguée ("la Compagnie est prospère" sans chiffres)'],
      ['Besoins','Indique proactivement les ressources épuisées ou en stock bas qu\'on cherche à acheter'],
    ],
    note: 'Si quelqu\'un mentionne "j\'ai du bois" ou "je cherche des potions", l\'IA répond proactivement avec prix et dispo.'
  },
  {
    cat: 'ia', tags: ['ia','bot','analyser','image','vision'],
    icon: '🔍', title: '/analyser — Analyse d\'image IA',
    tag: 'IA', tagClass: 'ia',
    desc: 'Commande slash utilisant un modèle IA vision (LLaMA 3.2 90B). Analyse des screenshots Minecraft : inventaires, coffres, cartes, interfaces de craft. Compare automatiquement avec le stock de la Compagnie et suggère des échanges.',
    usage: '/analyser image:[fichier] question:[texte optionnel]',
    options: [
      ['image','Fichier image obligatoire (PNG, JPG, WEBP, GIF)'],
      ['question','Question ou contexte précis sur l\'image (optionnel)'],
      ['Modèle','meta/llama-3.2-90b-vision-instruct'],
      ['Stock injecté','Compare ce qu\'il voit avec notre stock en temps réel'],
    ],
    note: 'L\'image est téléchargée depuis Discord et envoyée en base64 à l\'API NVIDIA pour éviter les problèmes d\'accès CDN.'
  },
  {
    cat: 'ia', tags: ['ia','bot','negocier','commercial'],
    icon: '🤝', title: '/negocier — Conseiller commercial IA',
    tag: 'IA', tagClass: 'ia',
    desc: 'L\'IA analyse une offre d\'achat ou de vente et donne un verdict tranché : ACCEPTER, CONTRE-PROPOSER (avec prix suggéré), ou REFUSER. Compare prix catalogue, prix régionaux et historique des transactions.',
    usage: '/negocier ressource:[nom] quantite:[n] prix:[bronze] type:[achat|vente]',
    options: [
      ['ressource','Nom de la ressource concernée'],
      ['quantite','Quantité en jeu'],
      ['prix','Prix total proposé en bronze'],
      ['type','achat (quelqu\'un nous vend) ou vente (on vend à quelqu\'un)'],
      ['contexte','Contexte supplémentaire optionnel (urgent, relation RP, région…)'],
    ],
    note: 'L\'embed est coloré : vert (ACCEPTER), orange (CONTRE-PROPOSER), rouge (REFUSER).'
  },
  {
    cat: 'ia', tags: ['ia','bot','recap','historique','memoire'],
    icon: '📜', title: '/recap — Historique de conversation',
    tag: 'IA', tagClass: 'ia',
    desc: 'Affiche ou efface ton historique de conversation avec l\'Intendant IA. La mémoire est personnelle, persistante en base de données.',
    usage: '/recap voir  |  /recap effacer',
    options: [
      ['voir','Affiche tes 25 derniers messages échangés avec l\'IA'],
      ['effacer','Remet à zéro ta mémoire — l\'IA repart de zéro à la prochaine conversation'],
    ],
    note: 'La réponse est visible uniquement par toi (éphémère). La mémoire s\'efface automatiquement après 30 min d\'inactivité.'
  },
  // ── Commandes publiques ──
  {
    cat: 'commandes', tags: ['bot','commandes','catalogue','public'],
    icon: '🗂️', title: '/catalogue — Parcourir le stock',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Affiche les ressources disponibles à l\'achat, classées par catégorie. Boutons de navigation pour parcourir les pages.',
    usage: '/catalogue',
    options: [
      ['Accès','Tous'],
      ['Contenu','Ressources en vente avec quantité, prix, unité'],
    ],
  },
  {
    cat: 'commandes', tags: ['bot','commandes','commander','public'],
    icon: '🛒', title: '/commander — Passer une commande',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Passe une commande auprès de la Compagnie. Génère un post de forum Discord avec thread de suivi. Notifications automatiques à chaque changement de statut.',
    usage: '/commander ressource:[nom] quantite:[n] note:[texte optionnel]',
    options: [
      ['ressource','Nom de la ressource (doit exister dans le stock)'],
      ['quantite','Quantité souhaitée'],
      ['note','Note ou instructions particulières (optionnel)'],
    ],
    note: 'Statuts : En attente → En cours → Prête → Livrée. DM automatique à chaque étape.'
  },
  {
    cat: 'commandes', tags: ['bot','commandes','macommande','public'],
    icon: '📋', title: '/macommande — Voir mes commandes',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Affiche toutes tes commandes en cours avec leur statut actuel.',
    usage: '/macommande',
    options: [['Accès','Tous · Visible uniquement par toi (éphémère)']],
  },
  {
    cat: 'commandes', tags: ['bot','commandes','marchands','gestion'],
    icon: '⚙️', title: '/commandes — Gérer les commandes (marchands)',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Gestion complète des commandes pour les marchands. Liste, détail, changement de statut, filtres. Système de réputation client intégré.',
    usage: '/commandes liste  |  /commandes detail id:[n]  |  /commandes statut id:[n] statut:[statut]',
    options: [
      ['liste','Liste paginée avec filtres par statut'],
      ['detail','Détail complet d\'une commande'],
      ['statut','Changer le statut : en_cours · prete · livree · annulee'],
    ],
  },
  // ── Contrats ──
  {
    cat: 'contrats', tags: ['bot','contrats'],
    icon: '📜', title: '/contrat creer — Nouveau contrat',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Crée un contrat de livraison public. Tout membre peut l\'accepter. Définit ressource, quantité, prix, délai et pénalité de retard optionnelle.',
    usage: '/contrat creer ressource:[nom] quantite:[n] prix:[bronze] delai:[3j|48h|1semaine]',
    options: [
      ['ressource','Ressource à livrer'],
      ['quantite','Quantité'],
      ['prix','Prix total en bronze'],
      ['delai','Délai : formats acceptés : 3j, 48h, 2d, 1semaine'],
      ['unite','Unité (défaut : Unité)'],
      ['penalite','Pénalité de retard en bronze (optionnel)'],
      ['note','Conditions particulières (optionnel)'],
    ],
  },
  {
    cat: 'contrats', tags: ['bot','contrats'],
    icon: '🤝', title: '/contrat accepter — Accepter un contrat',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Accepte un contrat ouvert. Le vendeur reçoit un DM automatique. Impossible d\'accepter son propre contrat.',
    usage: '/contrat accepter id:[n]',
    options: [['id','ID du contrat à accepter']],
    note: 'DM automatique au vendeur avec rappel de l\'échéance et de la pénalité.'
  },
  {
    cat: 'contrats', tags: ['bot','contrats'],
    icon: '📢', title: '/contrat lister — Voir les contrats',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Liste les contrats ouverts disponibles, ou tes propres contrats.',
    usage: '/contrat lister filtre:[ouverts|miens]',
    options: [
      ['ouverts','Tous les contrats disponibles à accepter'],
      ['miens','Tes contrats (vendeur ou acheteur)'],
    ],
  },
  {
    cat: 'contrats', tags: ['bot','contrats'],
    icon: '🔄', title: '/contrat statut — Changer le statut',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Met à jour le statut d\'un contrat dont tu es partie prenante. L\'autre partie reçoit un DM automatique.',
    usage: '/contrat statut id:[n] statut:[en_cours|livre|annule|litige]',
    options: [
      ['en_cours','Livraison en cours de préparation'],
      ['livre','Contrat honoré et livré'],
      ['annule','Annulation du contrat'],
      ['litige','Signaler un désaccord'],
    ],
  },
  // ── Stock & Prix ──
  {
    cat: 'stock', tags: ['bot','stock','marchands'],
    icon: '📦', title: '/stock — Gérer le stock',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Gestion complète du stock interne. Voir, mettre à jour, modifier les prix, activer/désactiver la vente, supprimer.',
    usage: '/stock voir  |  /stock maj ressource:[nom] quantite:[n]  |  /stock prix ressource:[nom] prix:[n]',
    options: [
      ['voir','Parcourir l\'inventaire complet par catégorie'],
      ['maj','Mettre à jour la quantité d\'une ressource'],
      ['prix','Modifier le prix d\'une ressource'],
      ['toggle','Activer ou désactiver la mise en vente'],
      ['vendre','Enregistrer une vente (diminue le stock et crédite la trésorerie)'],
      ['supprimer','Supprimer une ressource du catalogue'],
    ],
  },
  {
    cat: 'stock', tags: ['bot','prix','regions','marche'],
    icon: '💰', title: '/prix — Prix régionaux',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Tableau comparatif des prix dans les 5 régions commerciales : PDM, Rhême, Skanor, Byb-Razab, Yuhang.',
    usage: '/prix voir  |  /prix modifier  |  /prix ajouter  |  /prix supprimer',
    options: [
      ['voir','Tableau comparatif paginé'],
      ['modifier','Modifier un prix régional existant'],
      ['ajouter','Ajouter un nouveau produit au tableau'],
      ['supprimer','Supprimer un produit'],
    ],
  },
  {
    cat: 'stock', tags: ['bot','marche','fluctuation'],
    icon: '📈', title: '/marche — Fluctuations de marché',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Simule des variations RP de prix (hausse ou baisse de marché). Les variations s\'appliquent en pourcentage sur les prix de base.',
    usage: '/marche fluctuation ressource:[nom] variation:[%]  |  /marche reset  |  /marche voir',
    options: [
      ['fluctuation','Applique une variation en % (positif = hausse, négatif = baisse)'],
      ['reset','Remet toutes les variations à 0'],
      ['voir','Affiche les variations actives'],
    ],
  },
  // ── Recettes ──
  {
    cat: 'recettes', tags: ['bot','recettes','craft'],
    icon: '📖', title: '/recette — Recettes de craft',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Catalogue des recettes de craft par profession et niveau. Calcul automatique du coût théorique basé sur les prix du stock.',
    usage: '/recette voir  |  /recette chercher nom:[texte]  |  /recette compagnie  |  /recette ajouter',
    options: [
      ['voir','Parcourir par profession et niveau avec filtres'],
      ['chercher','Rechercher une recette par nom d\'objet'],
      ['compagnie','Recettes des métiers pratiqués dans la Compagnie'],
      ['ajouter','Ajouter une nouvelle recette (marchands)'],
    ],
  },
  // ── Réputation & Inventaire ──
  {
    cat: 'membres', tags: ['bot','reputation','inventaire','client'],
    icon: '⭐', title: '/inventaire — Fiche client',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Fiche complète d\'un membre : historique des commandes, réputation ★, segment client (VIP/Régulier/Risque/Nouveau), statistiques (total bronze dépensé, taux d\'annulation).',
    usage: '/inventaire membre:[@membre]',
    options: [
      ['membre','Mention Discord du membre à consulter'],
      ['Segment VIP','👑 +500🟤 dépensés ou +10 commandes livrées'],
      ['Segment Régulier','🤝 3 à 9 commandes livrées'],
      ['Segment Risque','⚠️ 3 annulations ou plus'],
      ['Segment Nouveau','🆕 Moins de 3 commandes'],
    ],
    note: 'Visible uniquement par toi (éphémère). Le segment est aussi injecté dans le contexte de l\'Intendant IA.'
  },
  // ── Trésorerie ──
  {
    cat: 'tresorerie', tags: ['bot','tresorerie','bourse'],
    icon: '🏦', title: '/bourse — Conversions monétaires',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Outils de calcul monétaire pour le système Bronze/Argent/Or du serveur Vyldra.',
    usage: '/bourse convertir montant:[n]  |  /bourse calculer ressource:[nom] quantite:[n]',
    options: [
      ['convertir','Convertit un montant bronze en Or 🟡 / Argent ⚪ / Bronze 🟤'],
      ['calculer','Calcule le prix total d\'un achat en quantité selon le prix catalogue'],
    ],
    note: '1 Or = 100 Bronze · 1 Argent = 10 Bronze · "écu" = bronze sur le serveur Vyldra.'
  },
  // ── Alertes ──
  {
    cat: 'alertes', tags: ['bot','alertes','monitoring','admin'],
    icon: '🔔', title: 'Système d\'alertes automatiques',
    tag: 'Admin', tagClass: 'admin',
    desc: 'Monitoring toutes les 5 minutes. Envoie des alertes Discord dans un salon dédié. Anti-spam : cooldown 2h par alerte identique.',
    usage: '/alertes salon #salon  |  /alertes tresor seuil:[bronze]  |  /alertes info',
    options: [
      ['Stock épuisé','⬛ Alerte quand une ressource tombe à 0'],
      ['Stock bas','⚠️ Alerte quand une ressource passe sous son seuil d\'alerte'],
      ['Commandes +2h','⏳ Alerte si des commandes restent en attente plus de 2h'],
      ['Trésorerie','🏦 Alerte si le solde passe sous le seuil configuré (défaut 500🟤)'],
      ['Contrats expirants','📜 Alerte 24h avant l\'échéance d\'un contrat'],
      ['Commande VIP','👑 Alerte instantanée pour clients VIP ou commandes +200🟤'],
    ],
    note: 'Config avec /alertes salon pour définir le canal de réception. /alertes tresor pour le seuil.'
  },
  // ── Forum & Annonces ──
  {
    cat: 'forum', tags: ['bot','forum','annonce'],
    icon: '📣', title: '/annonce — Publication RP',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Publie une annonce officielle de la Compagnie dans un salon Discord. Format embed avec titre, contenu et couleur personnalisables.',
    usage: '/annonce titre:[texte] contenu:[texte] couleur:[hex optionnel]',
    options: [
      ['titre','Titre de l\'annonce'],
      ['contenu','Corps du message (markdown supporté)'],
      ['couleur','Couleur hex de l\'embed (optionnel, défaut : or)'],
    ],
    note: 'Accès réservé aux marchands avec permission can_make_announcements.'
  },
  {
    cat: 'forum', tags: ['bot','forum','offres','vendeurs'],
    icon: '🛍️', title: '/forum — Offres de vente publiques',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Système de forum pour les vendeurs extérieurs. Chaque vendeur a un post dédié mis à jour automatiquement. Les marchands peuvent accepter ou refuser via la webapp.',
    usage: 'Bouton "Vendre à la Compagnie" dans les salons appropriés',
    options: [
      ['Vendeur','Propose ses ressources avec quantité, prix souhaité et note'],
      ['Marchand','Accepte ou refuse depuis la page "Offres de vente" de la webapp'],
      ['Post forum','1 post par vendeur, mis à jour automatiquement'],
    ],
  },
  // ── Tarifs ──
  {
    cat: 'stock', tags: ['bot','tarifs'],
    icon: '⚖️', title: '/tarifs — Tarifs officiels',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Affiche les grilles tarifaires officielles validées par le Grand Marchand de Skarn. Filtrables par métier.',
    usage: '/tarifs  |  /tarifs metier:[nom]',
    options: [
      ['Sans argument','Tous les tarifs par métier'],
      ['metier','Filtrer : Ouvrier · Forgeron · Agriculteur · Constructeur · Apothicaire'],
    ],
  },
  // ── Métiers ──
  {
    cat: 'membres', tags: ['bot','metiers','roles'],
    icon: '⚒️', title: '/metiers — Gestion des métiers',
    tag: 'Bot', tagClass: 'bot',
    desc: 'Embed interactif pour choisir son métier de base et sa spécialisation. Attribue les rôles Discord correspondants automatiquement.',
    usage: '/metiers  (ou via l\'embed dans le salon dédié)',
    options: [
      ['Métiers base','Fermier · Chasseur/Pêcheur · Bâtisseur · Cuisinier · Forgeron · Apothicaire · Ouvrier · Tanneur · Garde · Druide'],
      ['Spécialisations','2 par métier, accessibles au rang 10. Exemples : Forgeron de Guerre, Architecte de Guerre, Völva…'],
    ],
  },
  // ── Permissions ──
  {
    cat: 'permissions', tags: ['web','admin','permissions'],
    icon: '🛡️', title: 'Gestion des permissions (webapp)',
    tag: 'Web', tagClass: 'web',
    desc: 'Interface admin pour gérer les niveaux d\'accès de chaque membre. Synchronise les rôles Discord en temps réel. Accessible uniquement aux admins.',
    usage: 'Webapp → Administration → Permissions',
    options: [
      ['JARL 👑','Accès total : stock, commandes, trésorerie, prix, catalogue, marché, annonces, forum, rôles, config bot'],
      ['NOBLE ⚜️','Stock, commandes, trésorerie R/W, prix, catalogue, stats, marché, annonces, forum'],
      ['ÉCUYER 🛡️','Stock, commandes, trésorerie lecture, prix, catalogue, stats, marché, forum'],
      ['PAYSAN 🌾','Lecture des statistiques uniquement'],
      ['VISITEUR 🚪','Commandes publiques Discord uniquement — pas d\'accès webapp'],
    ],
    note: 'Les rôles Discord se mettent à jour automatiquement lors d\'un changement de niveau sur la webapp (pas besoin de se re-connecter).'
  },
  // ── Webapp ──
  {
    cat: 'webapp', tags: ['web'],
    icon: '📊', title: 'Tableau de bord',
    tag: 'Web', tagClass: 'web',
    desc: 'KPIs en temps réel : stock total, commandes actives, ventes semaine/mois. Graphiques : ventes 30 jours, top produits, répartition stock par catégorie, commandes par statut, top vendeurs.',
    usage: 'Webapp → Tableau de bord',
    options: [
      ['Temps réel','WebSocket — les KPIs se mettent à jour sans recharger la page'],
      ['Graphiques','Chart.js : barres, camemberts, courbes'],
    ],
  },
  {
    cat: 'webapp', tags: ['web'],
    icon: '📦', title: 'Gestion du stock (webapp)',
    tag: 'Web', tagClass: 'web',
    desc: 'Cartes visuelles par ressource avec barre de niveau, prix, toggle en vente, seuil d\'alerte configurable. Filtres par catégorie et recherche.',
    usage: 'Webapp → Stock',
    options: [
      ['Toggle','Optimistic UI : le changement est instantané, rollback automatique en cas d\'erreur'],
      ['Seuil alerte','Configurable par ressource — déclenche une alerte Discord automatique si atteint'],
      ['Ajout/Modif/Suppression','Interface inline sans rechargement de page'],
    ],
  },
  {
    cat: 'webapp', tags: ['web'],
    icon: '🏦', title: 'Trésorerie (webapp)',
    tag: 'Web', tagClass: 'web',
    desc: 'Solde actuel en Or/Argent/Bronze, graphique d\'évolution, historique complet des mouvements colorisé (entrées vertes, dépenses rouges), formulaire d\'ajout de mouvement avec motif.',
    usage: 'Webapp → Trésorerie',
    options: [
      ['Temps réel','Mise à jour WebSocket à chaque transaction'],
      ['Historique','Horodaté avec auteur et motif'],
    ],
  },
  {
    cat: 'webapp', tags: ['web'],
    icon: '🤖', title: 'Intendant IA (webapp)',
    tag: 'Web', tagClass: 'web',
    desc: 'Édition du pré-prompt de l\'IA directement depuis la webapp. Aperçu en temps réel du prompt complet envoyé à l\'IA (avec données injectées). Deux prompts séparés : Village et Visiteurs.',
    usage: 'Webapp → Intendant IA',
    options: [
      ['Prompt Village','Prompt de l\'Intendant principal (membres)'],
      ['Prompt Visiteurs','Prompt du Commis aux Visiteurs'],
      ['Aperçu temps réel','Voir exactement ce que l\'IA reçoit avec les données actuelles'],
      ['Reset','Bouton pour revenir au prompt par défaut'],
    ],
  },
  {
    cat: 'webapp', tags: ['web','admin'],
    icon: '📜', title: 'Journaux d\'activité',
    tag: 'Web', tagClass: 'web',
    desc: 'Historique de toutes les actions réalisées sur le bot et la webapp : commandes, modifications de stock, transactions, changements de statut. Horodaté avec auteur.',
    usage: 'Webapp → Journaux',
    options: [['Filtre','Par type d\'action, par auteur, par date']],
  },
  // ── Config ──
  {
    cat: 'config', tags: ['bot','admin','config'],
    icon: '⚙️', title: '/ia — Configuration des salons IA',
    tag: 'Admin', tagClass: 'admin',
    desc: 'Configure les salons Discord des deux intendants IA. Poste les embeds d\'accueil automatiquement.',
    usage: '/ia village salon:#salon  |  /ia visiteurs salon:#salon  |  /ia info',
    options: [
      ['village','Définit le salon #intendant-village'],
      ['visiteurs','Définit le salon #intendant-visiteurs'],
      ['info','Affiche la configuration actuelle'],
    ],
  },
  {
    cat: 'config', tags: ['bot','admin','roles'],
    icon: '🎭', title: '/roles — Configuration des rôles',
    tag: 'Admin', tagClass: 'admin',
    desc: 'Configure les rôles Discord automatiques : Visiteur attribué aux nouveaux membres, rôles des grades RP pour la synchronisation des permissions.',
    usage: '/roles visiteur role:[@role]  |  /roles info',
    options: [
      ['visiteur','Rôle attribué automatiquement aux nouveaux membres'],
      ['info','Affiche la configuration actuelle'],
    ],
  },
];

const WIKI_CATEGORIES = [
  { id: 'all',         label: '🌐 Tout voir' },
  { id: 'ia',         label: '🤖 IA & Vision' },
  { id: 'commandes',  label: '🛒 Commandes' },
  { id: 'contrats',   label: '📜 Contrats' },
  { id: 'stock',      label: '📦 Stock & Prix' },
  { id: 'recettes',   label: '📖 Recettes' },
  { id: 'tresorerie', label: '🏦 Trésorerie' },
  { id: 'membres',    label: '👥 Membres & Réputation' },
  { id: 'alertes',    label: '🔔 Alertes' },
  { id: 'forum',      label: '📣 Forum & Annonces' },
  { id: 'permissions',label: '🛡️ Permissions' },
  { id: 'webapp',     label: '🖥️ Webapp' },
  { id: 'config',     label: '⚙️ Configuration' },
];

let _wikiCat = 'all';
let _wikiSearch = '';

function renderWiki() {
  const el = $('page-content');

  const filtered = WIKI_ENTRIES.filter(e => {
    const matchCat    = _wikiCat === 'all' || e.cat === _wikiCat;
    const q           = _wikiSearch.toLowerCase();
    const matchSearch = !q ||
      e.title.toLowerCase().includes(q) ||
      e.desc.toLowerCase().includes(q) ||
      (e.usage || '').toLowerCase().includes(q) ||
      e.tags.some(t => t.includes(q));
    return matchCat && matchSearch;
  });

  const filtersHtml = WIKI_CATEGORIES.map(c =>
    `<button class="wiki-filter${_wikiCat === c.id ? ' active' : ''}" onclick="wikiSetCat('${c.id}')">${c.label}</button>`
  ).join('');

  const cardsHtml = filtered.length === 0
    ? `<div class="wiki-empty">Aucun résultat pour "<b>${_wikiSearch}</b>"</div>`
    : filtered.map(e => {
        const idx = WIKI_ENTRIES.indexOf(e);
        const usageHtml = e.usage ? `<div class="wiki-card-usage">${e.usage.split('|')[0].trim()}</div>` : '';
        return `
          <div class="wiki-card" onclick="wikiModalOpen(${idx})" title="Cliquer pour les détails">
            <div class="wiki-card-header">
              <span class="wiki-card-icon">${e.icon}</span>
              <span class="wiki-card-title">${e.title}</span>
              <span class="wiki-card-tag ${e.tagClass}">${e.tag}</span>
            </div>
            <div class="wiki-card-desc">${e.desc}</div>
            ${usageHtml}
            <div style="font-size:11px;color:var(--text-muted);margin-top:8px;opacity:.6">👆 Cliquer pour les détails</div>
          </div>`;
      }).join('');

  el.innerHTML = `
    <div class="wiki-header">
      <input class="wiki-search" id="wiki-search" placeholder="🔍 Rechercher une commande, une feature…" value="${_wikiSearch}" oninput="wikiSearch(this.value)">
      <div class="wiki-filters">${filtersHtml}</div>
    </div>
    <div class="wiki-cards">${cardsHtml}</div>
    <p style="color:var(--text-muted);font-size:12px;margin-top:24px;text-align:right">${filtered.length} entrée(s) affichée(s) sur ${WIKI_ENTRIES.length}</p>
  `;
}

function wikiSetCat(cat) {
  _wikiCat = cat;
  renderWiki();
}

function wikiSearch(q) {
  _wikiSearch = q;
  renderWiki();
}

// ── Chat Intendant IA ─────────────────────────────────────────────────────────
let _chatMessages = [];

function renderIAChat() {
  const el = $('page-content');
  el.innerHTML = `
    <div class="chat-container">
      <div class="chat-messages" id="chat-messages">
        <div class="chat-msg system"><div class="chat-msg-bubble">🏰 Bienvenue dans le salon privé de l'Intendant de la Compagnie du Fjord. Posez vos questions sur le stock, les commandes, le lore, les tarifs… L'Intendant connaît tout en temps réel.</div></div>
      </div>
      <div class="chat-input-row">
        <textarea class="chat-input" id="chat-input" placeholder="Écrivez votre message… (Entrée pour envoyer, Shift+Entrée pour saut de ligne)" rows="1"></textarea>
        <button class="btn" id="chat-send" onclick="chatSend()">Envoyer</button>
        <button class="btn btn-secondary" onclick="chatClear()" title="Effacer la mémoire">🗑️</button>
      </div>
    </div>`;

  const input = $('chat-input');
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatSend(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  // Remonter l'historique existant
  _chatMessages.forEach(m => chatAppend(m.role, m.content));
}

function chatAppend(role, content, loading = false) {
  const wrap = $('chat-messages');
  if (!wrap) return;
  const div = document.createElement('div');
  div.className = `chat-msg ${role === 'user' ? 'user' : 'bot'}`;
  if (loading) div.id = 'chat-loading';
  const avatar = role === 'user'
    ? `<img class="chat-msg-avatar" src="${window._me?.avatar || ''}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">`
    : `<div class="chat-msg-avatar">🏰</div>`;
  div.innerHTML = `${avatar}<div class="chat-msg-bubble">${loading ? '<div class="chat-typing"><span></span><span></span><span></span> L\'Intendant réfléchit…</div>' : escHtml(content)}</div>`;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

async function chatSend() {
  const input = $('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  input.style.height = 'auto';

  _chatMessages.push({ role: 'user', content: msg });
  chatAppend('user', msg);
  chatAppend('bot', '', true);
  $('chat-send').disabled = true;

  try {
    const data = await post('/api/ia/chat', { message: msg });
    const loading = $('chat-loading');
    if (loading) loading.remove();
    _chatMessages.push({ role: 'assistant', content: data.reponse });
    chatAppend('bot', data.reponse);
  } catch (e) {
    const loading = $('chat-loading');
    if (loading) loading.remove();
    chatAppend('bot', '❌ Erreur : ' + e.message);
  } finally {
    $('chat-send').disabled = false;
    $('chat-input')?.focus();
  }
}

async function chatClear() {
  if (!confirm('Effacer la mémoire conversationnelle ? L\'Intendant repartira de zéro.')) return;
  await fetch('/api/ia/history', { method: 'DELETE' });
  _chatMessages = [];
  renderIAChat();
  toast('Mémoire effacée');
}

// ── Analyse d'image ───────────────────────────────────────────────────────────
let _analyserFile = null;

function renderAnalyser() {
  const el = $('page-content');
  el.innerHTML = `
    <div style="max-width:700px;margin:0 auto">
      <div class="analyser-dropzone" id="analyser-drop" onclick="$('analyser-file').click()" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')" ondrop="analyserDrop(event)">
        <input type="file" id="analyser-file" accept="image/*" onchange="analyserSelect(this.files[0])">
        <div style="font-size:48px;margin-bottom:12px">🖼️</div>
        <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px">Déposez une image ou cliquez pour choisir</div>
        <div style="font-size:13px;color:var(--text-muted)">PNG, JPG, WEBP, GIF — Inventaires, cartes, screenshots Minecraft…</div>
      </div>
      <div class="analyser-preview" id="analyser-preview" style="display:none"></div>
      <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
        <input class="form-input" id="analyser-question" placeholder="Question sur l'image (optionnel) : ex. 'Quelles ressources me manquent ?'" style="flex:1;min-width:200px">
        <button class="btn" id="analyser-btn" onclick="analyserRun()" disabled>🔍 Analyser</button>
      </div>
      <div id="analyser-result" style="display:none" class="analyser-result"></div>
    </div>`;
}

function analyserDrop(e) {
  e.preventDefault();
  $('analyser-drop').classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file?.type.startsWith('image/')) analyserSelect(file);
}

function analyserSelect(file) {
  if (!file) return;
  _analyserFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    const preview = $('analyser-preview');
    preview.innerHTML = `<img src="${ev.target.result}" alt="preview">`;
    preview.style.display = 'flex';
  };
  reader.readAsDataURL(file);
  $('analyser-btn').disabled = false;
  $('analyser-drop').querySelector('div').textContent = file.name;
}

async function analyserRun() {
  if (!_analyserFile) return;
  const btn = $('analyser-btn');
  const res  = $('analyser-result');
  btn.disabled = true;
  btn.textContent = '⏳ Analyse en cours…';
  res.style.display = 'none';

  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(_analyserFile);
    });

    const data = await post('/api/ia/analyser', {
      imageBase64: base64,
      contentType: _analyserFile.type,
      question: $('analyser-question').value.trim() || null,
    });

    res.style.display = 'block';
    res.innerHTML = `<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">🔍 Analyse par LLaMA 3.2 90B Vision</div>${escHtml(data.reponse)}`;
  } catch (e) {
    res.style.display = 'block';
    res.textContent = '❌ Erreur : ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Analyser';
  }
}

// ── Négociation ───────────────────────────────────────────────────────────────
function renderNegocier() {
  const el = $('page-content');
  el.innerHTML = `
    <div style="max-width:600px;margin:0 auto">
      <p style="color:var(--text-muted);margin-bottom:20px">L'IA analyse une offre et donne un verdict tranché : <b>ACCEPTER</b>, <b>CONTRE-PROPOSER</b> ou <b>REFUSER</b>, basé sur le stock, les prix régionaux et l'historique des transactions.</p>
      <div class="form-grid" style="margin-bottom:12px">
        <div>
          <label class="form-label">Ressource</label>
          <input class="form-input" id="neg-ressource" placeholder="ex: Fer, Bois, Blé…">
        </div>
        <div>
          <label class="form-label">Quantité</label>
          <input class="form-input" id="neg-quantite" type="number" min="1" placeholder="100">
        </div>
        <div>
          <label class="form-label">Prix total proposé (🟤 bronze)</label>
          <input class="form-input" id="neg-prix" type="number" min="1" placeholder="400">
        </div>
        <div>
          <label class="form-label">Type de transaction</label>
          <select class="form-input" id="neg-type">
            <option value="achat">🛒 Achat (quelqu'un nous vend)</option>
            <option value="vente">💰 Vente (on vend à quelqu'un)</option>
          </select>
        </div>
      </div>
      <div style="margin-bottom:16px">
        <label class="form-label">Contexte supplémentaire (optionnel)</label>
        <input class="form-input" id="neg-contexte" placeholder="ex: urgent, client VIP, région Yuhang…">
      </div>
      <button class="btn" id="neg-btn" onclick="negocierRun()">🤝 Analyser l'offre</button>
      <div id="neg-result" style="display:none"></div>
    </div>`;
}

async function negocierRun() {
  const ressource = $('neg-ressource').value.trim();
  const quantite  = parseFloat($('neg-quantite').value);
  const prix      = parseInt($('neg-prix').value);
  const type      = $('neg-type').value;
  const contexte  = $('neg-contexte').value.trim();

  if (!ressource || !quantite || !prix) return toast('Remplissez tous les champs obligatoires', 'error');

  const btn = $('neg-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Analyse en cours…';

  try {
    const data = await post('/api/ia/negocier', { ressource, quantite, prix, type, contexte });
    const isAccept = /ACCEPTER/i.test(data.reponse);
    const isRefus  = /REFUSER/i.test(data.reponse);
    const cls  = isAccept ? 'accept' : isRefus ? 'refuse' : 'counter';
    const icon = isAccept ? '✅' : isRefus ? '❌' : '🔄';
    const prixU = data.prixUnitaire;
    const prixC = data.stockPrix;

    const res = $('neg-result');
    res.style.display = 'block';
    res.innerHTML = `
      <div class="negocier-result ${cls}">
        <div class="negocier-verdict">${icon} ${isAccept ? 'ACCEPTER' : isRefus ? 'REFUSER' : 'CONTRE-PROPOSER'}</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;font-size:13px;color:var(--text-muted)">
          <span>Prix proposé : <b>${prix}🟤</b> (${prixU}🟤/u)</span>
          ${prixC ? `<span>Prix catalogue : <b>${prixC}🟤/u</b></span>` : ''}
        </div>
        <div style="white-space:pre-wrap;font-size:14px;line-height:1.7">${escHtml(data.reponse)}</div>
      </div>`;
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🤝 Analyser l\'offre';
  }
}

// ── Bourse ────────────────────────────────────────────────────────────────────
function renderBourse() {
  const el = $('page-content');
  el.innerHTML = `
    <div style="max-width:500px;margin:0 auto">
      <div class="card" style="margin-bottom:24px">
        <h3 style="margin-bottom:16px">🔄 Convertir un montant</h3>
        <div style="display:flex;gap:10px;align-items:flex-end">
          <div style="flex:1">
            <label class="form-label">Montant en bronze 🟤</label>
            <input class="form-input" id="bourse-montant" type="number" min="0" placeholder="1250" oninput="bourseConvertir()">
          </div>
        </div>
        <div id="bourse-conv-result" style="margin-top:16px;display:none" class="bourse-result"></div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:16px">🧮 Calculer le prix d'un achat</h3>
        <div class="form-grid" style="margin-bottom:12px">
          <div class="field">
            <label>Ressource</label>
            <input id="bourse-ressource" placeholder="ex: Fer">
          </div>
          <div class="field">
            <label>Quantité</label>
            <input id="bourse-quantite" type="number" min="1" placeholder="50">
          </div>
        </div>
        <button class="btn" onclick="bourseCalculer()">Calculer</button>
        <div id="bourse-calc-result" style="margin-top:16px;display:none" class="bourse-result"></div>
      </div>
      <div class="card" style="margin-top:24px">
        <h3 style="margin-bottom:10px">📖 Rappel monétaire</h3>
        <div style="font-size:14px;color:var(--text-muted);line-height:2">
          🟤 1 Bronze = 1 écu (Vyldra)<br>
          ⚪ 1 Argent = 10 Bronze<br>
          🟡 1 Or = 100 Bronze = 10 Argent
        </div>
      </div>
    </div>`;
}

function bourseConvertir() {
  const montant = parseInt($('bourse-montant').value) || 0;
  const or     = Math.floor(montant / 100);
  const argent = Math.floor((montant % 100) / 10);
  const bronze = montant % 10;
  const res = $('bourse-conv-result');
  res.style.display = 'block';
  res.innerHTML = `${or > 0 ? or + ' 🟡' : ''} ${argent > 0 ? argent + ' ⚪' : ''} ${bronze > 0 ? bronze + ' 🟤' : ''}`.trim() || '0 🟤';
}

async function bourseCalculer() {
  const ressource = $('bourse-ressource').value.trim();
  const quantite  = $('bourse-quantite').value;
  if (!ressource || !quantite) return toast('Remplissez la ressource et la quantité', 'error');
  try {
    const d = await get(`/api/bourse/calculer?ressource=${encodeURIComponent(ressource)}&quantite=${quantite}`);
    const res = $('bourse-calc-result');
    res.style.display = 'block';
    res.innerHTML = `<div style="font-size:14px;color:var(--text-muted);margin-bottom:8px">${quantite}× ${ressource} à ${d.prix_unitaire}🟤/${d.unite}</div>${d.or > 0 ? d.or + ' 🟡 ' : ''}${d.argent > 0 ? d.argent + ' ⚪ ' : ''}${d.bronze > 0 ? d.bronze + ' 🟤' : ''} <span style="font-size:16px;color:var(--text-muted)">(${d.total}🟤)</span>`;
  } catch (e) { toast(e.message, 'error'); }
}

// ── Contrats ──────────────────────────────────────────────────────────────────
let _contratFiltre = 'ouverts';

const STATUT_LABEL = { ouvert:'📢 Ouvert', accepte:'🤝 Accepté', en_cours:'⚒️ En cours', livre:'✅ Livré', expire:'⌛ Expiré', annule:'❌ Annulé', litige:'⚠️ Litige' };
const STATUT_CLASS = { ouvert:'ouvert', accepte:'accepte', en_cours:'en_cours', livre:'livre', expire:'expire', annule:'annule', litige:'litige' };

async function renderContrats() {
  const el = $('page-content');
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:20px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${[['ouverts','📢 Ouverts'],['miens','👤 Mes contrats'],['all','📋 Tous']].map(([f,l]) =>
          `<button class="wiki-filter${_contratFiltre===f?' active':''}" onclick="contratSetFiltre('${f}')">${l}</button>`
        ).join('')}
      </div>
      <button class="btn" onclick="contratShowForm()">+ Nouveau contrat</button>
    </div>
    <div id="contrat-form" style="display:none" class="card" style="margin-bottom:20px"></div>
    <div id="contrats-list"><div class="loading">Chargement…</div></div>`;

  contratLoad();
}

async function contratLoad() {
  const url = _contratFiltre === 'all' ? '/api/contrats/all' : `/api/contrats?filtre=${_contratFiltre}`;
  const rows = await get(url).catch(() => []);
  const el = $('contrats-list');
  if (!rows.length) { el.innerHTML = '<div class="empty-state">Aucun contrat.</div>'; return; }

  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">` +
    rows.map(c => {
      const ech = new Date(c.echeance_le.replace(' ','T')+'Z');
      const ts  = Math.floor(ech.getTime()/1000);
      const isMe = c.vendeur_id === window._me?.id || c.acheteur_id === window._me?.id;
      return `
        <div class="contrat-card">
          <div class="contrat-card-header">
            <span class="contrat-id">#${String(c.id).padStart(4,'0')}</span>
            <span class="contrat-statut statut-${STATUT_CLASS[c.statut]??'ouvert'}">${STATUT_LABEL[c.statut]??c.statut}</span>
          </div>
          <div class="contrat-ressource">${c.ressource} ×${c.quantite} ${c.unite}</div>
          <div class="contrat-meta">
            <span>💰 <b>${c.prix_total}🟤</b></span>
            <span>📅 Échéance : <b>${ech.toLocaleDateString('fr-FR')}</b></span>
            ${c.penalite > 0 ? `<span>⚠️ Pénalité : ${c.penalite}🟤</span>` : ''}
          </div>
          <div style="font-size:13px;color:var(--text-muted)">Vendeur : <b>${c.vendeur_pseudo}</b>${c.acheteur_pseudo ? ` · Acheteur : <b>${c.acheteur_pseudo}</b>` : ' · <i>Non accepté</i>'}</div>
          ${c.note ? `<div style="font-size:12px;color:var(--text-muted);font-style:italic">"${c.note}"</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
            ${c.statut === 'ouvert' && c.vendeur_id !== window._me?.id ? `<button class="btn btn-sm" onclick="contratAccepter(${c.id})">🤝 Accepter</button>` : ''}
            ${isMe && ['ouvert','accepte','en_cours'].includes(c.statut) ? `
              <select class="form-input" style="font-size:12px;padding:4px 8px;height:auto" onchange="contratStatut(${c.id},this.value);this.value=''">
                <option value="">Changer statut…</option>
                ${c.statut === 'accepte' || c.statut === 'ouvert' ? '<option value="en_cours">⚒️ En cours</option>' : ''}
                <option value="livre">✅ Livré</option>
                <option value="annule">❌ Annuler</option>
                <option value="litige">⚠️ Litige</option>
              </select>` : ''}
          </div>
        </div>`;
    }).join('') + '</div>';
}

function contratSetFiltre(f) {
  _contratFiltre = f;
  renderContrats();
}

function contratShowForm() {
  const f = $('contrat-form');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
  if (f.style.display === 'none') return;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+3);
  f.innerHTML = `
    <h3 style="margin-bottom:16px">📜 Nouveau contrat</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div><label class="form-label">Ressource</label><input class="form-input" id="cf-ressource" placeholder="Fer, Bois…"></div>
      <div><label class="form-label">Quantité</label><input class="form-input" id="cf-quantite" type="number" min="1"></div>
      <div><label class="form-label">Prix total (🟤)</label><input class="form-input" id="cf-prix" type="number" min="1"></div>
      <div><label class="form-label">Unité</label><input class="form-input" id="cf-unite" value="Unité"></div>
      <div><label class="form-label">Échéance</label><input class="form-input" id="cf-echeance" type="datetime-local" value="${tomorrow.toISOString().slice(0,16)}"></div>
      <div><label class="form-label">Pénalité de retard (🟤)</label><input class="form-input" id="cf-penalite" type="number" min="0" value="0"></div>
    </div>
    <div style="margin-bottom:12px"><label class="form-label">Note / conditions</label><input class="form-input" id="cf-note" placeholder="Conditions particulières…"></div>
    <div style="display:flex;gap:8px">
      <button class="btn" onclick="contratCreer()">Créer le contrat</button>
      <button class="btn btn-secondary" onclick="$('contrat-form').style.display='none'">Annuler</button>
    </div>`;
}

async function contratCreer() {
  const ressource  = $('cf-ressource').value.trim();
  const quantite   = parseFloat($('cf-quantite').value);
  const prix_total = parseInt($('cf-prix').value);
  const unite      = $('cf-unite').value.trim() || 'Unité';
  const echeance   = $('cf-echeance').value;
  const penalite   = parseInt($('cf-penalite').value) || 0;
  const note       = $('cf-note').value.trim();

  if (!ressource || !quantite || !prix_total || !echeance) return toast('Remplissez tous les champs obligatoires', 'error');

  try {
    await post('/api/contrats', { ressource, quantite, unite, prix_total, penalite, note, echeance_le: echeance.replace('T',' ') });
    toast('Contrat créé !');
    $('contrat-form').style.display = 'none';
    contratLoad();
  } catch (e) { toast(e.message, 'error'); }
}

async function contratAccepter(id) {
  try {
    await put(`/api/contrats/${id}/accepter`, {});
    toast('Contrat accepté !');
    contratLoad();
  } catch (e) { toast(e.message, 'error'); }
}

async function contratStatut(id, statut) {
  if (!statut) return;
  try {
    await put(`/api/contrats/${id}/statut`, { statut });
    toast('Statut mis à jour');
    contratLoad();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Wiki Modal ────────────────────────────────────────────────────────────────
function wikiModalOpen(idx) {
  const e = WIKI_ENTRIES[idx];
  if (!e) return;
  const tagColors = { bot:'rgba(88,101,242,.2)', ia:'rgba(87,242,135,.2)', web:'rgba(255,165,0,.2)', admin:'rgba(237,66,69,.2)' };
  const tagText   = { bot:'#7289da', ia:'#57f287', web:'#ffa500', admin:'#ed4245' };

  const optionsHtml = e.options?.length ? `
    <div class="wiki-modal-section">
      <h4>Options & détails</h4>
      <table class="wiki-modal-options">${e.options.map(([k,v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
    </div>` : '';

  const usageHtml = e.usage ? `
    <div class="wiki-modal-section">
      <h4>Utilisation</h4>
      ${e.usage.split('|').map(u => `<div class="wiki-modal-usage">${u.trim()}</div>`).join('')}
    </div>` : '';

  const noteHtml = e.note ? `<div class="wiki-modal-note">💡 ${e.note}</div>` : '';

  $('wiki-modal-body').innerHTML = `
    <div class="wiki-modal-icon">${e.icon}</div>
    <div class="wiki-modal-title">${e.title}</div>
    <span class="wiki-modal-tag" style="background:${tagColors[e.tagClass]||'rgba(201,168,76,.2)'};color:${tagText[e.tagClass]||'var(--accent)'}">${e.tag}</span>
    <div class="wiki-modal-desc">${e.desc}</div>
    ${usageHtml}
    ${optionsHtml}
    ${noteHtml}`;

  $('wiki-modal-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function wikiModalClose(e) {
  if (e && e.target !== $('wiki-modal-overlay')) return;
  $('wiki-modal-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

// ── MODIFIER ──────────────────────────────────────────────────────────────────
let _modifierPollTimer = null;
let _modifierRefreshTimer = null;

function modifierStatusLabel(status) {
  const map = {
    pending:    ['badge-attente', '⏳ En attente'],
    processing: ['badge-cours',   '🔄 Traitement…'],
    ready:      ['badge-prete',   '📋 En attente de validation'],
    applied:    ['badge-livree',  '✅ Appliquée'],
    refused:    ['badge-annulee', '❌ Refusée'],
    error:      ['badge-annulee', '⚠️ Erreur'],
  };
  const [cls, label] = map[status] ?? ['badge-attente', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

async function renderModifier() {
  if (_modifierRefreshTimer) clearInterval(_modifierRefreshTimer);
  _modifierRefreshTimer = null;

  $('page-content').innerHTML = `
  <div style="max-width:820px;margin:0 auto">
    <div class="card" style="margin-bottom:24px">
      <div class="card-title">📝 Soumettre une demande</div>
      <p style="color:var(--text-dim);font-size:13px;margin:0 0 16px">
        Décrivez la modification souhaitée. L'agent IA analysera le code et proposera les changements.
        Toute modification nécessite une validation de l'administrateur avant d'être appliquée.
      </p>
      <textarea id="mod-desc" rows="5" placeholder="Ex: Ajoute une commande /ping qui répond avec la latence du bot…"
        style="width:100%;box-sizing:border-box;background:var(--glass);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:12px;font-size:14px;resize:vertical;font-family:inherit"></textarea>
      <div style="margin-top:12px;display:flex;align-items:center;gap:12px">
        <button class="btn btn-primary" onclick="submitModifier()">🚀 Envoyer la demande</button>
        <span id="mod-submit-status" style="font-size:13px;color:var(--text-dim)"></span>
      </div>
    </div>

    <div id="mod-active-card" style="display:none" class="card" style="margin-bottom:24px">
      <div class="card-title">🔄 Demande en cours</div>
      <div id="mod-active-content"></div>
    </div>

    <div class="card">
      <div class="card-title">📋 Historique des demandes</div>
      <div id="mod-list"><div class="empty"><div class="spinner"></div></div></div>
    </div>
  </div>`;

  await loadModifierList();
  // Rafraîchissement auto toutes les 8s pour refléter les actions Discord
  _modifierRefreshTimer = setInterval(() => {
    if (currentPage !== 'modifier') { clearInterval(_modifierRefreshTimer); _modifierRefreshTimer = null; return; }
    loadModifierList();
  }, 8000);
}

async function loadModifierList() {
  const el = $('mod-list');
  if (!el) return;
  try {
    const data = await get('/api/modifier');
    if (!data) return;
    if (!data.length) {
      el.innerHTML = '<div class="empty" style="padding:24px">Aucune demande pour l\'instant.</div>';
      return;
    }
    el.innerHTML = data.map(r => `
      <div class="mod-row" style="border-bottom:1px solid var(--border);padding:16px 0;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          ${modifierStatusLabel(r.status)}
          <span style="font-weight:600;font-size:14px">#${r.id} — ${escHtml(r.requester_name)}</span>
          <span style="color:var(--text-dim);font-size:12px;margin-left:auto">${r.created_at?.slice(0,16).replace('T',' ')}</span>
        </div>
        <div style="color:var(--text);font-size:13px;background:var(--glass);border-radius:8px;padding:10px">${escHtml(r.description)}</div>
        ${r.diff_preview ? `<div style="color:var(--text-dim);font-size:12px;white-space:pre-line;background:var(--glass);border-radius:8px;padding:10px;border-left:3px solid var(--accent)">${escHtml(r.diff_preview)}</div>` : ''}
        ${r.error_msg ? `<div style="color:#f87171;font-size:12px;padding:8px 10px;background:rgba(248,113,113,0.08);border-radius:8px">⚠️ ${escHtml(r.error_msg)}</div>` : ''}
        ${window._isAdmin && r.status === 'ready' ? `
          <div style="display:flex;gap:8px;margin-top:4px">
            <button class="btn btn-primary" style="font-size:12px;padding:6px 14px" onclick="approveModifier(${r.id})">✅ Approuver & Appliquer</button>
            <button class="btn" style="font-size:12px;padding:6px 14px;background:rgba(248,113,113,0.15);color:#f87171;border-color:rgba(248,113,113,0.3)" onclick="refuseModifier(${r.id})">❌ Refuser</button>
          </div>` : ''}
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty" style="padding:24px;color:#f87171">Erreur : ${escHtml(e.message)}</div>`;
  }
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function submitModifier() {
  const desc = $('mod-desc')?.value?.trim();
  if (!desc) { toast('Décrivez votre demande avant d\'envoyer.', 'err'); return; }
  const status = $('mod-submit-status');
  if (status) status.textContent = '⏳ Envoi…';

  try {
    const data = await post('/api/modifier', { description: desc });
    if (!data) return;
    if ($('mod-desc')) $('mod-desc').value = '';
    if (status) status.textContent = '';
    toast('Demande envoyée — traitement en cours…');
    showModifierPolling(data.id);
    loadModifierList();
  } catch (e) {
    if (status) status.textContent = '';
    toast(e.message, 'err');
  }
}

function showModifierPolling(id) {
  const card = $('mod-active-card');
  const content = $('mod-active-content');
  if (!card || !content) return;
  card.style.display = 'block';

  if (_modifierPollTimer) clearInterval(_modifierPollTimer);

  const update = async () => {
    try {
      const d = await get(`/api/modifier/${id}/status`);
      if (!d) return;
      content.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          ${modifierStatusLabel(d.status)}
          <span style="font-size:13px;color:var(--text-dim)">Demande #${id}</span>
        </div>
        ${d.diff_preview ? `<div style="white-space:pre-line;font-size:13px;background:var(--glass);border-radius:8px;padding:12px;border-left:3px solid var(--accent)">${escHtml(d.diff_preview)}</div>` : '<div style="color:var(--text-dim);font-size:13px">L\'agent IA analyse votre demande…</div>'}
        ${d.error_msg ? `<div style="color:#f87171;font-size:12px;margin-top:8px">⚠️ ${escHtml(d.error_msg)}</div>` : ''}`;

      if (['applied','refused','error'].includes(d.status)) {
        clearInterval(_modifierPollTimer);
        _modifierPollTimer = null;
        setTimeout(() => { if (card) card.style.display = 'none'; }, 4000);
        loadModifierList();
      }
    } catch {}
  };

  update();
  _modifierPollTimer = setInterval(update, 3000);
}

async function approveModifier(id) {
  if (!confirm(`Approuver et appliquer la demande #${id} ?`)) return;
  try {
    const d = await post(`/api/modifier/${id}/approve`, {});
    if (!d) return;
    toast(`✅ Demande #${id} appliquée — ${d.files?.length ?? 0} fichier(s) modifié(s)`);
    loadModifierList();
  } catch (e) { toast(e.message, 'err'); }
}

async function refuseModifier(id) {
  if (!confirm(`Refuser la demande #${id} ?`)) return;
  try {
    await post(`/api/modifier/${id}/refuse`, {});
    toast(`Demande #${id} refusée.`);
    loadModifierList();
  } catch (e) { toast(e.message, 'err'); }
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') wikiModalClose(); });
