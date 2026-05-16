import { EmbedBuilder, ChannelType } from 'discord.js';
import { stmts } from '../db/database.js';
import { cfgGet } from './setup.js';
import { getSaisonInfo, getCulturesParSaison } from './saison.js';

const COULEURS_SAISON = { printemps: 0x90EE90, ete: 0xFFD700, automne: 0xD2691E, hiver: 0xADD8E6 };

const SEASON_EMBED_TITLES = [
  's\'éveille sur Vyldra',
  'Changement de saison',
  'commence sur Vyldra',
];

const LORE_SAISON = {
  printemps: {
    ambiance: '🌸 Le dégel libère les fjords. Les premiers bourgeons percent la neige durcie, et les marchands de Fjordheim rouvrent leurs comptoirs après les longues veillées hivernales.',
    conseil:  'Profitez du renouveau — les cultures reprennent, les routes commerciales se rouvrent. C\'est le moment d\'approvisionner les stocks avant la haute saison.',
  },
  ete: {
    ambiance: '☀️ Le soleil nordique haut dans le ciel illumine les fjords sans relâche. Les récoltes battent leur plein, les caravanes circulent jour et nuit, et la Compagnie tourne à plein régime.',
    conseil:  'Haute saison commerciale. Les ressources abondent mais les prix fluctuent vite — surveillez les opportunités et remplissez les coffres.',
  },
  automne: {
    ambiance: '🍂 Les feuilles d\'or tombent sur Fjordheim. L\'air sent la tourbe et la résine de pin. Les marchands s\'activent pour engranger les dernières récoltes avant que le froid ne referme les routes.',
    conseil:  'Constituez les réserves hivernales. C\'est la dernière fenêtre pour écouler les surplus et passer les grandes commandes avant le gel.',
  },
  hiver: {
    ambiance: '❄️ La glace enserre les fjords et le vent hurle sur les toits de chaume de Fjordheim. Les voyages se font rares, mais la Compagnie reste ouverte — l\'Intendant ne dort jamais.',
    conseil:  'Commerce ralenti. Les ressources hivernales sont précieuses. Gérez les stocks avec soin et anticipez les pénuries — le prochain printemps déterminera notre fortune.',
  },
};

function buildSaisonEmbed(info, normales, perennes) {
  const prochaineTs = Math.floor(info.finSaisonTs / 1000);
  const lore = LORE_SAISON[info.saison];

  const fields = [];

  fields.push({
    name: '​',
    value: `*${lore.ambiance}*`,
    inline: false,
  });

  fields.push({
    name: '🌱 Cultures en saison',
    value: normales.length ? normales.map(n => `• ${n}`).join('\n') : '*Aucune culture de saison.*',
    inline: true,
  });

  fields.push({
    name: '🔄 Cultures pérennes',
    value: perennes.length ? perennes.map(p => `• ${p}`).join('\n') : '*Aucune.*',
    inline: true,
  });

  fields.push({ name: '​', value: '​', inline: false });

  fields.push({
    name: '📜 Note de l\'Intendant',
    value: lore.conseil,
    inline: false,
  });

  fields.push({
    name: '⏳ Prochaine saison',
    value: `**${info.prochaineEmoji} ${info.prochaineLabel}** — <t:${prochaineTs}:R> *(soit <t:${prochaineTs}:t>)*`,
    inline: false,
  });

  return new EmbedBuilder()
    .setTitle(`${info.emoji} ${info.label} sur Vyldra`)
    .setDescription(
      `**Le cycle naturel de Vyldra est entré dans sa phase de ${info.label.toLowerCase()}.**\n` +
      `Toutes les informations agricoles et commerciales de la saison sont réunies ici.\n​`
    )
    .setColor(COULEURS_SAISON[info.saison] ?? 0xC9A84C)
    .addFields(...fields)
    .setFooter({ text: '⚓ La Compagnie du Fjord — Les 3 Routes • Cycle saisonnier Vyldra' })
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
    name: '🌾・saison',
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
