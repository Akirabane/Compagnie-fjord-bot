import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import db from '../db/database.js';

const execFileAsync = promisify(execFile);

const NVIDIA_API_KEY = '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';
const BASE_URL       = 'https://integrate.api.nvidia.com/v1';
const MODEL_8B       = 'meta/llama-3.1-8b-instruct';

// ── Pré-filtre — termes qui déclenchent une évaluation IA ─────────────────────
// Seulement les cas graves — le langage de jeu familier passe librement
const TRIGGERS = [
  // Insultes directes graves FR
  'va te faire', 'va te foutre', 'ferme ta gueule', 'ta gueule',
  'fils de pute', 'fils de p', 'fdp', 'nique ta mère', 'ntm', 'nique ta mere',
  'je vais te', 'je vais vous',
  // Slurs FR
  'pd ', ' pd', 'pédale', 'tapette', 'enculé', 'enculer',
  'salope', 'grosse pute', 'grande pute',
  // Harcèlement / menaces
  'tu vas mourir', 'je vais te tuer', 'je te tuer', 'suicide toi', 'va crever',
  // Slurs EN
  'nigger', 'nigga', 'faggot', ' kys', 'kill yourself',
];

// ── Whitelist en mémoire ───────────────────────────────────────────────────────
let whitelist = new Set();

export function loadWhitelist() {
  try {
    const rows = db.prepare('SELECT terme FROM moderation_whitelist').all();
    whitelist  = new Set(rows.map(r => r.terme.toLowerCase()));
    console.log(`[Modération] Whitelist : ${whitelist.size} terme(s)`);
  } catch {}
}

function isWhitelisted(content) {
  const lower = content.toLowerCase();
  for (const w of whitelist) {
    if (lower.includes(w)) return true;
  }
  return false;
}

function hasHardTrigger(content) {
  const lower = content.toLowerCase();
  return TRIGGERS.some(t => lower.includes(t));
}

// ── Appel NVIDIA llama-3.1-8b ─────────────────────────────────────────────────
async function askLlama8b(systemPrompt, userPrompt) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NVIDIA_API_KEY}` },
    body: JSON.stringify({
      model:       MODEL_8B,
      messages:    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      max_tokens:  200,
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA ${res.status}`);
  const data = await res.json();
  return data.choices[0]?.message?.content?.trim() ?? '';
}

