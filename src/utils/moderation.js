import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import db from '../db/database.js';

const execFileAsync = promisify(execFile);
const NVIDIA_API_KEY = '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';
const BASE_URL       = 'https://integrate.api.nvidia.com/v1';
const MODEL_8B       = 'meta/llama-3.1-8b-instruct';

// ── Normalisation ─────────────────────────────────────────────────────────────
// Gère accents, l33tspeak, caractères spéciaux, espaces multiples
function normalize(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // accents → base
    .replace(/[€3]/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/0/g,    'o')
    .replace(/[1!]/g, 'i')
    .replace(/[$5]/g, 's')
    .replace(/[^a-z0-9\s']/g, ' ')                      // ponctuation → espace
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Bibliothèque en mémoire ───────────────────────────────────────────────────
const wordsTier1   = new Set(); // mots seuls → suppression immédiate
const phrasesTier1 = [];        // phrases multi-mots → suppression immédiate
const wordsTier2   = new Set(); // mots suspects → IA si message >10 mots
const phrasesTier2 = [];        // phrases suspects → IA si message >10 mots
let   whitelist    = new Set(); // termes toujours autorisés

// ── Seed : ~600 termes ────────────────────────────────────────────────────────
// [terme, tier, categorie]
const SEED = [
  // ══════════════════════════════════════════════════════════════════
  // TIER 1 — Suppression directe
  // ══════════════════════════════════════════════════════════════════

  // — Famille CONNARD —
  ['connard',1,'insulte'], ['connarde',1,'insulte'], ['connards',1,'insulte'], ['connardes',1,'insulte'],
  ['gros connard',1,'insulte'], ['sale connard',1,'insulte'], ['espece de connard',1,'insulte'],
  ['triple connard',1,'insulte'], ['pauvre connard',1,'insulte'], ['vieux connard',1,'insulte'],
  ['petit connard',1,'insulte'], ['sacre connard',1,'insulte'], ['super connard',1,'insulte'],
  ['bande de connards',1,'insulte'], ['trou du connard',1,'insulte'],

  // — Famille CON (directs) —
  ['gros con',1,'insulte'], ['grosse conne',1,'insulte'], ['sale con',1,'insulte'],
  ['vieux con',1,'insulte'], ['petit con',1,'insulte'], ['pauvre con',1,'insulte'],
  ['espece de con',1,'insulte'], ['triple con',1,'insulte'], ['sacre con',1,'insulte'],
  ['quel con',1,'insulte'], ['quelle conne',1,'insulte'], ['bande de cons',1,'insulte'],
  ['vous etes des cons',1,'insulte'], ['t es un con',1,'insulte'],

  // — Famille ENCULÉ —
  ['encule',1,'insulte'], ['enculee',1,'insulte'], ['encules',1,'insulte'], ['enculees',1,'insulte'],
  ['va t enculer',1,'insulte'], ['encule toi',1,'insulte'], ['bande d encules',1,'insulte'],
  ['sale encule',1,'insulte'], ['gros encule',1,'insulte'], ['espece d encule',1,'insulte'],
  ['triple encule',1,'insulte'], ['va enculer',1,'insulte'], ['t enculer',1,'insulte'],
  ['enculez',1,'insulte'], ['faire enculer',1,'insulte'],

  // — Famille PUTE —
  ['pute',1,'insulte'], ['putes',1,'insulte'], ['sale pute',1,'insulte'], ['grosse pute',1,'insulte'],
  ['grande pute',1,'insulte'], ['fdp',1,'insulte'], ['fils de pute',1,'insulte'],
  ['fille de pute',1,'insulte'], ['fils d pute',1,'insulte'], ['petite pute',1,'insulte'],
  ['vieille pute',1,'insulte'], ['va faire ta pute',1,'insulte'], ['sale fdp',1,'insulte'],
  ['gros fdp',1,'insulte'], ['espece de fdp',1,'insulte'], ['bande de fdp',1,'insulte'],
  ['va te faire pute',1,'insulte'], ['ta mere la pute',1,'insulte'],

  // — Famille SALOPE —
  ['salope',1,'insulte'], ['salopes',1,'insulte'], ['sale salope',1,'insulte'],
  ['grosse salope',1,'insulte'], ['petite salope',1,'insulte'], ['espece de salope',1,'insulte'],
  ['bande de salopes',1,'insulte'], ['grande salope',1,'insulte'], ['vieille salope',1,'insulte'],

  // — Famille BATARD —
  ['batard',1,'insulte'], ['batarde',1,'insulte'], ['batards',1,'insulte'], ['batardes',1,'insulte'],
  ['sale batard',1,'insulte'], ['gros batard',1,'insulte'], ['espece de batard',1,'insulte'],
  ['petit batard',1,'insulte'], ['vieux batard',1,'insulte'], ['pauvre batard',1,'insulte'],
  ['double batard',1,'insulte'], ['triple batard',1,'insulte'],

  // — Famille PEDE —
  ['pede',1,'insulte'], ['pedes',1,'insulte'], ['pd',1,'insulte'], ['pds',1,'insulte'],
  ['sale pede',1,'insulte'], ['gros pede',1,'insulte'], ['espece de pede',1,'insulte'],
  ['bande de pedes',1,'insulte'], ['double pede',1,'insulte'], ['pedale',1,'insulte'],
  ['pedales',1,'insulte'], ['tapette',1,'insulte'], ['tapettes',1,'insulte'],
  ['sale tapette',1,'insulte'], ['grosse tapette',1,'insulte'],

  // — Famille ENFOIRÉ —
  ['enfoire',1,'insulte'], ['enfoiree',1,'insulte'], ['enfoires',1,'insulte'], ['enfoirees',1,'insulte'],
  ['sale enfoire',1,'insulte'], ['gros enfoire',1,'insulte'], ['espece d enfoire',1,'insulte'],
  ['bande d enfoires',1,'insulte'], ['vieux enfoire',1,'insulte'], ['pauvre enfoire',1,'insulte'],

  // — Famille NTM / NIQUE —
  ['ntm',1,'insulte'], ['nique ta mere',1,'insulte'], ['nique ta meuf',1,'insulte'],
  ['nique',1,'insulte'], ['niquer',1,'insulte'], ['nique sa mere',1,'insulte'],
  ['va niquer',1,'insulte'], ['se faire niquer',1,'insulte'],

  // — Famille TA GUEULE —
  ['ta gueule',1,'insulte'], ['ferme ta gueule',1,'insulte'], ['ferme la gueule',1,'insulte'],
  ['tg',1,'insulte'], ['la fermer',1,'insulte'], ['ferme ta',1,'insulte'],
  ['ta geule',1,'insulte'], ['close ta gueule',1,'insulte'],

  // — Famille VA TE FAIRE —
  ['va te faire foutre',1,'insulte'], ['va te faire enculer',1,'insulte'],
  ['va te faire voir',1,'insulte'], ['va te faire',1,'insulte'], ['vtff',1,'insulte'],
  ['va vous faire foutre',1,'insulte'], ['allez vous faire foutre',1,'insulte'],
  ['faire foutre',1,'insulte'],

  // — Famille RACLURE —
  ['raclure',1,'insulte'], ['raclures',1,'insulte'], ['raclure de bidet',1,'insulte'],
  ['sale raclure',1,'insulte'], ['espece de raclure',1,'insulte'], ['petite raclure',1,'insulte'],

  // — Famille ORDURE —
  ['ordure',1,'insulte'], ['ordures',1,'insulte'], ['sale ordure',1,'insulte'],
  ['petite ordure',1,'insulte'], ['espece d ordure',1,'insulte'], ['bande d ordures',1,'insulte'],
  ['vieille ordure',1,'insulte'], ['pauvre ordure',1,'insulte'],

  // — Famille VERMINE / POURRITURE —
  ['vermine',1,'insulte'], ['vermines',1,'insulte'], ['sale vermine',1,'insulte'],
  ['espece de vermine',1,'insulte'], ['pourriture',1,'insulte'], ['pourritures',1,'insulte'],
  ['sale pourriture',1,'insulte'], ['espece de pourriture',1,'insulte'],

  // — Famille TROU DU CUL —
  ['trou du cul',1,'insulte'], ['trouduc',1,'insulte'], ['trou de cul',1,'insulte'],
  ['trou d cul',1,'insulte'], ['sale trou du cul',1,'insulte'], ['troudecul',1,'insulte'],

  // — Famille MERDEUX / SALOPARD —
  ['merdeux',1,'insulte'], ['merdeuse',1,'insulte'], ['merdiques',1,'insulte'],
  ['merdique',1,'insulte'], ['salopard',1,'insulte'], ['salopards',1,'insulte'],
  ['sale salopard',1,'insulte'], ['gros salopard',1,'insulte'],

  // — Famille FIOTTE / GOUINE —
  ['fiotte',1,'insulte'], ['fiottes',1,'insulte'], ['sale fiotte',1,'insulte'],
  ['gros fiotte',1,'insulte'], ['espece de fiotte',1,'insulte'],
  ['gouine',1,'insulte'], ['gouines',1,'insulte'], ['sale gouine',1,'insulte'],
  ['tarlouze',1,'insulte'], ['tarlouzes',1,'insulte'], ['sale tarlouze',1,'insulte'],

  // — Famille ABRUTI / DEGÉNÉRÉ —
  ['abruti',1,'insulte'], ['abruties',1,'insulte'], ['abrutis',1,'insulte'],
  ['espece d abruti',1,'insulte'], ['sale abruti',1,'insulte'], ['gros abruti',1,'insulte'],
  ['degenere',1,'insulte'], ['degeneree',1,'insulte'], ['degenerés',1,'insulte'],
  ['sale degenere',1,'insulte'], ['espece de degenere',1,'insulte'],
  ['attarde',1,'insulte'], ['attardee',1,'insulte'], ['attardes',1,'insulte'],
  ['sale attarde',1,'insulte'],

  // — Famille RATÉ —
  ['rate',1,'insulte'], ['ratee',1,'insulte'], ['rates',1,'insulte'],
  ['sale rate',1,'insulte'], ['gros rate',1,'insulte'], ['espece de rate',1,'insulte'],

  // — Famille TA MERE (insultes) —
  ['ta mere',1,'insulte'], ['ta mère',1,'insulte'], ['balance ta mere',1,'insulte'],
  ['ta mere en string',1,'insulte'], ['ta soeur',1,'insulte'], ['ta race',1,'insulte'],
  ['la race',1,'insulte'], ['ta famille',1,'insulte'],

  // — Menaces —
  ['je vais te tuer',1,'menace'], ['je te tuerai',1,'menace'], ['je te tue',1,'menace'],
  ['je vais vous tuer',1,'menace'], ['tu vas mourir',1,'menace'], ['tu vas crever',1,'menace'],
  ['va crever',1,'menace'], ['va mourir',1,'menace'], ['crevard',1,'menace'],
  ['t es mort',1,'menace'], ['vous etes morts',1,'menace'], ['je vais te retrouver',1,'menace'],
  ['tu vas payer',1,'menace'], ['je vais te faire du mal',1,'menace'],
  ['tu vas regretter',1,'menace'], ['je sais ou tu habites',1,'menace'],
  ['je vais te peter',1,'menace'], ['je vais te casser',1,'menace'],

  // — Suicide / Harcèlement —
  ['suicide toi',1,'harcelement'], ['suicid toi',1,'harcelement'], ['tue toi',1,'harcelement'],
  ['tue-toi',1,'harcelement'], ['va te pendre',1,'harcelement'], ['kys',1,'harcelement'],
  ['kill yourself',1,'harcelement'], ['va te suicider',1,'harcelement'],
  ['fais toi du mal',1,'harcelement'], ['disparais',1,'harcelement'],
  ['personne t aime',1,'harcelement'], ['tout le monde te deteste',1,'harcelement'],

  // — Sexuel —
  ['bite',1,'sexuel'], ['bites',1,'sexuel'], ['suce ma bite',1,'sexuel'],
  ['mange ma bite',1,'sexuel'], ['avale ma bite',1,'sexuel'], ['ta bite',1,'sexuel'],
  ['grosse bite',1,'sexuel'], ['petite bite',1,'sexuel'],
  ['suce',1,'sexuel'], ['sucer',1,'sexuel'], ['suce moi',1,'sexuel'],
  ['va sucer',1,'sexuel'], ['suce ta mere',1,'sexuel'],
  ['couille',1,'sexuel'], ['couilles',1,'sexuel'], ['mes couilles',1,'sexuel'],
  ['lèche mes couilles',1,'sexuel'], ['leche mes couilles',1,'sexuel'],
  ['mange mes couilles',1,'sexuel'], ['couillon',1,'sexuel'], ['couillons',1,'sexuel'],
  ['branleur',1,'sexuel'], ['branleuse',1,'sexuel'], ['branlette',1,'sexuel'],
  ['va te branler',1,'sexuel'], ['branle toi',1,'sexuel'],
  ['va chier',1,'sexuel'], ['vas chier',1,'sexuel'],

  // — Injures raciales —
  ['negre',1,'racial'], ['negresse',1,'racial'], ['negres',1,'racial'],
  ['youpin',1,'racial'], ['youpins',1,'racial'], ['youpine',1,'racial'],
  ['bougnoule',1,'racial'], ['bougnoules',1,'racial'],
  ['raton',1,'racial'], ['ratons',1,'racial'],
  ['crouille',1,'racial'], ['crouilles',1,'racial'],
  ['bamboula',1,'racial'], ['bamboulas',1,'racial'],
  ['bicot',1,'racial'], ['bicots',1,'racial'],
  ['metece',1,'racial'], ['meteque',1,'racial'], ['meteques',1,'racial'],
  ['sale arabe',1,'racial'], ['sale noir',1,'racial'], ['sale blanc',1,'racial'],
  ['sale juif',1,'racial'], ['sale chinois',1,'racial'],
  ['feuj',1,'racial'], ['feujs',1,'racial'],
  ['gitan',1,'racial'], ['gitane',1,'racial'],
  ['nazi',1,'racial'], ['nazis',1,'racial'], ['heil',1,'racial'],
  ['hitler',1,'racial'], ['antisemite',1,'racial'],

  // — Slurs anglais —
  ['nigger',1,'racial'], ['niggers',1,'racial'], ['nigga',1,'racial'], ['niggas',1,'racial'],
  ['chink',1,'racial'], ['chinks',1,'racial'], ['spic',1,'racial'],
  ['faggot',1,'racial'], ['faggots',1,'racial'], ['fag',1,'insulte'],
  ['dyke',1,'insulte'], ['kike',1,'racial'],
  ['bitch',1,'insulte'], ['bitches',1,'insulte'], ['cunt',1,'insulte'], ['cunts',1,'insulte'],
  ['motherfucker',1,'insulte'], ['mf',1,'insulte'],
  ['fuck you',1,'insulte'], ['fuck off',1,'insulte'], ['go fuck yourself',1,'insulte'],
  ['shut the fuck up',1,'insulte'], ['stfu',1,'insulte'], ['gtfo',1,'insulte'],
  ['asshole',1,'insulte'], ['assholes',1,'insulte'], ['bastard',1,'insulte'],
  ['son of a bitch',1,'insulte'], ['whore',1,'insulte'], ['slut',1,'insulte'],
  ['dumbass',1,'insulte'], ['dipshit',1,'insulte'], ['dickhead',1,'insulte'],
  ['shithead',1,'insulte'], ['piece of shit',1,'insulte'],

  // — Variantes codées fréquentes (non couvertes par la normalisation) —
  ['salo',1,'insulte'], ['s4lope',1,'insulte'], ['enc',1,'insulte'],
  ['pd ',1,'insulte'], [' pd',1,'insulte'],

  // ══════════════════════════════════════════════════════════════════
  // TIER 2 — Déclenche l'IA si message > 10 mots
  // ══════════════════════════════════════════════════════════════════

  // Mots ambigus — normaux en exclamation de jeu, insultants selon contexte
  ['con',2,'ambigu'], ['conne',2,'ambigu'], ['cons',2,'ambigu'], ['connes',2,'ambigu'],
  ['merde',2,'ambigu'], ['merdes',2,'ambigu'], ['sale merde',2,'ambigu'],
  ['gueule',2,'ambigu'], ['ta gueule',1,'insulte'],
  ['chier',2,'ambigu'], ['fait chier',2,'ambigu'], ['fais chier',2,'ambigu'],
  ['chie',2,'ambigu'], ['chieur',2,'ambigu'], ['chieuse',2,'ambigu'],
  ['cretin',2,'ambigu'], ['cretine',2,'ambigu'], ['cretins',2,'ambigu'],
  ['idiot',2,'ambigu'], ['idiote',2,'ambigu'], ['idiots',2,'ambigu'], ['idiotes',2,'ambigu'],
  ['debile',2,'ambigu'], ['debiles',2,'ambigu'],
  ['imbecile',2,'ambigu'], ['imbeciles',2,'ambigu'],
  ['bouffon',2,'ambigu'], ['bouffons',2,'ambigu'], ['bouffonne',2,'ambigu'],
  ['guignol',2,'ambigu'], ['guignols',2,'ambigu'],
  ['clown',2,'ambigu'], ['clowns',2,'ambigu'],
  ['nul',2,'ambigu'], ['nulle',2,'ambigu'], ['nuls',2,'ambigu'], ['nulles',2,'ambigu'],
  ['gros nul',2,'ambigu'], ['grosse nulle',2,'ambigu'],
  ['abruti',2,'ambigu'], ['abrutis',2,'ambigu'],
  ['salaud',2,'ambigu'], ['salauds',2,'ambigu'],
  ['ordure',2,'ambigu'], ['ordures',2,'ambigu'],
  ['dechet',2,'ambigu'], ['dechets',2,'ambigu'],
  ['degueulasse',2,'ambigu'], ['merdique',2,'ambigu'],
  ['naze',2,'ambigu'], ['nazes',2,'ambigu'],
  ['raté',2,'ambigu'], ['rate',2,'ambigu'],
  ['lache',2,'ambigu'], ['trouillard',2,'ambigu'], ['trouillarde',2,'ambigu'],
  ['minable',2,'ambigu'], ['minables',2,'ambigu'],
  ['pathétique',2,'ambigu'], ['pathetique',2,'ambigu'],
  ['inutile',2,'ambigu'], ['incompetent',2,'ambigu'],
  ['casse toi',2,'ambigu'], ['degage',2,'ambigu'], ['degagez',2,'ambigu'],
  ['fous le camp',2,'ambigu'], ['foutez le camp',2,'ambigu'],
  ['creve',2,'ambigu'], ['crevent',2,'ambigu'],
  ['mange',2,'ambigu'], ['mangeur',2,'ambigu'],
  ['porc',2,'ambigu'], ['porcs',2,'ambigu'], ['sale porc',2,'ambigu'],
  ['cochon',2,'ambigu'], ['cochons',2,'ambigu'],
  ['chien',2,'ambigu'], ['chienne',2,'ambigu'], ['sale chien',2,'ambigu'],
  ['boudin',2,'ambigu'], ['gros lard',2,'ambigu'], ['grosse vache',2,'ambigu'],
  ['va chier',2,'ambigu'],
  ['honte',2,'ambigu'], ['tu fais honte',2,'ambigu'],
  ['suicide',2,'ambigu'],
];

// ── Seed de la bibliothèque en DB ─────────────────────────────────────────────
export function seedModerationWords() {
  const insert = db.prepare('INSERT OR IGNORE INTO moderation_words (terme, tier, categorie) VALUES (?,?,?)');
  let count = 0;
  for (const [terme, tier, categorie] of SEED) {
    insert.run(normalize(terme), tier, categorie);
    count++;
  }
  console.log(`[Modération] Bibliothèque : ${count} termes seedés`);
}

// ── Chargement en mémoire depuis la DB ───────────────────────────────────────
export function loadLibrary() {
  wordsTier1.clear(); phrasesTier1.length = 0;
  wordsTier2.clear(); phrasesTier2.length = 0;

  try {
    const rows = db.prepare('SELECT terme, tier FROM moderation_words').all();
    for (const { terme, tier } of rows) {
      const isPhrase = terme.includes(' ');
      if (tier === 1) { isPhrase ? phrasesTier1.push(terme) : wordsTier1.add(terme); }
      else            { isPhrase ? phrasesTier2.push(terme) : wordsTier2.add(terme); }
    }
    console.log(`[Modération] Bibliothèque chargée — ${wordsTier1.size + phrasesTier1.length} t1, ${wordsTier2.size + phrasesTier2.length} t2`);
  } catch (e) { console.error('[loadLibrary]', e.message); }
}

export function loadWhitelist() {
  try {
    const rows = db.prepare('SELECT terme FROM moderation_whitelist').all();
    whitelist  = new Set(rows.map(r => r.terme));
    console.log(`[Modération] Whitelist : ${whitelist.size} terme(s)`);
  } catch {}
}

// ── Détection dans un message normalisé ──────────────────────────────────────
function isWhitelisted(normalized) {
  for (const w of whitelist) if (normalized.includes(w)) return true;
  return false;
}

function matchLibrary(normalized, wordSet, phrases) {
  const words = normalized.split(/\s+/);
  for (const w of words) {
    if (wordSet.has(w)) return w;
  }
  for (const p of phrases) {
    if (normalized.includes(p)) return p;
  }
  return null;
}

// ── Résultat du check : null | { action:'delete'|'ai', matched:string } ──────
export function checkMessage(content) {
  const norm  = normalize(content);
  if (!norm || norm.length < 2) return null;
  if (isWhitelisted(norm))      return null;

  // Tier 1 — suppression immédiate
  const hit1 = matchLibrary(norm, wordsTier1, phrasesTier1);
  if (hit1) return { action: 'delete', matched: hit1 };

  // Tier 2 — IA si message long (>10 mots)
  const wordCount = norm.split(/\s+/).length;
  if (wordCount > 10) {
    const hit2 = matchLibrary(norm, wordsTier2, phrasesTier2);
    if (hit2) return { action: 'ai', matched: hit2 };
  }

  return null;
}

// ── NVIDIA llama-3.1-8b ───────────────────────────────────────────────────────
async function askLlama8b(system, user) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NVIDIA_API_KEY}` },
    body: JSON.stringify({
      model: MODEL_8B,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 200, temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA ${res.status}`);
  const d = await res.json();
  return d.choices[0]?.message?.content?.trim() ?? '';
}

