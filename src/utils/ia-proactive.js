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

// ── Niveau 3 : espacer les posts (cooldown par salon, 2h) ─────────────────────
const lastPostPerSection = { visiteurs: 0, domaine: 0, nobles: 0 };
const COOLDOWN_SECTION_MS = 2 * 3600_000;

async function getSectionChannel(client, section) {
  const id = cfgGet(SECTIONS[section].cfgKey);
  if (!id) return null;
  return client.channels.fetch(id).catch(() => null);
}

async function postInSection(client, section, embeds, force = false) {
  if (!force && Date.now() - lastPostPerSection[section] < COOLDOWN_SECTION_MS) return false;
  const channel = await getSectionChannel(client, section);
  if (!channel?.isTextBased()) return false;
  await channel.send({ embeds }).catch(e => console.error(`[ia-proactif][${section}]`, e.message));
  lastPostPerSection[section] = Date.now();
  return true;
}

async function narrateIA(prompt, systemPrompt) {
  try { return await askNvidia(prompt, systemPrompt, []); } catch { return null; }
}

// ── Routeur IA ────────────────────────────────────────────────────────────────
// Retourne [{ section, message, format }] ou [] si inutile.
// format peut être "court" | "long" | "fields" — décidé par l'IA (Niveau 3)
const PROMPT_ROUTEUR = `Tu es le système de communication proactif de la Compagnie du Fjord, guilde marchande sur le serveur Minecraft RP Viking Vyldra.
Tu reçois des événements internes et tu décides :
1. Si l'événement mérite d'être communiqué (filtre le bruit)
2. Dans quels salons parmi : visiteurs, domaine, nobles
3. Le message adapté au ton de chaque section
4. Le format : "court" (2-3 phrases), "long" (5-6 phrases, pour les annonces importantes)

Sections :
- visiteurs : clients/voyageurs extérieurs. Ton chaleureux, commercial. Pas de détails internes sensibles.
- domaine : marchands et membres (Paysans, Écuyers, Compagnie). Ton professionnel, camaraderie viking, direct.
- nobles : dirigeants (Nobles, Jarl). Ton formel, stratégique. Seulement pour événements à fort enjeu financier ou stratégique.

Règles absolues :
- Les alertes de stock bas → post:false (géré ailleurs)
- Commande ordinaire d'un nouveau client → post:false (trop banal)
- Commande notable (>200 bronze, client récurrent 5+ commandes, ressource rare) → peut valoir domaine
- Offre de vente → domaine si ressource utile, nobles si valeur élevée (>500 bronze)
- Félicitations → toujours courtes et sincères
- Viking médiéval RP, prose, sans bullet points

Réponds UNIQUEMENT en JSON :
{"post":true,"sections":[{"section":"domaine","message":"...","format":"court"}]}
ou {"post":false}`;

async function router(evenement) {
  try {
    const raw = await askNvidia(evenement, PROMPT_ROUTEUR, []);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!parsed.post) return [];
    return parsed.sections ?? [];
  } catch { return []; }
}

