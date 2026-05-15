import { EmbedBuilder } from 'discord.js';
import db from '../db/database.js';
import { cfgGet } from './setup.js';
import { askNvidia } from './ia.js';
import { bronzeVersTexte } from './monnaie.js';

// ── Sections et leurs salons config ──────────────────────────────────────────
export const SECTIONS = {
  visiteurs: { cfgKey: 'IA_PROACTIF_VISITEURS_ID', label: 'Visiteurs',  color: 0x5865F2 },
  domaine:   { cfgKey: 'IA_PROACTIF_DOMAINE_ID',   label: 'Domaine',    color: 0xC9A84C },
  nobles:    { cfgKey: 'IA_PROACTIF_NOBLES_ID',     label: 'Nobles',     color: 0x8B0000 },
};

async function getSectionChannel(client, section) {
  const id = cfgGet(SECTIONS[section].cfgKey);
  if (!id) return null;
  return client.channels.fetch(id).catch(() => null);
}

async function postInSection(client, section, embeds) {
  const channel = await getSectionChannel(client, section);
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds }).catch(e => console.error(`[ia-proactif][${section}]`, e.message));
}

// ── Routeur IA ────────────────────────────────────────────────────────────────
// Demande à l'IA de décider si l'événement mérite un post, dans quels salons,
// et génère le message adapté à chaque section en un seul appel.
// Retourne : [{ section, message }] ou [] si inutile.
const PROMPT_ROUTEUR = `Tu es le système de communication proactif de la Compagnie du Fjord, guilde marchande sur le serveur Minecraft RP Viking Vyldra.
Tu reçois des événements internes et tu dois décider :
1. Si cet événement mérite d'être communiqué (certains sont trop banals ou redondants)
2. Dans quels salons le publier parmi : visiteurs, domaine, nobles
3. Le message adapté au ton de chaque section ciblée

Sections disponibles et leurs audiences :
- visiteurs : voyageurs extérieurs et clients potentiels. Ton chaleureux, commercial, accessible. Ne révèle pas les détails internes sensibles.
- domaine : marchands et membres (Paysans, Écuyers, Compagnie). Ton professionnel, camaraderie viking, direct.
- nobles : dirigeants (Nobles, Jarl). Ton formel, stratégique. Seulement pour événements à fort enjeu.

Règles :
- Si l'événement est banal ou redondant avec d'autres systèmes d'alerte, réponds post:false
- Les alertes de stock bas sont inutiles dans ces salons — ne les poste jamais (post:false)
- Une grosse commande ou une offre rare peut valoir une mention, une commande ordinaire non
- Le salon nobles ne reçoit que ce qui a un impact stratégique ou financier notable
- Rédige en prose RP viking médiéval, 2-4 phrases max par section, sans bullet points

Réponds UNIQUEMENT en JSON valide, format strict :
{"post":true,"sections":[{"section":"domaine","message":"..."},{"section":"visiteurs","message":"..."}]}
ou si inutile :
{"post":false}`;

async function router(evenement) {
  try {
    const raw = await askNvidia(evenement, PROMPT_ROUTEUR, []);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!parsed.post) return [];
    return parsed.sections ?? [];
  } catch {
    return [];
  }
}

// ── Prompts résumé quotidien par section ──────────────────────────────────────
const PROMPT_RESUME_DOMAINE = `Tu es l'Intendant de la Compagnie du Fjord (Minecraft RP Viking Vyldra).
Tu t'adresses aux marchands et membres. Ton professionnel, chaleureux, viking.
Rédige en prose, 3-5 phrases, sans bullet points.`;

const PROMPT_RESUME_NOBLES = `Tu es le Conseiller Principal de la Compagnie du Fjord (Minecraft RP Viking Vyldra).
Tu t'adresses aux Nobles et dirigeants. Ton formel, stratégique, diplomatique.
Conclus par une recommandation d'action. 3-5 phrases, prose, sans bullet points.`;

const PROMPT_RESUME_VISITEURS = `Tu es le Commis aux Visiteurs de la Compagnie du Fjord (Minecraft RP Viking Vyldra).
Tu t'adresses à des visiteurs extérieurs. Ton chaleureux, commercial. Ne révèle pas les détails internes.
2-3 phrases de valorisation de la Compagnie, prose, sans bullet points.`;