function parseJSON(text) {
  try { const m = text.match(/\{[\s\S]*?\}/); return m ? JSON.parse(m[0]) : null; }
  catch { return null; }
}

async function evaluerAvecIA(content) {
  const raw = await askLlama8b(
    `Tu es modérateur d'un serveur Minecraft RP Viking francophone (Vyldra).
Analyse si ce MESSAGE est offensant, insultant ou toxique ENVERS UNE PERSONNE.
Le contexte RP, les jurons seuls de frustration ("putain", "merde" en exclamation) et le langage de jeu familier ne sont PAS offensants.
Réponds UNIQUEMENT en JSON : {"offensant": true/false, "raison": "phrase courte"}`,
    `Message : "${content}"`
  );
  return parseJSON(raw) ?? { offensant: false };
}

async function reevaluerAvecIA(content) {
  const raw = await askLlama8b(
    `Tu es modérateur strict mais juste d'un serveur Minecraft RP Viking francophone.
Réévalue ce message supprimé après contestation de l'utilisateur. Sois objectif.
Réponds UNIQUEMENT en JSON : {"offensant": true/false, "explication": "phrase courte", "terme": "mot/expression faussement filtré si pas offensant, sinon vide"}`,
    `Message réévalué : "${content}"`
  );
  return parseJSON(raw) ?? { offensant: true, explication: 'Ce message était offensant.', terme: '' };
}