function buildEmbed(titre, message, section, footer) {
  return new EmbedBuilder()
    .setTitle(titre)
    .setDescription(message)
    .setColor(SECTIONS[section]?.color ?? 0xC9A84C)
    .setFooter({ text: footer ?? 'Compagnie du Fjord' })
    .setTimestamp();
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 1 — Résumé quotidien 16h
// ═════════════════════════════════════════════════════════════════════════════
export async function postWeeklySummary(client) {
  const today = new Date().toISOString().slice(0, 10);
  if (cfgGet('LAST_WEEKLY_SUMMARY') === today) return;
  db.prepare("INSERT OR REPLACE INTO config (key,value) VALUES ('LAST_WEEKLY_SUMMARY',?)").run(today);

  const since = "datetime('now','-7 days')";
  const commandesSemaine = db.prepare(`SELECT COUNT(*) as nb, SUM(prix_total) as total FROM commandes WHERE statut='livree' AND creee_le >= ${since}`).get();
  const offresSemaine = db.prepare(`SELECT COUNT(*) as nb FROM offres_vente WHERE statut='acceptee' AND creee_le >= ${since}`).get();
  const topProduit = db.prepare(`SELECT ressource, COUNT(*) as nb FROM commandes WHERE statut='livree' AND creee_le >= ${since} GROUP BY ressource ORDER BY nb DESC LIMIT 1`).get();
  const stocksCritiques = db.prepare(`SELECT COUNT(*) as nb FROM stock WHERE seuil_alerte > 0 AND quantite <= seuil_alerte`).get();
  const tresor = parseInt(cfgGet('TRESOR_BRONZE') ?? '0');

  const resumeBrut = [
    `Ces 7 derniers jours : ${commandesSemaine.nb} commandes livrées pour ${commandesSemaine.total ?? 0} bronze au total.`,
    topProduit ? `Produit le plus demandé : ${topProduit.ressource} (${topProduit.nb} fois).` : '',
    `${offresSemaine.nb} offres de vente acceptées.`,
    `Trésorerie actuelle : ${bronzeVersTexte(tresor)}.`,
    stocksCritiques.nb > 0 ? `${stocksCritiques.nb} ressource(s) en stock critique.` : 'Tous les stocks sont au-dessus des seuils.',
  ].filter(Boolean).join(' ');

  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const [nDomaine, nNobles, nVisiteurs] = await Promise.all([
    narrateIA(`Chiffres : ${resumeBrut}\nRédige un résumé narratif pour les marchands du Domaine. Ton viking professionnel.`,
      `Tu es l'Intendant de la Compagnie du Fjord. Prose, 3-5 phrases, ton camarade viking.`),
    narrateIA(`Chiffres : ${resumeBrut}\nRédige un rapport stratégique pour les Nobles. Conclus par une recommandation.`,
      `Tu es le Conseiller Principal de la Compagnie du Fjord. Prose formelle, 3-5 phrases.`),
    narrateIA(`Chiffres : ${resumeBrut}\nRédige un message d'ambiance commerciale pour les visiteurs, sans détails internes.`,
      `Tu es le Commis aux Visiteurs de la Compagnie du Fjord. Ton chaleureux, 2-3 phrases.`),
  ]);

  const mkEmbed = (texte, footer, color) => new EmbedBuilder()
    .setTitle(`📜 Chronique du jour — ${date}`).setDescription(texte)
    .setColor(color).setFooter({ text: footer }).setTimestamp();

  if (nDomaine)   await postInSection(client, 'domaine',   [mkEmbed(nDomaine,   'Rapport — Membres de la Compagnie',   0xC9A84C)], true);
  if (nNobles)    await postInSection(client, 'nobles',    [mkEmbed(nNobles,    'Rapport aux Seigneurs',               0x8B0000)], true);
  if (nVisiteurs) await postInSection(client, 'visiteurs', [mkEmbed(nVisiteurs, 'La Compagnie du Fjord — Aujourd\'hui', 0x5865F2)], true);
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 2 — Narration RP d'un changement de saison
// ═════════════════════════════════════════════════════════════════════════════
export async function narrateSaisonChange(client, info, normales, perennes) {
  const contexte = `La saison ${info.label} commence sur Vyldra. Cultures de saison : ${normales.join(', ') || 'aucune'}. Cultures pérennes actives : ${perennes.join(', ') || 'aucune'}. Prochaine saison : ${info.prochaineLabel}.`;

  const COULEURS_SAISON = { printemps: 0x90EE90, ete: 0xFFD700, automne: 0xD2691E, hiver: 0xADD8E6 };
  const color = COULEURS_SAISON[info.saison] ?? 0xC9A84C;

  const [nDomaine, nNobles, nVisiteurs] = await Promise.all([
    narrateIA(`${contexte}\nRédige une annonce RP immersive pour les marchands du Domaine sur ce changement de saison et ses implications commerciales.`,
      `Tu es l'Intendant de la Compagnie du Fjord (Vyldra, RP Viking). Prose viking, 4-5 phrases, mentionne les ressources et opportunités.`),
    narrateIA(`${contexte}\nRédige une note stratégique pour les Nobles sur ce changement de saison : quels impacts sur l'économie de la Compagnie ?`,
      `Tu es le Conseiller Principal de la Compagnie du Fjord. Ton formel et stratégique, 3-4 phrases.`),
    narrateIA(`${contexte}\nRédige une annonce publique poétique sur le changement de saison à Vyldra, pour les visiteurs et voyageurs.`,
      `Tu es le héraut de la Compagnie du Fjord. Ton lyrique et épique viking, 3-4 phrases, immersif.`),
  ]);

  const titre = `${info.emoji} ${info.label} s'éveille sur Vyldra`;
  if (nDomaine)   await postInSection(client, 'domaine',   [buildEmbed(titre, nDomaine,   'domaine',   'Intendant — Annonce Saisonnière')], true);
  if (nNobles)    await postInSection(client, 'nobles',    [buildEmbed(titre, nNobles,    'nobles',    'Conseiller — Note Stratégique')], true);
  if (nVisiteurs) await postInSection(client, 'visiteurs', [buildEmbed(titre, nVisiteurs, 'visiteurs', 'La Compagnie du Fjord — Vyldra')], true);
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 3 — Accueil nouveau membre / nouveau Marchand
// ═════════════════════════════════════════════════════════════════════════════
export async function accueilNouveauMembre(client, member) {
  const pseudo = member.displayName ?? member.user.globalName ?? member.user.username;
  const narration = await narrateIA(
    `Un nouveau visiteur nommé "${pseudo}" vient d'arriver sur le serveur de la Compagnie du Fjord. Rédige un message d'accueil chaleureux et immersif.`,
    `Tu es le Commis aux Visiteurs de la Compagnie du Fjord (RP Viking Vyldra). Ton chaleureux, 2-3 phrases, prose.`
  );
  if (!narration) return;
  const embed = new EmbedBuilder()
    .setTitle(`🛶 Un voyageur arrive au Fjord !`).setDescription(narration)
    .setColor(0x5865F2).setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: 'Commis aux Visiteurs — Compagnie du Fjord' }).setTimestamp();
  await postInSection(client, 'visiteurs', [embed], true);
}

export async function dmNouveauMarchand(member) {
  const pseudo = member.displayName ?? member.user.globalName ?? member.user.username;
  const narration = await narrateIA(
    `"${pseudo}" vient d'être accueilli comme nouveau Marchand de la Compagnie du Fjord sur Vyldra. Rédige un DM de bienvenue chaleureux, RP et viking, qui lui explique qu'il fait maintenant partie de la Compagnie et l'encourage à consulter les ressources disponibles.`,
    `Tu es l'Intendant de la Compagnie du Fjord. Ton fraternel et solennel, 3-4 phrases, prose viking.`
  );
  if (!narration) return;
  const embed = new EmbedBuilder()
    .setTitle(`⚓ Bienvenue dans la Compagnie du Fjord, Marchand !`)
    .setDescription(narration).setColor(0xC9A84C)
    .setFooter({ text: 'La Compagnie du Fjord — Les 3 Routes' }).setTimestamp();
  await member.send({ embeds: [embed] }).catch(() => {});
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 4 — Relance commandes en attente +48h (avec évaluation d'urgence)
// ═════════════════════════════════════════════════════════════════════════════
const relanceCooldowns = new Map();

export async function relanceCommandesEnAttente(client) {
  const vieilles = db.prepare(
    "SELECT c.*, (SELECT COUNT(*) FROM commandes WHERE client_id=c.client_id AND statut='livree') as nb_livrees FROM commandes c WHERE c.statut='en_attente' AND c.creee_le <= datetime('now','-48 hours')"
  ).all();

  for (const cmd of vieilles) {
    const cle = `relance:${cmd.id}`;
    const last = relanceCooldowns.get(cle) ?? 0;
    if (Date.now() - last < 24 * 3600_000) continue;
    relanceCooldowns.set(cle, Date.now());

    // Niveau 3 : évaluer l'urgence selon historique client
    const estPrioritaire = cmd.nb_livrees >= 5 || cmd.prix_total >= 25;

    // DM client
    const user = await client.users.fetch(cmd.client_id).catch(() => null);
    if (user) {
      const texte = await narrateIA(
        `Commande #${String(cmd.id).padStart(4,'0')} de "${cmd.client_pseudo}" pour "${cmd.ressource} ×${cmd.quantite} ${cmd.unite}" en attente +48h. Client avec ${cmd.nb_livrees} commandes livrées. Rédige un DM rassurant et RP.`,
        `Tu es le Commis aux Visiteurs de la Compagnie du Fjord. Ton poli, chaleureux, RP viking. 2-3 phrases.`
      );
      if (texte) {
        const embed = new EmbedBuilder().setTitle(`📦 Votre commande est en cours de traitement`)
          .setDescription(texte).setColor(0xC9A84C)
          .setFooter({ text: `Commande #${String(cmd.id).padStart(4,'0')} — Compagnie du Fjord` }).setTimestamp();
        await user.send({ embeds: [embed] }).catch(() => {});
      }
    }

    // Routeur IA avec contexte d'urgence
    const urgence = estPrioritaire ? `C'est un client prioritaire (${cmd.nb_livrees} commandes livrées, ${cmd.prix_total} bronze).` : `Client récent.`;
    const decisions = await router(`Commande #${String(cmd.id).padStart(4,'0')} de "${cmd.client_pseudo}" pour "${cmd.ressource} ×${cmd.quantite} ${cmd.unite}" (${cmd.prix_total} bronze) en attente sans traitement depuis +48h. ${urgence} Faut-il alerter les marchands ou les Nobles ?`);

    for (const { section, message } of decisions) {
      if (!SECTIONS[section]) continue;
      const color = estPrioritaire ? 0xFF4444 : 0xFF8C00;
      const embed = new EmbedBuilder()
        .setTitle(`⏳ Commande #${String(cmd.id).padStart(4,'0')} — ${estPrioritaire ? '🔴 Urgent' : 'Relance'}`)
        .setDescription(message).setColor(color)
        .setFooter({ text: `${cmd.client_pseudo} · ${cmd.ressource} ×${cmd.quantite} · ${cmd.nb_livrees} cmd livrées` })
        .setTimestamp();
      await postInSection(client, section, [embed]);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 5 — Félicitations offre acceptée / commande livrée
// ═════════════════════════════════════════════════════════════════════════════
export async function feliciterVendeur(client, offre) {
  const texte = await narrateIA(
    `Le vendeur "${offre.vendeur_pseudo}" vient de voir son offre de "${offre.ressource} ×${offre.quantite} ${offre.unite}" acceptée par la Compagnie du Fjord pour ${offre.prix_demande} bronze. Rédige une courte félicitation RP pour lui.`,
    `Tu es l'Intendant de la Compagnie du Fjord. Ton chaleureux et reconnaissant, 2 phrases, prose viking.`
  );
  if (!texte) return;
  const embed = buildEmbed(`🤝 Accord conclu — ${offre.ressource}`, texte, 'domaine', `${offre.vendeur_pseudo} · ${offre.ressource} ×${offre.quantite}`);
  await postInSection(client, 'domaine', [embed]);
}

export async function feliciterClient(client, commande) {
  const stats = db.prepare("SELECT COUNT(*) as nb FROM commandes WHERE client_id=? AND statut='livree'").get(commande.client_id);
  const texte = await narrateIA(
    `La commande de "${commande.client_pseudo}" pour "${commande.ressource} ×${commande.quantite} ${commande.unite}" vient d'être livrée. C'est sa ${stats.nb}ème commande livrée. Rédige un court message RP de satisfaction et de remerciement.`,
    `Tu es le Commis aux Visiteurs de la Compagnie du Fjord. Ton chaleureux et sincère, 2 phrases.`
  );
  if (!texte) return;
  const embed = buildEmbed(`✅ Livraison confirmée`, texte, 'visiteurs', `${commande.client_pseudo} · ${commande.ressource} ×${commande.quantite}`);
  await postInSection(client, 'visiteurs', [embed]);
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 6 — Opportunité stock ↔ commandes en attente
// ═════════════════════════════════════════════════════════════════════════════
const opportuniteCooldowns = new Map();

export async function checkOpportunites(client) {
  const attentes = db.prepare(
    "SELECT ressource, COUNT(*) as nb, SUM(quantite) as qte_totale FROM commandes WHERE statut='en_attente' AND creee_le <= datetime('now','-24 hours') GROUP BY LOWER(ressource)"
  ).all();

  for (const cmd of attentes) {
    const stock = db.prepare("SELECT quantite, unite FROM stock WHERE LOWER(ressource)=? AND en_vente=1 AND quantite > 0").get(cmd.ressource.toLowerCase());
    if (!stock) continue;

    const cle = `opportunite:${cmd.ressource.toLowerCase()}`;
    const last = opportuniteCooldowns.get(cle) ?? 0;
    if (Date.now() - last < 12 * 3600_000) continue;
    opportuniteCooldowns.set(cle, Date.now());

    const texte = await narrateIA(
      `Opportunité détectée : ${cmd.nb} commande(s) en attente pour "${cmd.ressource}" (${cmd.qte_totale} unités demandées) depuis +24h, et la Compagnie a ${stock.quantite} ${stock.unite} de cette ressource en stock disponible à la vente. Rédige une alerte interne pour inciter les marchands à traiter ces commandes.`,
      `Tu es l'Intendant de la Compagnie du Fjord. Ton direct et motivant, 2-3 phrases, prose viking.`
    );
    if (!texte) continue;

    const embed = new EmbedBuilder()
      .setTitle(`💡 Opportunité — ${cmd.ressource}`)
      .setDescription(texte).setColor(0x00CC66)
      .setFooter({ text: `${cmd.nb} commande(s) en attente · ${stock.quantite} ${stock.unite} en stock` })
      .setTimestamp();
    await postInSection(client, 'domaine', [embed]);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 7 — Relance ambiance si silence dans les salons proactifs
// ═════════════════════════════════════════════════════════════════════════════
const SILENCE_SEUIL_MS = 6 * 3600_000; // 6h sans activité

export async function checkAmbiance(client) {
  const rumeurs = [
    "Un négociant de passage aurait vu une caravane chargée approcher de Fjordheim par le fjord nord.",
    "Des marchands de la région parlent d'une pénurie de bois à venir avant l'hiver.",
    "On dit que les forges de Skanör produisent du minerai de qualité exceptionnelle cette saison.",
    "Un voyageur aurait aperçu des traces de commerce non déclaré sur la route des 3 Routes.",
    "La foire de Vyldra approche — une belle occasion d'écouler les stocks en surplus.",
    "Des paysans murmurent que les récoltes de cette saison pourraient dépasser les prévisions.",
    "Un clan voisin chercherait à établir des relations commerciales avec la Compagnie.",
  ];

  for (const section of ['visiteurs', 'domaine']) {
    const channel = await getSectionChannel(client, section);
    if (!channel?.isTextBased()) continue;

    const messages = await channel.messages.fetch({ limit: 1 }).catch(() => null);
    if (!messages || messages.size === 0) continue;
    const lastMsg = messages.first();
    const age = Date.now() - lastMsg.createdTimestamp;
    if (age < SILENCE_SEUIL_MS) continue;

    const rumeur = rumeurs[Math.floor(Math.random() * rumeurs.length)];
    const texte = await narrateIA(
      `Rumeur du moment à Vyldra : "${rumeur}". Développe ce contexte en un court message RP pour animer le salon ${section === 'visiteurs' ? 'des visiteurs' : 'du Domaine'}.`,
      section === 'visiteurs'
        ? `Tu es le Commis aux Visiteurs de la Compagnie du Fjord. Ton mystérieux et engageant, 2-3 phrases, invite à la discussion.`
        : `Tu es l'Intendant de la Compagnie du Fjord. Ton viking et informé, 2-3 phrases, partage une info de marché.`
    );
    if (!texte) continue;

    const titres = {
      visiteurs: `🌊 Rumeurs du Fjord`,
      domaine:   `📰 Nouvelles du marché`,
    };
    const embed = buildEmbed(titres[section], texte, section, 'La Compagnie du Fjord — Vyldra');
    await postInSection(client, section, [embed], true);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 8 — DM vendeur si offre non touchée depuis 5 jours
// ═════════════════════════════════════════════════════════════════════════════
const dmVendeurCooldowns = new Map();

export async function relanceVendeurOffresAnciennes(client) {
  const vieilles = db.prepare(
    "SELECT * FROM offres_vente WHERE statut='en_attente' AND creee_le <= datetime('now','-5 days')"
  ).all();

  for (const offre of vieilles) {
    const cle = `dm-vendeur:${offre.id}`;
    const last = dmVendeurCooldowns.get(cle) ?? 0;
    if (Date.now() - last < 48 * 3600_000) continue;
    dmVendeurCooldowns.set(cle, Date.now());

    const texte = await narrateIA(
      `Le vendeur "${offre.vendeur_pseudo}" a proposé "${offre.ressource} ×${offre.quantite} ${offre.unite}" à ${offre.prix_demande} bronze il y a plus de 5 jours et son offre n'a pas encore été traitée. Rédige un DM poli et RP pour l'informer que son offre est toujours en attente et lui proposer de la modifier ou de recontacter la Compagnie.`,
      `Tu es le Commis aux Vendeurs de la Compagnie du Fjord. Ton poli, professionnel, RP viking. 2-3 phrases.`
    );
    if (!texte) continue;

    const user = await client.users.fetch(offre.vendeur_id).catch(() => null);
    if (!user) continue;

    const embed = new EmbedBuilder()
      .setTitle(`📋 Votre offre est toujours en attente`)
      .setDescription(texte).setColor(0xFF8C00)
      .setFooter({ text: `Offre #${String(offre.id).padStart(4,'0')} — ${offre.ressource} ×${offre.quantite}` })
      .setTimestamp();
    await user.send({ embeds: [embed] }).catch(() => {});
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE 6b — Commentaire nouvelle commande / offre (routeur IA)
// ═════════════════════════════════════════════════════════════════════════════
export async function commentaireNouvelleCommande(client, commande) {
  const stats = db.prepare("SELECT COUNT(*) as nb FROM commandes WHERE client_id=? AND statut='livree'").get(commande.client_id);
  const historique = stats.nb >= 5 ? `Client fidèle (${stats.nb} commandes livrées).` : stats.nb >= 1 ? `Client régulier (${stats.nb} commandes livrées).` : `Nouveau client.`;
  const decisions = await router(`Nouvelle commande : "${commande.client_pseudo}" commande "${commande.ressource} ×${commande.quantite} ${commande.unite}" pour ${commande.prix_total} bronze. Note : "${commande.note || 'aucune'}". ${historique}`);
  for (const { section, message } of decisions) {
    if (!SECTIONS[section]) continue;
    const titles = { visiteurs: '🛒 Nouvelle commande enregistrée', domaine: `📋 Commande #${String(commande.id).padStart(4,'0')} — À traiter`, nobles: '📊 Commande notable' };
    await postInSection(client, section, [buildEmbed(titles[section] ?? '📋 Commande', message, section, `${commande.client_pseudo} · ${commande.ressource} ×${commande.quantite} · ${commande.prix_total}🟤`)]);
  }
}

export async function commentaireNouvelleOffre(client, offre) {
  const decisions = await router(`Nouvelle offre de vente : "${offre.vendeur_pseudo}" propose "${offre.ressource} ×${offre.quantite} ${offre.unite}" à ${offre.prix_demande} bronze. Note : "${offre.note || 'aucune'}".`);
  for (const { section, message } of decisions) {
    if (!SECTIONS[section]) continue;
    const titles = { domaine: `🏪 Nouvelle offre — ${offre.ressource}`, nobles: '📊 Offre stratégique', visiteurs: `🏪 ${offre.ressource} disponible` };
    await postInSection(client, section, [buildEmbed(titles[section] ?? `🏪 ${offre.ressource}`, message, section, `${offre.vendeur_pseudo} · ${offre.ressource} ×${offre.quantite} · ${offre.prix_demande}🟤`)]);
  }
}
