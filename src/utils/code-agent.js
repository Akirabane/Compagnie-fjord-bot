/**
 * code-agent.js — Agent de modification de code via claude -p
 * Reçoit une demande en langage naturel, envoie le contexte du projet à Claude,
 * parse la réponse, applique les changements après validation humaine.
 */
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db, { stmts } from '../db/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..', '..');

// Tous les fichiers du projet avec leurs tags de pertinence
const ALL_FILES = [
  { path: 'src/index.js',              tags: ['bot','discord','commande','command','button','interaction','index','event','handler'] },
  { path: 'src/db/database.js',        tags: ['db','database','sql','table','schema','stmt','stock','commandes'] },
  { path: 'src/utils/embeds.js',       tags: ['embed','couleur','color','message','discord'] },
  { path: 'src/utils/setup.js',        tags: ['setup','channel','guild','config','owner','role','id'] },
  { path: 'src/utils/ia.js',           tags: ['ia','intendant','gpt','openai','claude','chat','ai','bot'] },
  { path: 'src/utils/alertes.js',      tags: ['alerte','alert','seuil','stock','monitoring'] },
  { path: 'src/utils/monnaie.js',      tags: ['monnaie','bronze','or','argent','prix','conversion'] },
  { path: 'src/commands/commander.js', tags: ['commander','commande','achat','order','client'] },
  { path: 'src/commands/commandes.js', tags: ['commandes','order','statut','livraison','traitement'] },
  { path: 'src/commands/stock.js',     tags: ['stock','inventaire','ressource','quantite'] },
  { path: 'src/commands/catalogue.js', tags: ['catalogue','produit','liste','vente'] },
  { path: 'src/commands/prix.js',      tags: ['prix','tarif','region','marché','cout'] },
  { path: 'src/commands/marche.js',    tags: ['marche','marché','variation','cours','bourse'] },
  { path: 'src/commands/inventaire.js',tags: ['inventaire','stock','ia','analyse'] },
  { path: 'src/commands/analyser.js',  tags: ['analyser','image','vision','analyse','ia'] },
  { path: 'src/commands/negocier.js',  tags: ['negocier','négocier','contrat','offre','accord'] },
  { path: 'src/commands/contrat.js',   tags: ['contrat','accord','engagement','terme'] },
  { path: 'src/commands/recap.js',     tags: ['recap','récap','résumé','summary','rapport'] },
  { path: 'src/commands/annonce.js',   tags: ['annonce','announce','message','channel','embed','post'] },
  { path: 'src/commands/bourse.js',    tags: ['bourse','conversion','monnaie','taux','calcul'] },
  { path: 'src/commands/tarifs.js',    tags: ['tarif','prix','officiel','service','metier'] },
  { path: 'src/commands/roles.js',     tags: ['role','rôle','permission','membre','rang'] },
  { path: 'src/commands/forum.js',     tags: ['forum','post','thread','acheteur','vendeur'] },
  { path: 'src/commands/alertes.js',   tags: ['alerte','alert','seuil','notification'] },
  { path: 'web/server.js',             tags: ['web','server','api','route','express','http','webapp'] },
  { path: 'web/public/app.js',         tags: ['webapp','frontend','ui','page','render','nav','dashboard'] },
  { path: 'web/public/index.html',     tags: ['html','css','style','sidebar','nav','frontend','webapp'] },
];

// Fichiers toujours inclus (petit + essentiels pour comprendre la structure)
const ALWAYS_INCLUDE = ['src/utils/embeds.js', 'src/utils/setup.js', 'src/utils/monnaie.js'];

