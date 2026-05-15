import { EmbedBuilder } from 'discord.js';
import db, { stmts } from '../db/database.js';
import { cfgGet } from './setup.js';
import { getSaisonInfo, getCulturesParSaison, SAISON_LABELS, SAISON_EMOJIS } from './saison.js';

const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2h entre deux alertes identiques

function cooldownOk(cle) {
  const row = stmts.alerteLogGet.get(cle);
  if (!row) return true;
  const age = Date.now() - new Date(row.derniere_le + 'Z').getTime();
  return age > COOLDOWN_MS;
}

function markAlerted(cle) {
  stmts.alerteLogUpsert.run(cle);
}

async function sendAlerte(client, embed) {
  const channelId = cfgGet('ALERTE_CHANNEL_ID');
  if (!channelId) return;
  try {
    const ch = await client.channels.fetch(channelId);
    await ch.send({ embeds: [embed] });
  } catch (e) {
    console.error('[Alertes]', e.message);
  }
}

// ── Calcul segment client ──────────────────────────────────────────────────────
export function calcSegment(nb_livrees, nb_annulees, total_bronze) {
  if (nb_annulees >= 3) return 'RISQUE';
  if (total_bronze >= 500 || nb_livrees >= 10) return 'VIP';
  if (nb_livrees >= 3) return 'REGULIER';
  return 'NOUVEAU';
}

export function segmentEmoji(seg) {
  return { VIP: '👑', REGULIER: '🤝', RISQUE: '⚠️', NOUVEAU: '🆕' }[seg] ?? '•';
}

// ── Vérifications périodiques ──────────────────────────────────────────────────
async function checkStockAlertes(client) {
  try {
    const stocks = db.prepare(
      "SELECT ressource, quantite, unite, seuil_alerte FROM stock WHERE quantite=0 OR (seuil_alerte>0 AND quantite<=seuil_alerte)"
    ).all();

    for (const s of stocks) {
      const cle = `stock:${s.ressource}`;
      if (!cooldownOk(cle)) continue;
      markAlerted(cle);

      const critique = s.quantite === 0;
      const embed = new EmbedBuilder()
        .setTitle(critique ? `⬛ Stock épuisé — ${s.ressource}` : `⚠️ Stock bas — ${s.ressource}`)
        .setDescription(
          critique
            ? `**${s.ressource}** est **épuisé**. Des clients attendent peut-être cette ressource.`
            : `**${s.ressource}** est à **${s.quantite} ${s.unite}**, sous le seuil d'alerte (${s.seuil_alerte}).`
        )
        .setColor(critique ? 0xFF0000 : 0xFF8C00)
        .setFooter({ text: 'Intelligence Économique — Compagnie du Fjord' })
        .setTimestamp();

      await sendAlerte(client, embed);
    }
  } catch (e) { console.error('[checkStock]', e.message); }
}

async function checkCommandesEnAttente(client) {
  try {
    const db = db;
    const vieilles = db.prepare(
      "SELECT id, client_pseudo, ressource, quantite, prix_total FROM commandes WHERE statut='en_attente' AND creee_le <= datetime('now','-2 hours')"
    ).all();

    if (vieilles.length === 0) return;
    const cle = `commandes_attente:${vieilles.length}:${vieilles[0].id}`;
    if (!cooldownOk(cle)) return;
    markAlerted(cle);

    const lines = vieilles.map(c => `• **#${String(c.id).padStart(4,'0')}** — ${c.client_pseudo} · ${c.ressource} ×${c.quantite} · ${c.prix_total}🟤`).join('\n');
    const embed = new EmbedBuilder()
      .setTitle(`⏳ ${vieilles.length} commande(s) en attente depuis +2h`)
      .setDescription(lines.slice(0, 2000))
      .setColor(0xFFCC00)
      .setFooter({ text: 'Intelligence Économique — Compagnie du Fjord' })
      .setTimestamp();

    await sendAlerte(client, embed);
  } catch (e) { console.error('[checkCommandes]', e.message); }
}

async function checkTresorerie(client) {
  try {
    const db = db;
    const tresor = parseInt(cfgGet('TRESOR_BRONZE') ?? '0');
    const seuil  = parseInt(cfgGet('ALERTE_TRESOR_SEUIL') ?? '500');
    if (tresor > seuil) return;

    const cle = `tresor:${Math.floor(tresor / 50)}`;
    if (!cooldownOk(cle)) return;
    markAlerted(cle);

    const or     = Math.floor(tresor / 100);
    const argent = Math.floor((tresor % 100) / 10);
    const bronze = tresor % 10;

    const embed = new EmbedBuilder()
      .setTitle('🏦 Trésorerie critique !')
      .setDescription(`La trésorerie est à **${or}🟡 ${argent}⚪ ${bronze}🟤** (${tresor} bronze).\nSeuil d'alerte : **${seuil}🟤**`)
      .setColor(0xFF0000)
      .setFooter({ text: 'Intelligence Économique — Compagnie du Fjord' })
      .setTimestamp();

    await sendAlerte(client, embed);
  } catch (e) { console.error('[checkTresor]', e.message); }
}

