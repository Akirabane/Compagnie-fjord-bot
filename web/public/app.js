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
function showLogin() { $('app').style.display = 'none'; $('login-screen').style.display = 'flex'; }
function showApp()   { $('login-screen').style.display = 'none'; $('app').style.display = 'flex'; }
async function logout() { await fetch('/auth/logout', { method: 'POST' }); showLogin(); }

// ── Router ────────────────────────────────────────────────────────────────────
const PAGES = {
  dashboard:  { title: '📊 Tableau de bord',   render: renderDashboard },
  tarifs:     { title: '⚖️ Tarifs officiels',     render: renderTarifs },
  logs:       { title: '📜 Journaux d\'activité', render: renderLogs },
  stock:      { title: '📦 Stock',             render: renderStock },
  prix:       { title: '💰 Prix en temps réel', render: renderPrix },
  commandes:  { title: '📋 Commandes',          render: renderCommandes },
  offres:     { title: '🛒 Offres de vente',    render: renderOffres },
  tresorerie: { title: '🏦 Trésorerie',         render: renderTresorerie },
  recettes:   { title: '📖 Recettes',           render: renderRecettes },
  ia:         { title: '🤖 Intendant IA',       render: renderIA },
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
  PAGES[page].render();
}
document.querySelectorAll('.nav-item').forEach(el =>
  el.addEventListener('click', () => navigate(el.dataset.page)));

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
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:520px">
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

  <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-bottom:20px">
    <div class="chart-card">
      <div class="chart-header"><span>📈 Revenus des 30 derniers jours</span></div>
      <div class="chart-body"><canvas id="c-ventes"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-header"><span>📋 Commandes par statut</span></div>
      <div class="chart-body"><canvas id="c-statuts"></canvas></div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
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
  <div style="display:grid;grid-template-columns:1fr 2fr;gap:20px;margin-bottom:20px">
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
  try {
    await put(`/api/stock/${id}`, { en_vente: newVal });
    btn.className = `vente-pill ${newVal ? 'on' : 'off'}`;
    btn.textContent = newVal ? '🟢 En vente' : '🔴 Masqué';
    toast('Mis à jour');
  } catch(e) { toast(e.message, 'error'); }
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
let cmdFiltre = 'actives', cmdSearch = '';
async function renderCommandes(){
  $('topbar-actions').innerHTML = `
    <a class="btn btn-ghost btn-sm" href="/api/commandes/export.csv" download>⬇ Export CSV</a>
    <button class="btn btn-primary" onclick="openNewCommande()">+ Nouvelle commande</button>`;
  await loadCommandes();
}

async function loadCommandes(){
  const params = new URLSearchParams({ statut:cmdFiltre });
  if (cmdSearch) params.set('q', cmdSearch);
  const rows = await get(`/api/commandes?${params}`);
  if (!rows) return;

  const STATUTS = [
    {value:'actives',label:'🔄 Actives'},{value:'all',label:'📜 Toutes'},
    {value:'en_attente',label:'⏳ En attente'},{value:'en_cours',label:'⚒️ En cours'},
    {value:'prete',label:'📦 Prêtes'},{value:'livree',label:'✅ Livrées'},{value:'annulee',label:'❌ Annulées'},
  ];
  const tabs = STATUTS.map(s=>`<button class="btn btn-sm ${s.value===cmdFiltre?'btn-primary':'btn-ghost'}" onclick="cmdFiltre='${s.value}';loadCommandes()">${s.label}</button>`).join('');

  $('page-content').innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${tabs}</div>
    <div class="filter-bar" style="margin-bottom:14px">
      <div class="search-box" style="flex:1;min-width:220px">
        <input placeholder="Rechercher client, ressource…" value="${cmdSearch}"
          oninput="cmdSearch=this.value;clearTimeout(window._ct);window._ct=setTimeout(loadCommandes,280)">
      </div>
      <span style="color:var(--text-dim);font-size:12px;align-self:center">${rows.length} commande${rows.length>1?'s':''}</span>
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
        <tbody>${applySort('commandes', rows).length ? applySort('commandes', rows).map(r=>`
          <tr>
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
    </div>`;
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
  const me = await fetch('/api/me').then(r => r.ok ? r.json() : null);

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
  $('user-avatar').src  = me.avatar;
  $('user-name').textContent = me.nick;
  showApp();
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