function parseJSON(text) {
  try {
    const m = text.match(/\{[\s\S]*?\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

// ── Évaluation initiale ────────────────────────────────────────────────────────
async function evaluerMessage(content) {
  const system = `Tu es modérateur d'un serveur Minecraft RP Viking francophone (Vyldra).
Analyse si ce message est réellement offensant, insultant, ou toxique envers une personne.
Le langage de jeu familier, les jurons seuls ("putain", "merde"…) et les expressions vikings RP ne sont PAS offensants.
Réponds UNIQUEMENT en JSON : {"offensant": true/false, "raison": "phrase courte"}`;

  const raw = await askLlama8b(system, `Message : "${content}"`);
  return parseJSON(raw) ?? { offensant: false };
}

// ── Réévaluation pour l'appel ──────────────────────────────────────────────────
async function reevaluerMessage(content) {
  const system = `Tu es modérateur strict mais juste d'un serveur Minecraft RP Viking francophone.
Réévalue ce message supprimé après demande de l'utilisateur.
Sois objectif : le contexte jeu/RP change parfois le sens.
Réponds UNIQUEMENT en JSON : {"offensant": true/false, "explication": "phrase courte", "terme": "mot ou expression faussement filtré si pas offensant, sinon vide"}`;

  const raw = await askLlama8b(system, `Message réévalué : "${content}"`);
  return parseJSON(raw) ?? { offensant: true, explication: 'Ce message était offensant.', terme: '' };
}

// ── Whitelister via Claude -p ──────────────────────────────────────────────────
async function whitelistViaClaude(messageContent, termeSuggere, logId) {
  const prompt =
    `Un message a été supprimé par la modération du bot Discord Compagnie du Fjord, ` +
    `mais l'utilisateur a contesté et llama-3.1-8b a confirmé que ce message N'ÉTAIT PAS offensant.\n\n` +
    `Message original : "${messageContent}"\n` +
    `Terme identifié comme faussement filtré : "${termeSuggere}"\n\n` +
    `Identifie précisément le mot ou l'expression à whitelister dans le système de modération ` +
    `pour éviter de futurs faux positifs similaires.\n` +
    `Réponds UNIQUEMENT avec : WHITELIST:[terme_exact_en_minuscules]\n` +
    `Exemple : WHITELIST:putain\n` +
    `Exemple : WHITELIST:va te faire voir`;

  try {
    const { stdout } = await execFileAsync('claude', ['-p', prompt], {
      cwd:     '/root/compagnie-du-fjord',
      timeout: 30_000,
    });
    const match = stdout.match(/WHITELIST:(.+)/i);
    const terme = match ? match[1].trim().toLowerCase().replace(/[^\w\sàâäéèêëîïôùûüç'-]/g, '') : termeSuggere.toLowerCase().trim();
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
    whitelist.add(terme.toLowerCase());
    console.log(`[Modération] ✅ Whitelisté : "${terme}"`);
  } catch {}
}

// ── Modération d'un message ────────────────────────────────────────────────────
// Canaux IA (messages auto-supprimés — pas besoin de modérer)
const IA_CHANNELS = new Set();
export function registerIAChannels(...ids) {
  for (const id of ids) if (id) IA_CHANNELS.add(id);
}

const _inProgress = new Set(); // évite les doublons si deux events arrivent

export async function moderateMessage(message) {
  if (message.author.bot)    return;
  if (!message.guild)        return;
  if (_inProgress.has(message.id)) return;

  const content = message.content?.trim();
  if (!content || content.length < 3) return;

  // Skip canaux IA
  if (IA_CHANNELS.has(message.channelId)) return;

  // Skip si whitelisté
  if (isWhitelisted(content)) return;

  // Pré-filtre rapide
  if (!hasHardTrigger(content)) return;

  _inProgress.add(message.id);
  try {
    const result = await evaluerMessage(content);
    if (!result.offensant) return;

    // Supprimer le message
    await message.delete().catch(() => {});

    // Log en DB
    const logResult = db.prepare(
      'INSERT INTO moderation_log (user_id, message_content, channel_id, guild_id) VALUES (?,?,?,?)'
    ).run(message.author.id, content, message.channelId, message.guild.id);

    const logId = logResult.lastInsertRowid;

    // DM à l'utilisateur
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Message supprimé — Compagnie du Fjord')
      .setDescription(
        `Ton message sur **${message.guild.name}** a été supprimé car il semblait offensant ou mal placé.\n\n` +
        `Si tu penses que c'est une erreur de notre système, clique sur le bouton ci-dessous et nous réévaluerons.`
      )
      .setColor(0xFF8C00)
      .setFooter({ text: 'Modération automatique — Compagnie du Fjord' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_appeal:${logId}:${message.author.id}`)
        .setLabel('Erreur ?')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🤔')
    );

    try {
      const dm = await message.author.createDM();
      await dm.send({ embeds: [embed], components: [row] });
    } catch {} // L'utilisateur peut avoir les DMs fermés

  } catch (e) {
    console.error('[Modération]', e.message);
  } finally {
    _inProgress.delete(message.id);
  }
}

// ── Gestion de l'appel "Erreur ?" ────────────────────────────────────────────
export async function handleModerationAppeal(interaction) {
  const parts  = interaction.customId.split(':');
  const logId  = parts[1];
  const userId = parts[2];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: 'Ce bouton ne te concerne pas.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const log = db.prepare('SELECT * FROM moderation_log WHERE id=?').get(logId);
  if (!log) return interaction.editReply({ content: 'Demande introuvable ou expirée.' });
  if (log.reviewed) {
    return interaction.editReply({ content: 'Cette demande a déjà été traitée.' });
  }

  try {
    const result = await reevaluerMessage(log.message_content);

    db.prepare('UPDATE moderation_log SET reviewed=1, review_result=? WHERE id=?')
      .run(JSON.stringify(result), logId);

    if (result.offensant) {
      const embed = new EmbedBuilder()
        .setTitle('🔍 Résultat de vérification')
        .setDescription(
          `Après analyse par notre système, le message supprimé était bien **offensant ou mal placé**.\n\n` +
          `*${result.explication || 'Ce message ne respectait pas les règles du serveur.'}*\n\n` +
          `Si tu as des questions, contacte un modérateur.`
        )
        .setColor(0xFF4444)
        .setFooter({ text: 'Modération — Compagnie du Fjord' });

      return interaction.editReply({ embeds: [embed] });
    }

    // Pas offensant → Claude whiteliste le terme
    await interaction.editReply({ content: '⏳ Vérification en cours, analyse approfondie…' });

    const terme = await whitelistViaClaude(log.message_content, result.terme || log.message_content, logId);

    const embed = new EmbedBuilder()
      .setTitle('✅ Erreur de modération confirmée')
      .setDescription(
        `Notre système a confirmé que ton message **n'était pas offensant**.\n\n` +
        `L'expression \`${terme}\` a été ajoutée à la liste des termes autorisés.\n` +
        `Ce type de message ne sera plus filtré à l'avenir.`
      )
      .setColor(0x00CC66)
      .setFooter({ text: 'Modération — Compagnie du Fjord' });

    return interaction.editReply({ embeds: [embed] });

  } catch (e) {
    console.error('[Appeal]', e.message);
    return interaction.editReply({ content: 'Erreur lors de la vérification. Contacte un modérateur.' });
  }
}