async function checkContratsExpirants(client) {
  try {
    const contrats = stmts.contratExpirant.all();
    for (const c of contrats) {
      const cle = `contrat:expire:${c.id}`;
      if (!cooldownOk(cle)) continue;
      markAlerted(cle);

      const echeance = new Date(c.echeance_le + 'Z');
      const embed = new EmbedBuilder()
        .setTitle(`📜 Contrat #${String(c.id).padStart(4,'0')} expire bientôt !`)
        .setDescription(
          `**${c.ressource}** ×${c.quantite} — ${c.prix_total}🟤\n` +
          `Vendeur : **${c.vendeur_pseudo}**${c.acheteur_pseudo ? ` · Acheteur : **${c.acheteur_pseudo}**` : ' · *Non accepté*'}\n` +
          `Échéance : <t:${Math.floor(echeance.getTime()/1000)}:R>` +
          (c.penalite > 0 ? `\nPénalité de retard : **${c.penalite}🟤**` : '')
        )
        .setColor(0xFF8C00)
        .setFooter({ text: 'Intelligence Économique — Compagnie du Fjord' })
        .setTimestamp();

      await sendAlerte(client, embed);
    }
  } catch (e) { console.error('[checkContrats]', e.message); }
}

// ── Alerte commande VIP ────────────────────────────────────────────────────────
export async function alerteNouvelleCommande(client, commande) {
  try {
    const stats = stmts.clientStatsGet.get(commande.client_id);
    const isGros = commande.prix_total >= 200;
    const isVIP  = stats?.segment === 'VIP';

    if (!isGros && !isVIP) return;

    const cle = `commande:vip:${commande.id}`;
    if (!cooldownOk(cle)) return;
    markAlerted(cle);

    const tags = [];
    if (isVIP)  tags.push('👑 CLIENT VIP');
    if (isGros) tags.push('💰 GROSSE COMMANDE');

    const embed = new EmbedBuilder()
      .setTitle(`${tags.join(' · ')} — Nouvelle commande`)
      .setDescription(
        `**${commande.client_pseudo}** vient de commander :\n` +
        `**${commande.ressource}** ×${commande.quantite} ${commande.unite} — **${commande.prix_total}🟤**\n` +
        (commande.note ? `Note : "${commande.note}"` : '') +
        (isVIP ? `\n\n${stats.nb_livrees} commandes livrées · ${stats.total_bronze}🟤 dépensés au total` : '')
      )
      .setColor(isVIP ? 0xFFD700 : 0x00CC66)
      .setFooter({ text: 'Intelligence Économique — Compagnie du Fjord' })
      .setTimestamp();

    await sendAlerte(client, embed);
  } catch {}
}

const COULEURS_SAISON = { printemps: 0x90EE90, ete: 0xFFD700, automne: 0xD2691E, hiver: 0xADD8E6 };

async function checkChangementSaison(client) {
  try {
    const info = getSaisonInfo();
    if (!info) return;

    const precedente = stmts.cfgGet.get('SAISON_PRECEDENTE')?.value;
    if (precedente === info.saison) return;

    // La saison a changé — on met à jour SAISON_PRECEDENTE
    stmts.cfgSet.run('SAISON_PRECEDENTE', info.saison);

    const cultures  = getCulturesParSaison(info.saison);
    const normales  = cultures.filter(c => !c.perenne).map(c => c.nom);
    const perennes  = cultures.filter(c => c.perenne).map(c => c.nom);

    const maintenant = Date.now();
    const prochaineTs = Math.floor(info.finSaisonTs / 1000);

    const embed = new EmbedBuilder()
      .setTitle(`${info.emoji} Changement de saison — ${info.label} commence !`)
      .setDescription(
        `Le monde de Vyldra entre dans une nouvelle phase.\n` +
        `Prochaine saison : **${info.prochaineEmoji} ${info.prochaineLabel}** <t:${prochaineTs}:R>`
      )
      .setColor(COULEURS_SAISON[info.saison])
      .addFields(
        normales.length
          ? { name: '🌱 Cultures de saison (poussent normalement)', value: normales.join(', '), inline: false }
          : { name: '🌱 Cultures de saison', value: 'Aucune culture en saison.', inline: false },
        perennes.length
          ? { name: '🔄 Cultures pérennes actives (repousse 10 min)', value: perennes.join(', '), inline: false }
          : [],
      )
      .setFooter({ text: 'Intelligence Économique — Compagnie du Fjord' })
      .setTimestamp();

    await sendAlerte(client, embed);
  } catch (e) { console.error('[checkSaison]', e.message); }
}

// ── Démarrage du monitoring ────────────────────────────────────────────────────
export function startMonitoring(client) {
  const INTERVAL = 5 * 60 * 1000; // toutes les 5 min

  const tick = async () => {
    await checkChangementSaison(client);
    await checkStockAlertes(client);
    await checkCommandesEnAttente(client);
    await checkTresorerie(client);
    await checkContratsExpirants(client);
  };

  setTimeout(tick, 30_000); // premier tick 30s après démarrage
  setInterval(tick, INTERVAL);
  console.log('[Alertes] Monitoring démarré (intervalle 5 min)');
}