// ── Whitelist via Claude -p ───────────────────────────────────────────────────
async function whitelistViaClaude(messageContent, termeSuggere, logId) {
  const prompt =
    `Un message a été supprimé par la modération du bot Discord "Compagnie du Fjord" mais était un FAUX POSITIF.\n` +
    `Message original : "${messageContent}"\n` +
    `Terme identifié comme faussement filtré : "${termeSuggere}"\n\n` +
    `Identifie précisément le mot ou l'expression à whitelister pour éviter les futurs faux positifs.\n` +
    `Réponds UNIQUEMENT : WHITELIST:[terme_exact_en_minuscules_sans_accents]\n` +
    `Exemple : WHITELIST:putain\nExemple : WHITELIST:va te faire voir`;
  try {
    const { stdout } = await execFileAsync('claude', ['-p', prompt], { cwd: '/root/compagnie-du-fjord', timeout: 30_000 });
    const m = stdout.match(/WHITELIST:(.+)/i);
    const terme = m ? m[1].trim().toLowerCase() : termeSuggere.toLowerCase().trim();
    addToWhitelist(terme, `Faux positif appel #${logId}`);
    return terme;
  } catch (e) {
    console.error('[Whitelist Claude]', e.message);
    const terme = termeSuggere.toLowerCase().trim();
    addToWhitelist(terme, `Faux positif appel #${logId}`);
    return terme;
  }
}

