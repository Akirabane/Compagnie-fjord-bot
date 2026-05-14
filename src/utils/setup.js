import { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../db/database.js';

const ROLE_MARCHAND = '1502788350665556149';
export const OWNER_ID = '211032353278132234';

export function cfgGet(key)        { return db.prepare('SELECT value FROM config WHERE key=?').get(key)?.value ?? null; }
export function cfgSet(key, value) { db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)').run(key, value); }
export function requireOwner(interaction) {
  if (interaction.user.id !== OWNER_ID) {
    interaction.reply({ content: '🔒 Accès refusé.', flags: 64 });
    return false;
  }
  return true;
}

// ── Conversion bronze → texte ─────────────────────────────────────────────────
function bronzeToText(n) {
  n = parseInt(n) || 0;
  const or = Math.floor(n / 100);
  const argent = Math.floor((n % 100) / 10);
  const bronze = n % 10;
  const parts = [];
  if (or)     parts.push(`${or}🟡`);
  if (argent) parts.push(`${argent}⚪`);
  if (bronze || !parts.length) parts.push(`${bronze}🟤`);
  return parts.join(' ');
}

// ── Embed stock ───────────────────────────────────────────────────────────────
function buildStockEmbed() {
  const rows = db.prepare(
    "SELECT * FROM stock WHERE en_vente=1 AND quantite>0 ORDER BY categorie, ressource"
  ).all();

  const byCateg = {};
  for (const r of rows) {
    if (!byCateg[r.categorie]) byCateg[r.categorie] = [];
    byCateg[r.categorie].push(r);
  }

  const embed = new EmbedBuilder()
    .setTitle('📦 Stock disponible — La Compagnie du Fjord')
    .setColor(0xC9A84C)
    .setFooter({ text: 'La Compagnie du Fjord — Les 3 Routes' })
    .setTimestamp();

  if (Object.keys(byCateg).length === 0) {
    embed.setDescription('*Aucun article disponible en ce moment.*');
  } else {
    for (const [cat, items] of Object.entries(byCateg)) {
      const lines = items.map(r => {
        const dot = r.quantite >= 20 ? '🟢' : r.quantite >= 5 ? '🟡' : '🔴';
        return `${dot} **${r.ressource}** · ${r.quantite} ${r.unite} · ${r.prix_bronze}🟤/${r.unite}`;
      });
      embed.addFields({ name: cat, value: lines.join('\n'), inline: false });
    }
  }

  return embed;
}

// ── Refresh embed stock dans #passer-une-commande ─────────────────────────────
export async function refreshStockEmbed(client) {
  const landingChannelId = cfgGet('LANDING_CHANNEL_ID');
  if (!landingChannelId) return;
  try {
    const channel = await client.channels.fetch(landingChannelId);
    const embed   = buildStockEmbed();
    const stockMsgId = cfgGet('STOCK_MSG_ID');

    if (stockMsgId) {
      try {
        const msg = await channel.messages.fetch(stockMsgId);
        await msg.edit({ embeds: [embed] });
        return;
      } catch {}
    }

    const msg = await channel.send({ embeds: [embed] });
    cfgSet('STOCK_MSG_ID', msg.id);
  } catch (e) { console.error('[refreshStockEmbed]', e); }
}

// ── Refresh embed landing (trésor + boutons) ──────────────────────────────────
export async function refreshLandingEmbed(client) {
  const landingChannelId = cfgGet('LANDING_CHANNEL_ID');
  const landingMsgId     = cfgGet('LANDING_MSG_ID');
  if (!landingChannelId || !landingMsgId) return;
  try {
    const channel = await client.channels.fetch(landingChannelId);
    const msg     = await channel.messages.fetch(landingMsgId);
    const tresor  = parseInt(cfgGet('TRESOR_BRONZE') ?? '0');

    const embed = new EmbedBuilder()
      .setTitle('⚓ La Compagnie du Fjord — Les 3 Routes')
      .setDescription(
        'Bienvenue dans notre comptoir, voyageur !\n\n' +
        '📋 **Passer une commande** — Vous souhaitez acheter des ressources ?\n' +
        '💰 **Vendre à la Compagnie** — Nous rachetons vos marchandises !\n\n' +
        `🏦 **Trésor de la Compagnie :** ${bronzeToText(tresor)}`
      )
      .setColor(0xC9A84C)
      .setFooter({ text: 'La Compagnie du Fjord — Les 3 Routes' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_new').setLabel('📋 Passer une commande').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('vente_new').setLabel('💰 Vendre à la Compagnie').setStyle(ButtonStyle.Secondary),
    );

    await msg.edit({ embeds: [embed], components: [row] });
  } catch (e) { console.error('[refreshLandingEmbed]', e); }
}

// ── Setup initial des canaux ──────────────────────────────────────────────────
export async function setupChannels(client) {
  const guild = client.guilds.cache.first();
  if (!guild) { console.error('[setup] Aucun serveur trouvé'); return; }

  await guild.channels.fetch();

  // Canal #passer-une-commande (dans la catégorie existante ou à la racine)
  let landingChannel = null;
  const savedLandingId = cfgGet('LANDING_CHANNEL_ID');
  if (savedLandingId) landingChannel = guild.channels.cache.get(savedLandingId) ?? null;
  if (!landingChannel) {
    landingChannel = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name === 'passer-une-commande'
    ) ?? null;
  }
  if (!landingChannel) {
    landingChannel = await guild.channels.create({
      name: 'passer-une-commande', type: ChannelType.GuildText,
      topic: '📦 Passez votre commande à La Compagnie du Fjord !',
      permissionOverwrites: [
        { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: ROLE_MARCHAND, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] },
      ],
    });
    console.log('[setup] Canal #passer-une-commande créé');
  }
  cfgSet('LANDING_CHANNEL_ID', landingChannel.id);

  // Message landing (créé une fois, puis refreshLandingEmbed gère les updates)
  const savedMsgId = cfgGet('LANDING_MSG_ID');
  let needsPost = true;
  if (savedMsgId) {
    try { await landingChannel.messages.fetch(savedMsgId); needsPost = false; } catch {}
  }
  if (needsPost) {
    const tresor = parseInt(cfgGet('TRESOR_BRONZE') ?? '0');
    const embed = new EmbedBuilder()
      .setTitle('⚓ La Compagnie du Fjord — Les 3 Routes')
      .setDescription(
        'Bienvenue dans notre comptoir, voyageur !\n\n' +
        '📋 **Passer une commande** — Vous souhaitez acheter des ressources ?\n' +
        '💰 **Vendre à la Compagnie** — Nous rachetons vos marchandises !\n\n' +
        `🏦 **Trésor de la Compagnie :** ${bronzeToText(tresor)}`
      )
      .setColor(0xC9A84C)
      .setFooter({ text: 'La Compagnie du Fjord — Les 3 Routes' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_new').setLabel('📋 Passer une commande').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('vente_new').setLabel('💰 Vendre à la Compagnie').setStyle(ButtonStyle.Secondary),
    );

    const msg = await landingChannel.send({ embeds: [embed], components: [row] });
    cfgSet('LANDING_MSG_ID', msg.id);
    console.log('[setup] Message landing posté');
  }

  // Embed stock
  await refreshStockEmbed(client);

  console.log(`[setup] ✅ OK — landing: ${landingChannel.id}`);
}
