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

function getSectionChannel(client, section) {
  const id = cfgGet(SECTIONS[section].cfgKey);
  if (!id) return null;
  return client.channels.fetch(id).catch(() => null);
}

async function postInSection(client, section, embeds) {
  const channel = await getSectionChannel(client, section);
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds }).catch(e => console.error(`[ia-proactif][${section}]`, e.message));
}

// ── Appel IA pour générer un texte narratif ───────────────────────────────────
async function narrateIA(prompt, systemPrompt) {
  try {
    return await askNvidia(prompt, systemPrompt, []);
  } catch {
    return null;
  }
}

// ── Prompts système par section ───────────────────────────────────────────────
const PROMPT_DOMAINE = `Tu es l'Intendant de la Compagnie du Fjord, sur le serveur Minecraft RP Viking Vyldra.
Tu t'adresses aux Marchands et membres de la Compagnie — tes camarades de travail.
Ton ton est professionnel mais chaleureux, direct, loyal. Tu parles comme un gestionnaire viking chevronné.
Tu utilises parfois des formules nordiques ou médiévales (camarade, mes frères, Skål, etc.).
Sois concis (3-5 phrases max) et utile. Pas de bullet points dans ta narration, parle en prose.`;

const PROMPT_NOBLES = `Tu es le Conseiller Principal de la Compagnie du Fjord, sur le serveur Minecraft RP Viking Vyldra.
Tu t'adresses aux Nobles et dirigeants — les décideurs du Domaine.
Ton ton est respectueux, formel, stratégique. Tu rapportes comme un vassal instruit à ses seigneurs.
Tu utilises un langage soutenu, quasi diplomatique. Tu conclus souvent par une recommandation d'action.
Sois concis (3-5 phrases max) et précis. Pas de bullet points, parle en prose noble.`;