function addToWhitelist(terme, raison = '') {
  try {
    db.prepare('INSERT OR IGNORE INTO moderation_whitelist (terme, raison) VALUES (?,?)').run(terme, raison);
    whitelist.add(terme);
    console.log(`[Modération] ✅ Whitelisté : "${terme}"`);
  } catch {}
}

// ── Envoi DM + bouton appel ───────────────────────────────────────────────────
async function sendAppealDM(author, guildName, logId) {
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Message supprimé — Compagnie du Fjord')
    .setDescription(
      `Ton message sur **${guildName}** a été supprimé car il contenait du contenu offensant.\n\n` +
      `Si tu penses que c'est une erreur, clique sur le bouton ci-dessous.`
    )
    .setColor(0xFF8C00)
    .setFooter({ text: 'Modération automatique — Compagnie du Fjord' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mod_appeal:${logId}:${author.id}`)
      .setLabel('Erreur ?')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🤔')
  );

  try {
    const dm = await author.createDM();
    await dm.send({ embeds: [embed], components: [row] });
  } catch {}
}

// ── Canaux IA exclus de la modération ─────────────────────────────────────────
const IA_CHANNELS = new Set();
export function registerIAChannels(...ids) {
  for (const id of ids) if (id) IA_CHANNELS.add(id);
}

// ── Modération principale ─────────────────────────────────────────────────────
const _inProgress = new Set();

export async function moderateMessage(message) {
  if (message.author.bot)              return;
  if (!message.guild)                  return;
  if (IA_CHANNELS.has(message.channelId)) return;
  if (_inProgress.has(message.id))     return;

  const content = message.content?.trim();
  if (!content || content.length < 2)  return;

  const result = checkMessage(content);
  if (!result) return;

  _inProgress.add(message.id);
  try {
    let shouldDelete = false;

    if (result.action === 'delete') {
      shouldDelete = true;
    } else if (result.action === 'ai') {
      const eval_ = await evaluerAvecIA(content);
      shouldDelete = eval_.offensant;
    }

    if (!shouldDelete) return;

    await message.delete().catch(() => {});

    const logResult = db.prepare(
      'INSERT INTO moderation_log (user_id, message_content, channel_id, guild_id) VALUES (?,?,?,?)'
    ).run(message.author.id, content, message.channelId, message.guild.id);

    await sendAppealDM(message.author, message.guild.name, logResult.lastInsertRowid);

  } catch (e) {
    console.error('[Modération]', e.message);
  } finally {
    _inProgress.delete(message.id);
  }
}

// ── Gestion bouton "Erreur ?" ─────────────────────────────────────────────────
export async function handleModerationAppeal(interaction) {
  const [, logId, userId] = interaction.customId.split(':');

  if (interaction.user.id !== userId)
    return interaction.reply({ content: 'Ce bouton ne te concerne pas.', ephemeral: true });

  await interaction.deferReply({ ephemeral: true });

  const log = db.prepare('SELECT * FROM moderation_log WHERE id=?').get(logId);
  if (!log)        return interaction.editReply({ content: 'Demande introuvable ou expirée.' });
  if (log.reviewed) return interaction.editReply({ content: 'Cette demande a déjà été traitée.' });

  try {
    const result = await reevaluerAvecIA(log.message_content);
    db.prepare('UPDATE moderation_log SET reviewed=1, review_result=? WHERE id=?')
      .run(JSON.stringify(result), logId);

    if (result.offensant) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle('🔍 Résultat de vérification')
          .setDescription(
            `Après analyse, le message supprimé était bien **offensant ou mal placé**.\n\n` +
            `*${result.explication || 'Ce message ne respectait pas les règles du serveur.'}*`
          )
          .setColor(0xFF4444)
          .setFooter({ text: 'Modération — Compagnie du Fjord' })],
      });
    }

    await interaction.editReply({ content: '⏳ Faux positif détecté — mise à jour de la bibliothèque en cours…' });
    const terme = await whitelistViaClaude(log.message_content, result.terme || log.message_content, logId);

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle('✅ Erreur de modération confirmée')
        .setDescription(
          `Notre système a confirmé que ton message **n'était pas offensant**.\n\n` +
          `L'expression \`${terme}\` a été ajoutée à la liste des termes autorisés.\n` +
          `Ce type de message ne sera plus filtré à l'avenir.`
        )
        .setColor(0x00CC66)
        .setFooter({ text: 'Modération — Compagnie du Fjord' })],
    });

  } catch (e) {
    console.error('[Appeal]', e.message);
    return interaction.editReply({ content: 'Erreur lors de la vérification. Contacte un modérateur.' });
  }
}