function selectFiles(description) {
  const lower = description.toLowerCase();
  const words = lower.split(/\s+/);

  const scored = ALL_FILES.map(f => {
    let score = ALWAYS_INCLUDE.includes(f.path) ? 1 : 0;
    for (const tag of f.tags) {
      if (lower.includes(tag)) score += 2;
    }
    // Boost fichiers nommés explicitement
    const name = f.path.split('/').pop().replace('.js','').replace('.html','');
    if (lower.includes(name)) score += 5;
    return { ...f, score };
  });

  // Toujours inclus + top pertinents, max ~40k chars total
  const selected = [];
  let totalChars = 0;
  const MAX_CHARS = 60_000;

  // Tri: score desc, puis alphabétique
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  for (const f of scored) {
    if (f.score === 0) continue;
    try {
      const content = readFileSync(join(ROOT, f.path), 'utf8');
      if (totalChars + content.length > MAX_CHARS && f.score < 3) continue;
      selected.push({ path: f.path, content });
      totalChars += content.length;
      if (totalChars >= MAX_CHARS) break;
    } catch {}
  }

  return selected;
}

function readFile(relPath) {
  try { return readFileSync(join(ROOT, relPath), 'utf8'); }
  catch { return null; }
}

function buildPrompt(description) {
  const files = selectFiles(description);
  let context = '';
  for (const f of files) {
    context += `\n\n=== FILE: ${f.path} ===\n${f.content}`;
  }

  return `Tu es l'agent IA de "La Compagnie du Fjord" (bot Discord + webapp Node.js).
Tu peux SOIT modifier le code, SOIT effectuer des actions directes sur Discord, SOIT les deux.

Un membre autorisé a soumis cette demande :
"""
${description}
"""

Voici les fichiers source pertinents du projet :
${context}

INSTRUCTIONS STRICTES :
- Réponds UNIQUEMENT avec un bloc \`\`\`json ... \`\`\` — zéro texte avant, zéro texte après.
- N'écris aucune phrase d'introduction ni de conclusion.

Format obligatoire (tous les champs sont optionnels sauf "summary") :

\`\`\`json
{
  "summary": "Description courte de ce qui va être fait",
  "changes": [
    {
      "file": "chemin/relatif/du/fichier.js",
      "content": "contenu COMPLET du fichier après modification"
    }
  ],
  "actions": [
    {
      "type": "send_message",
      "channel_id": "ID_DU_CHANNEL",
      "content": "Texte du message"
    }
  ],
  "restart": ["bot", "web"]
}
\`\`\`

Types d'actions disponibles :
- \`send_message\` : envoie un message texte dans un channel Discord (champs: channel_id, content)
- \`send_embed\` : envoie un embed dans un channel (champs: channel_id, title, description, color (hex int), fields: [{name, value}])
- \`delete_messages\` : supprime les N derniers messages du bot dans un channel (champs: channel_id, limit)

Si "changes" est vide ou absent : seulement des actions. Si "actions" est vide ou absent : seulement du code.
"restart" : "bot" = id 23, "web" = id 25. Mettre uniquement les processus dont les fichiers ont été modifiés.
Si la demande est impossible, ambiguë ou dangereuse :
\`\`\`json
{"error": "explication courte"}
\`\`\``;
}

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const tmpFile = join(ROOT, 'data', '_agent_prompt.txt');
    writeFileSync(tmpFile, prompt, 'utf8');

    // On passe le prompt via stdin pour éviter les problèmes de longueur d'argument
    const proc = spawn('claude', ['-p', '--dangerously-skip-permissions', prompt.slice(0, 200) + '...'], {
      cwd: ROOT,
      env: { ...process.env, HOME: process.env.HOME },
      timeout: 120_000,
    });

    // Utiliser stdin pour passer le prompt complet
    const proc2 = spawn('claude', ['-p'], {
      cwd: ROOT,
      env: { ...process.env, HOME: process.env.HOME },
    });

    let stdout = '';
    let stderr = '';
    proc2.stdout.on('data', d => { stdout += d; });
    proc2.stderr.on('data', d => { stderr += d; });
    proc2.stdin.write(prompt);
    proc2.stdin.end();

    proc2.on('close', code => {
      proc.kill('SIGTERM');
      if (!stdout && stderr) return reject(new Error(stderr.slice(0, 500)));
      resolve(stdout);
    });

    proc2.on('error', err => {
      proc.kill('SIGTERM');
      reject(err);
    });

    setTimeout(() => {
      proc2.kill('SIGTERM');
      reject(new Error('Timeout : Claude -p n\'a pas répondu dans les 2 minutes.'));
    }, 120_000);
  });
}

