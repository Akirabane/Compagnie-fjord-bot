import { EmbedBuilder, ChannelType } from 'discord.js';
import { stmts } from '../db/database.js';
import { cfgGet } from './setup.js';
import { getSaisonInfo, getCulturesParSaison } from './saison.js';

const COULEURS_SAISON = { printemps: 0x90EE90, ete: 0xFFD700, automne: 0xD2691E, hiver: 0xADD8E6 };

// Noms de salons/titres que les anciens embeds de saison pouvaient avoir
const SEASON_EMBED_TITLES = [
  's\'éveille sur Vyldra',
  'Changement de saison',
  'commence sur Vyldra',
];

function buildSaisonEmbed(info, normales, perennes) {
  const prochaineTs = Math.floor(info.finSaisonTs / 1000);
  return new EmbedBuilder()
    .setTitle(`${info.emoji} ${info.label} — Saison actuelle de Vyldra`)
    .setDescription(
      `Prochaine saison : **${info.prochaineEmoji} ${info.prochaineLabel}** <t:${prochaineTs}:R>`
    )
    .setColor(COULEURS_SAISON[info.saison] ?? 0xC9A84C)
    .addFields(
      normales.length
        ? { name: '🌱 Cultures de saison', value: normales.join(', '), inline: false }
        : { name: '🌱 Cultures de saison', value: 'Aucune culture en saison.', inline: false },
      perennes.length
        ? { name: '🔄 Cultures pérennes actives', value: perennes.join(', '), inline: false }
        : [],
    )
    .setFooter({ text: 'Cycle saisonnier Vyldra — Compagnie du Fjord' })
    .setTimestamp();
}

async function getOrCreateSaisonChannel(client) {
  const saved = cfgGet('SAISON_CHANNEL_ID');
  if (saved) {
    const ch = await client.channels.fetch(saved).catch(() => null);
    if (ch) return ch;
  }

  // Récupère la catégorie du salon proactif Domaine
  const domaineId = cfgGet('IA_PROACTIF_DOMAINE_ID');
  let categoryId = null;
  if (domaineId) {
    const domaineCh = await client.channels.fetch(domaineId).catch(() => null);
    categoryId = domaineCh?.parentId ?? null;
  }

  const guildId = cfgGet('GUILD_ID') || '1502720095393415208';
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;

  const newCh = await guild.channels.create({
    name: 'saison',
    type: ChannelType.GuildText,
    parent: categoryId,
    topic: 'Saison en cours sur Vyldra — mis à jour automatiquement',
  }).catch(e => { console.error('[saison-embed] create channel:', e.message); return null; });

  if (newCh) {
    stmts.cfgSet.run('SAISON_CHANNEL_ID', newCh.id);
    console.log(`[saison-embed] Salon #saison créé : ${newCh.id}`);
  }
  return newCh;
}

export async function updateSaisonEmbed(client) {
  try {
    const info = getSaisonInfo();
    if (!info) return;

    const cultures = getCulturesParSaison(info.saison);
    const normales = cultures.filter(c => !c.perenne).map(c => c.nom);
    const perennes = cultures.filter(c => c.perenne).map(c => c.nom);
    const embed = buildSaisonEmbed(info, normales, perennes);

    const ch = await getOrCreateSaisonChannel(client);
    if (!ch?.isTextBased()) return;

    // Supprime l'ancien embed du bot
    const oldMsgId = cfgGet('SAISON_MSG_ID');
    if (oldMsgId) {
      await ch.messages.fetch(oldMsgId).then(m => m.delete()).catch(() => {});
    }

    const msg = await ch.send({ embeds: [embed] });
    stmts.cfgSet.run('SAISON_MSG_ID', msg.id);
  } catch (e) {
    console.error('[saison-embed]', e.message);
  }
}

// Nettoie les anciens embeds de saison dans les salons proactifs
export async function cleanOldSaisonEmbeds(client) {
  const channelIds = [
    cfgGet('IA_PROACTIF_VISITEURS_ID'),
    cfgGet('IA_PROACTIF_DOMAINE_ID'),
    cfgGet('IA_PROACTIF_NOBLES_ID'),
  ].filter(Boolean);

  for (const id of channelIds) {
    try {
      const ch = await client.channels.fetch(id).catch(() => null);
      if (!ch?.isTextBased()) continue;
      const messages = await ch.messages.fetch({ limit: 50 }).catch(() => null);
      if (!messages) continue;
      for (const msg of messages.values()) {
        if (!msg.author.bot) continue;
        const embed = msg.embeds?.[0];
        if (!embed?.title) continue;
        if (SEASON_EMBED_TITLES.some(t => embed.title.includes(t))) {
          await msg.delete().catch(() => {});
          console.log(`[saison-embed] Nettoyé embed saison dans ${id}`);
        }
      }
    } catch (e) {
      console.error('[saison-embed] cleanup:', e.message);
    }
  }
}