async function narrateIA(prompt, systemPrompt) {
  try { return await askNvidia(prompt, systemPrompt, []); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 1 — Résumé quotidien 16h
// ─────────────────────────────────────────────────────────────────────────────
export async function postWeeklySummary(client) {
  const today = new Date().toISOString().slice(0, 10);
  if (cfgGet('LAST_WEEKLY_SUMMARY') === today) return;
  db.prepare("INSERT OR REPLACE INTO config (key,value) VALUES ('LAST_WEEKLY_SUMMARY',?)").run(today);

  const since = "datetime('now','-7 days')";
  const commandesSemaine = db.prepare(
    `SELECT COUNT(*) as nb, SUM(prix_total) as total FROM commandes WHERE statut='livree' AND creee_le >= ${since}`
  ).get();
  const offresSemaine = db.prepare(
    `SELECT COUNT(*) as nb FROM offres_vente WHERE statut='acceptee' AND creee_le >= ${since}`
  ).get();
  const topProduit = db.prepare(
    `SELECT ressource, COUNT(*) as nb FROM commandes WHERE statut='livree' AND creee_le >= ${since} GROUP BY ressource ORDER BY nb DESC LIMIT 1`
  ).get();
  const stocksCritiques = db.prepare(
    `SELECT COUNT(*) as nb FROM stock WHERE seuil_alerte > 0 AND quantite <= seuil_alerte`
  ).get();
  const tresor = parseInt(cfgGet('TRESOR_BRONZE') ?? '0');

  const resumeBrut = [
    `Ces 7 derniers jours : ${commandesSemaine.nb} commandes livrées pour ${commandesSemaine.total ?? 0} bronze au total.`,
    topProduit ? `Produit le plus demandé : ${topProduit.ressource} (${topProduit.nb} fois).` : '',
    `${offresSemaine.nb} offres de vente acceptées.`,
    `Trésorerie actuelle : ${bronzeVersTexte(tresor)}.`,
    stocksCritiques.nb > 0 ? `${stocksCritiques.nb} ressource(s) en stock critique.` : 'Tous les stocks sont au-dessus des seuils.',
  ].filter(Boolean).join(' ');

  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const mkEmbed = (texte, footer, color) => new EmbedBuilder()
    .setTitle(`📜 Chronique du jour — ${date}`)
    .setDescription(texte)
    .setColor(color)
    .setFooter({ text: footer })
    .setTimestamp();

  const [nDomaine, nNobles, nVisiteurs] = await Promise.all([
    narrateIA(`Voici les chiffres : ${resumeBrut}\nRédige un résumé narratif pour les marchands.`, PROMPT_RESUME_DOMAINE),
    narrateIA(`Voici les chiffres : ${resumeBrut}\nRédige un rapport stratégique pour les Nobles.`, PROMPT_RESUME_NOBLES),
    narrateIA(`Voici les chiffres : ${resumeBrut}\nRédige un message d'ambiance commerciale pour les visiteurs, sans détails internes.`, PROMPT_RESUME_VISITEURS),
  ]);

  if (nDomaine)   await postInSection(client, 'domaine',   [mkEmbed(nDomaine,   'Rapport — Membres de la Compagnie',         0xC9A84C)]);
  if (nNobles)    await postInSection(client, 'nobles',    [mkEmbed(nNobles,    'Rapport aux Seigneurs — Compagnie du Fjord', 0x8B0000)]);
  if (nVisiteurs) await postInSection(client, 'visiteurs', [mkEmbed(nVisiteurs, 'La Compagnie du Fjord — Aujourd\'hui',       0x5865F2)]);
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 3 — Accueil personnalisé nouveau membre
// ─────────────────────────────────────────────────────────────────────────────
export async function accueilNouveauMembre(client, member) {
  const pseudo = member.displayName ?? member.user.globalName ?? member.user.username;
  const narration = await narrateIA(
    `Un nouveau visiteur nommé "${pseudo}" vient d'arriver. Rédige un message d'accueil chaleureux et immersif.`,
    `Tu es le Commis aux Visiteurs de la Compagnie du Fjord (Minecraft RP Viking Vyldra). Ton chaleureux, 2-3 phrases, prose.`
  );
  if (!narration) return;

  const embed = new EmbedBuilder()
    .setTitle(`🛶 Un voyageur arrive au Fjord !`)
    .setDescription(narration)
    .setColor(0x5865F2)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: 'Commis aux Visiteurs — Compagnie du Fjord' })
    .setTimestamp();

  await postInSection(client, 'visiteurs', [embed]);
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 4 — Relance commandes en attente +48h
// ─────────────────────────────────────────────────────────────────────────────
const relanceCooldowns = new Map();

export async function relanceCommandesEnAttente(client) {
  const vieilles = db.prepare(
    "SELECT id, client_id, client_pseudo, ressource, quantite, unite, prix_total FROM commandes WHERE statut='en_attente' AND creee_le <= datetime('now','-48 hours')"
  ).all();

  for (const cmd of vieilles) {
    const cle = `relance:${cmd.id}`;
    const last = relanceCooldowns.get(cle) ?? 0;
    if (Date.now() - last < 24 * 3600_000) continue;
    relanceCooldowns.set(cle, Date.now());

    // DM client
    const user = await client.users.fetch(cmd.client_id).catch(() => null);
    if (user) {
      const texte = await narrateIA(
        `Commande #${String(cmd.id).padStart(4,'0')} de "${cmd.client_pseudo}" pour "${cmd.ressource} ×${cmd.quantite} ${cmd.unite}" en attente +48h. Rédige un DM rassurant et RP.`,
        `Tu es le Commis aux Visiteurs de la Compagnie du Fjord. Ton poli, chaleureux, RP viking. 2-3 phrases.`
      );
      if (texte) {
        const embed = new EmbedBuilder()
          .setTitle(`📦 Votre commande est en cours de traitement`)
          .setDescription(texte).setColor(0xC9A84C)
          .setFooter({ text: `Commande #${String(cmd.id).padStart(4,'0')} — Compagnie du Fjord` })
          .setTimestamp();
        await user.send({ embeds: [embed] }).catch(() => {});
      }
    }

    // Routeur IA → décide si alerte Domaine/Nobles et rédige
    const evenement = `Événement interne : la commande #${String(cmd.id).padStart(4,'0')} de "${cmd.client_pseudo}" pour "${cmd.ressource} ×${cmd.quantite} ${cmd.unite}" (${cmd.prix_total} bronze) est en attente sans traitement depuis plus de 48h. Faut-il alerter les marchands ou les Nobles ?`;
    const decisions = await router(evenement);
    for (const { section, message } of decisions) {
      if (!SECTIONS[section]) continue;
      const embed = new EmbedBuilder()
        .setTitle(`⏳ Commande #${String(cmd.id).padStart(4,'0')} — Relance`)
        .setDescription(message).setColor(0xFF8C00)
        .setFooter({ text: `${cmd.client_pseudo} · ${cmd.ressource} ×${cmd.quantite}` })
        .setTimestamp();
      await postInSection(client, section, [embed]);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 6 — Commentaire IA sur nouvelle commande / offre de vente
// ─────────────────────────────────────────────────────────────────────────────
export async function commentaireNouvelleCommande(client, commande) {
  const evenement = `Nouvelle commande enregistrée : "${commande.client_pseudo}" commande "${commande.ressource} ×${commande.quantite} ${commande.unite}" pour ${commande.prix_total} bronze. Note : "${commande.note || 'aucune'}". Faut-il en informer les salons ?`;
  const decisions = await router(evenement);
  for (const { section, message } of decisions) {
    if (!SECTIONS[section]) continue;
    const titles = { visiteurs: '🛒 Nouvelle commande enregistrée', domaine: `📋 Commande #${String(commande.id).padStart(4,'0')} — À traiter`, nobles: '📊 Commande notable' };
    const embed = new EmbedBuilder()
      .setTitle(titles[section] ?? '📋 Commande')
      .setDescription(message).setColor(SECTIONS[section].color)
      .setFooter({ text: `${commande.client_pseudo} · ${commande.ressource} ×${commande.quantite} · ${commande.prix_total}🟤` })
      .setTimestamp();
    await postInSection(client, section, [embed]);
  }
}

export async function commentaireNouvelleOffre(client, offre) {
  const evenement = `Nouvelle offre de vente : "${offre.vendeur_pseudo}" propose "${offre.ressource} ×${offre.quantite} ${offre.unite}" à ${offre.prix_demande} bronze. Note : "${offre.note || 'aucune'}". Faut-il en informer les salons ?`;
  const decisions = await router(evenement);
  for (const { section, message } of decisions) {
    if (!SECTIONS[section]) continue;
    const titles = { domaine: `🏪 Nouvelle offre — ${offre.ressource}`, nobles: '📊 Offre stratégique', visiteurs: `🏪 ${offre.ressource} disponible` };
    const embed = new EmbedBuilder()
      .setTitle(titles[section] ?? `🏪 ${offre.ressource}`)
      .setDescription(message).setColor(SECTIONS[section].color)
      .setFooter({ text: `${offre.vendeur_pseudo} · ${offre.ressource} ×${offre.quantite} · ${offre.prix_demande}🟤` })
      .setTimestamp();
    await postInSection(client, section, [embed]);
  }
}