function callClaudeSimple(prompt) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const proc = spawn('claude', ['-p'], {
      cwd: ROOT,
      env: { ...process.env, HOME: process.env.HOME },
    });

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.stdin.write(prompt);
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Timeout : Claude -p n\'a pas répondu dans les 5 minutes.'));
    }, 300_000);

    proc.on('close', code => {
      clearTimeout(timer);
      if (!stdout.trim() && stderr.trim()) return reject(new Error(stderr.slice(0, 500)));
      resolve(stdout);
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function parseClaudeOutput(raw) {
  // Extrait le bloc JSON de la réponse
  const match = raw.match(/```json\s*([\s\S]*?)```/);
  if (!match) {
    // Essaie de trouver un JSON direct
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Réponse Claude non parseable : aucun bloc JSON trouvé.');
    return JSON.parse(jsonMatch[0]);
  }
  return JSON.parse(match[1].trim());
}

function normalizeChange(c) {
  // Claude parfois retourne "code" ou "new_content" au lieu de "content"
  return {
    file:    c.file    || c.path || '',
    content: c.content || c.code || c.new_content || c.newContent || '',
  };
}

function buildDiffPreview(parsed) {
  if (parsed.error) return `❌ Refus : ${parsed.error}`;
  let preview = `📋 **${parsed.summary}**\n\n`;

  if (parsed.changes?.length) {
    preview += `**Fichiers modifiés :**\n`;
    for (const raw of parsed.changes) {
      const c = normalizeChange(raw);
      const existing = readFile(c.file);
      const lines    = existing ? existing.split('\n').length : 0;
      const newLines = c.content ? c.content.split('\n').length : 0;
      preview += `• \`${c.file}\` (${lines} → ${newLines} lignes)\n`;
    }
  }

  if (parsed.actions?.length) {
    preview += `\n**Actions Discord :**\n`;
    for (const a of parsed.actions) {
      if (a.type === 'send_message')   preview += `• 💬 Message dans <#${a.channel_id}> : "${(a.content||'').slice(0,80)}"\n`;
      if (a.type === 'send_embed')     preview += `• 📋 Embed dans <#${a.channel_id}> : "${a.title||''}"\n`;
      if (a.type === 'delete_messages') preview += `• 🗑️ Supprime ${a.limit||10} messages bot dans <#${a.channel_id}>\n`;
    }
  }

  if (parsed.restart?.length) {
    preview += `\n🔄 **Redémarrage :** ${parsed.restart.join(', ')}`;
  }
  return preview;
}

function backupFiles(changes) {
  const backupDir = join(ROOT, 'data', 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(backupDir, { recursive: true });
  for (const raw of changes) {
    const c = normalizeChange(raw);
    if (!c.file) continue;
    const src = join(ROOT, c.file);
    if (!existsSync(src)) continue;
    const dest = join(backupDir, c.file.replace(/\//g, '__'));
    writeFileSync(dest, readFileSync(src));
  }
  return backupDir;
}

function applyChanges(parsed) {
  const backupDir = backupFiles(parsed.changes);

  for (const raw of parsed.changes) {
    const c = normalizeChange(raw);
    if (!c.file || !c.content) continue;
    const dest = join(ROOT, c.file);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, c.content, 'utf8');
  }

  return backupDir;
}

function restartProcesses(parsed) {
  return new Promise((resolve) => {
    const toRestart = [];
    if (parsed.restart?.includes('bot')) toRestart.push('23');
    if (parsed.restart?.includes('web')) toRestart.push('25');
    if (!toRestart.length) return resolve([]);

    const proc = spawn('pm2', ['restart', ...toRestart], {
      env: { ...process.env },
    });
    proc.on('close', () => resolve(toRestart));
    proc.on('error', () => resolve([]));
  });
}

// ── API publique ──────────────────────────────────────────────────────────────

export async function processRequest(requestId) {
  const req = stmts.codeReqGet.get(requestId);
  if (!req) throw new Error('Demande introuvable');

  stmts.codeReqUpdate.run('processing', null, null, requestId);

  let raw = '';
  try {
    const prompt = buildPrompt(req.description);
    raw          = await callClaudeSimple(prompt);
    const parsed = parseClaudeOutput(raw);
    // Normalise les changes pour garantir {file, content} cohérents en BDD
    if (parsed.changes) parsed.changes = parsed.changes.map(normalizeChange);
    const diff   = buildDiffPreview(parsed);

    stmts.codeReqUpdate.run(
      parsed.error ? 'error' : 'ready',
      JSON.stringify(parsed),
      diff,
      requestId
    );

    return { parsed, diff, hasError: !!parsed.error };
  } catch (err) {
    // Stocke le raw output pour faciliter le debug
    const detail = raw ? `${err.message}\n\nRaw output:\n${raw.slice(0, 800)}` : err.message;
    stmts.codeReqResolve.run('error', null, detail, requestId);
    throw err;
  }
}

export async function approveRequest(requestId, approverName) {
  const req = stmts.codeReqGet.get(requestId);
  if (!req) throw new Error('Demande introuvable');
  if (req.status !== 'ready') throw new Error(`Statut invalide : ${req.status}`);

  const parsed = JSON.parse(req.claude_output);
  if (parsed.error) throw new Error('Impossible d\'approuver une demande en erreur.');

  let backupDir = null;
  let restarted = [];

  if (parsed.changes?.length) {
    backupDir = applyChanges(parsed);
    restarted = await restartProcesses(parsed);
  }

  stmts.codeReqResolve.run('applied', approverName, null, requestId);

  return {
    backupDir,
    restarted,
    summary:  parsed.summary,
    files:    (parsed.changes || []).map(c => c.file),
    actions:  parsed.actions || [],
  };
}

export async function executeActions(actions, client) {
  for (const action of actions) {
    try {
      const channel = await client.channels.fetch(action.channel_id).catch(() => null);
      if (!channel) continue;

      if (action.type === 'send_message') {
        await channel.send({ content: action.content });
      } else if (action.type === 'send_embed') {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setTitle(action.title || '')
          .setDescription(action.description || '')
          .setColor(action.color ?? 0xC9A84C);
        if (action.fields?.length) embed.addFields(action.fields);
        await channel.send({ embeds: [embed] });
      } else if (action.type === 'delete_messages') {
        const msgs = await channel.messages.fetch({ limit: action.limit || 10 });
        for (const [, msg] of msgs) {
          if (msg.author.id === client.user.id) await msg.delete().catch(() => {});
        }
      }
    } catch (e) {
      console.error('[code-agent] action error:', e.message);
    }
  }
}

export function refuseRequest(requestId, refuserName) {
  stmts.codeReqResolve.run('refused', refuserName, null, requestId);
}

// Stocke des actions dans la queue pour exécution par le bot (appelé depuis la webapp)
export function storePendingActions(actions) {
  if (!actions?.length) return;
  stmts.actionQueueInsert.run(JSON.stringify(actions));
}

// Draine et exécute toutes les actions en attente dans la queue
export async function drainActionQueue(client) {
  const rows = stmts.actionQueueAll.all();
  for (const row of rows) {
    stmts.actionQueueDelete.run(row.id);
    try {
      const actions = JSON.parse(row.actions);
      await executeActions(actions, client);
    } catch (e) {
      console.error('[code-agent] drain error:', e.message);
    }
  }
}

export function createRequest(requesterId, requesterName, description) {
  stmts.codeReqInsert.run(requesterId, requesterName, description);
  return db.prepare('SELECT last_insert_rowid() as id').get().id;
}