const PROMPT_VISITEURS = `Tu es le Commis aux Visiteurs de la Compagnie du Fjord, sur le serveur Minecraft RP Viking Vyldra.
Tu t'adresses à des visiteurs extérieurs — potentiels clients ou vendeurs qui découvrent la Compagnie.
Ton ton est accueillant, enthousiaste, commercial. Tu valorises la Compagnie et ses services.
Utilise des formules chaleureuses mais reste dans le thème viking médiéval RP.
Sois concis (3-5 phrases max). Pas de bullet points, parle en prose accessible.`;

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 1 — Résumé hebdomadaire (lundi 9h)
// ─────────────────────────────────────────────────────────────────────────────
export async function postWeeklySummary(client) {
  const today = new Date().toISOString().slice(0, 10);
  if (cfgGet('LAST_WEEKLY_SUMMARY') === today) return;
  cfgSet_local('LAST_WEEKLY_SUMMARY', today);

  // Données de la semaine
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

  // Domaine
  const narrateDomaine = await narrateIA(
    `Voici les chiffres de la semaine : ${resumeBrut}\nRédige un résumé hebdomadaire narratif pour les marchands de la Compagnie.`,
    PROMPT_DOMAINE
  );
  // Nobles
  const narrateNobles = await narrateIA(
    `Voici les chiffres de la semaine : ${resumeBrut}\nRédige un rapport hebdomadaire stratégique pour les Nobles dirigeants de la Compagnie.`,
    PROMPT_NOBLES
  );
  // Visiteurs
  const narrateVisiteurs = await narrateIA(
    `Voici les chiffres de la semaine : ${resumeBrut}\nRédige un bref message d'ambiance commerciale pour les visiteurs de la Compagnie, sans révéler les détails internes. Valorise la Compagnie.`,
    PROMPT_VISITEURS
  );

  const embedBase = (titre, narration, color) => new EmbedBuilder()
    .setTitle(`📜 Chronique du jour — ${date}`)
    .setDescription(narration ?? resumeBrut)
    .setColor(color)
    .setFooter({ text: titre })
    .setTimestamp();

  if (narrateDomaine)
    await postInSection(client, 'domaine', [embedBase('Rapport — Membres de la Compagnie', narrateDomaine, 0xC9A84C)]);
  if (narrateNobles)
    await postInSection(client, 'nobles', [embedBase('Rapport aux Seigneurs — Compagnie du Fjord', narrateNobles, 0x8B0000)]);
  if (narrateVisiteurs)
    await postInSection(client, 'visiteurs', [embedBase('La Compagnie du Fjord — Cette semaine', narrateVisiteurs, 0x5865F2)]);
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 2 — Alerte stock enrichie par l'IA
// ─────────────────────────────────────────────────────────────────────────────
const stockCooldowns = new Map();

export async function alerteStockEnrichie(client, ressource, quantite, unite, seuil) {
  const cle = `stock-ia:${ressource}`;
  const last = stockCooldowns.get(cle) ?? 0;
  if (Date.now() - last < 6 * 3600_000) return; // cooldown 6h
  stockCooldowns.set(cle, Date.now());

  const epuise = quantite === 0;
  const contexte = epuise
    ? `La ressource "${ressource}" est complètement épuisée dans les entrepôts de la Compagnie.`
    : `La ressource "${ressource}" est à ${quantite} ${unite}, sous le seuil d'alerte de ${seuil} ${unite}.`;

  const narrateDomaine = await narrateIA(
    `${contexte} Rédige une alerte RP pour les marchands.`,
    PROMPT_DOMAINE
  );
  const narrateNobles = await narrateIA(
    `${contexte} Rédige une alerte concise et stratégique pour les Nobles.`,
    PROMPT_NOBLES
  );

  const color = epuise ? 0xFF0000 : 0xFF8C00;
  const titre = epuise ? `⬛ Stock épuisé — ${ressource}` : `⚠️ Stock bas — ${ressource}`;

  if (narrateDomaine) {
    const embed = new EmbedBuilder().setTitle(titre).setDescription(narrateDomaine).setColor(color)
      .setFooter({ text: 'Intendant — Alerte Entrepôts' }).setTimestamp();
    await postInSection(client, 'domaine', [embed]);
  }
  if (narrateNobles) {
    const embed = new EmbedBuilder().setTitle(titre).setDescription(narrateNobles).setColor(color)
      .setFooter({ text: 'Conseiller — Rapport Stratégique' }).setTimestamp();
    await postInSection(client, 'nobles', [embed]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 3 — Accueil personnalisé nouveau membre
// ─────────────────────────────────────────────────────────────────────────────
export async function accueilNouveauMembre(client, member) {
  const pseudo = member.displayName ?? member.user.globalName ?? member.user.username;

  const narration = await narrateIA(
    `Un nouveau visiteur nommé "${pseudo}" vient d'arriver sur le serveur de la Compagnie du Fjord. Rédige un message d'accueil chaleureux et immersif pour l'accueillir dans le salon des visiteurs.`,
    PROMPT_VISITEURS
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
// FEATURE 4 — Relance commandes en attente +48h (DM + annonce salon Domaine)
// ─────────────────────────────────────────────────────────────────────────────
const relanceCooldowns = new Map();

export async function relanceCommandesEnAttente(client) {
  const vieilles = db.prepare(
    "SELECT id, client_id, client_pseudo, ressource, quantite, unite, prix_total FROM commandes WHERE statut='en_attente' AND creee_le <= datetime('now','-48 hours')"
  ).all();

  for (const cmd of vieilles) {
    const cle = `relance:${cmd.id}`;
    const last = relanceCooldowns.get(cle) ?? 0;
    if (Date.now() - last < 24 * 3600_000) continue; // relance max 1x/24h
    relanceCooldowns.set(cle, Date.now());

    // DM au client
    try {
      const user = await client.users.fetch(cmd.client_id).catch(() => null);
      if (user) {
        const texte = await narrateIA(
          `La commande #${String(cmd.id).padStart(4,'0')} de "${cmd.client_pseudo}" pour "${cmd.ressource} ×${cmd.quantite} ${cmd.unite}" est en attente depuis plus de 48h. Rédige un DM poli et RP pour informer le client que sa commande est toujours en cours de traitement et le rassurer.`,
          PROMPT_VISITEURS
        );
        if (texte) {
          const embed = new EmbedBuilder()
            .setTitle(`📦 Votre commande est en cours de traitement`)
            .setDescription(texte)
            .setColor(0xC9A84C)
            .setFooter({ text: `Commande #${String(cmd.id).padStart(4,'0')} — Compagnie du Fjord` })
            .setTimestamp();
          await user.send({ embeds: [embed] }).catch(() => {});
        }
      }
    } catch {}

    // Alerte salon Domaine
    const narrateDomaine = await narrateIA(
      `La commande #${String(cmd.id).padStart(4,'0')} de "${cmd.client_pseudo}" pour "${cmd.ressource} ×${cmd.quantite} ${cmd.unite}" (${cmd.prix_total} bronze) est en attente depuis plus de 48h sans traitement. Rédige une alerte interne pour les marchands pour les inciter à traiter cette commande rapidement.`,
      PROMPT_DOMAINE
    );
    if (narrateDomaine) {
      const embed = new EmbedBuilder()
        .setTitle(`⏳ Commande #${String(cmd.id).padStart(4,'0')} — Relance nécessaire`)
        .setDescription(narrateDomaine)
        .setColor(0xFF8C00)
        .setFooter({ text: `Client : ${cmd.client_pseudo} · ${cmd.ressource} ×${cmd.quantite}` })
        .setTimestamp();
      await postInSection(client, 'domaine', [embed]);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 6 — Commentaire IA sur nouvelle commande / offre de vente
// ─────────────────────────────────────────────────────────────────────────────
export async function commentaireNouvelleCommande(client, commande) {
  const contexte = `Une nouvelle commande a été passée : "${commande.client_pseudo}" commande "${commande.ressource} ×${commande.quantite} ${commande.unite}" pour ${commande.prix_total} bronze. Note client : "${commande.note || 'aucune'}".`;

  // Visiteurs : commentaire d'accueil de la commande
  const texteVisiteurs = await narrateIA(
    `${contexte} Rédige un message RP chaleureux pour accueillir cette commande dans le salon des visiteurs, comme si l'Intendant prenait note de la demande.`,
    PROMPT_VISITEURS
  );
  // Domaine : notification interne
  const texteDomaine = await narrateIA(
    `${contexte} Rédige une courte notification interne RP pour informer les marchands qu'une commande vient d'être enregistrée et demande une prise en charge.`,
    PROMPT_DOMAINE
  );

  if (texteVisiteurs) {
    const embed = new EmbedBuilder()
      .setTitle(`🛒 Nouvelle commande enregistrée`)
      .setDescription(texteVisiteurs)
      .setColor(0x5865F2)
      .setFooter({ text: `${commande.client_pseudo} · ${commande.ressource} ×${commande.quantite}` })
      .setTimestamp();
    await postInSection(client, 'visiteurs', [embed]);
  }
  if (texteDomaine) {
    const embed = new EmbedBuilder()
      .setTitle(`📋 Commande #${String(commande.id).padStart(4,'0')} — À traiter`)
      .setDescription(texteDomaine)
      .setColor(0xC9A84C)
      .setFooter({ text: `${commande.client_pseudo} · ${commande.ressource} ×${commande.quantite} · ${commande.prix_total}🟤` })
      .setTimestamp();
    await postInSection(client, 'domaine', [embed]);
  }
}

export async function commentaireNouvelleOffre(client, offre) {
  const contexte = `Un vendeur nommé "${offre.vendeur_pseudo}" propose "${offre.ressource} ×${offre.quantite} ${offre.unite}" au prix de ${offre.prix_demande} bronze. Note : "${offre.note || 'aucune'}".`;

  const texteDomaine = await narrateIA(
    `${contexte} Rédige une courte notification interne RP pour informer les marchands qu'une nouvelle offre de vente est disponible.`,
    PROMPT_DOMAINE
  );
  const texteNobles = await narrateIA(
    `${contexte} Rédige une note stratégique concise pour les Nobles : est-ce une ressource intéressante à acquérir pour la Compagnie ?`,
    PROMPT_NOBLES
  );

  if (texteDomaine) {
    const embed = new EmbedBuilder()
      .setTitle(`🏪 Nouvelle offre de vente — ${offre.ressource}`)
      .setDescription(texteDomaine)
      .setColor(0xC9A84C)
      .setFooter({ text: `${offre.vendeur_pseudo} · ${offre.ressource} ×${offre.quantite} · ${offre.prix_demande}🟤` })
      .setTimestamp();
    await postInSection(client, 'domaine', [embed]);
  }
  if (texteNobles) {
    const embed = new EmbedBuilder()
      .setTitle(`📊 Offre de vente — Note stratégique`)
      .setDescription(texteNobles)
      .setColor(0x8B0000)
      .setFooter({ text: `${offre.vendeur_pseudo} · ${offre.ressource} ×${offre.quantite} · ${offre.prix_demande}🟤` })
      .setTimestamp();
    await postInSection(client, 'nobles', [embed]);
  }
}

// Helper local cfgSet (évite import circulaire si besoin)
function cfgSet_local(key, value) {
  db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)').run(key, value);
}
