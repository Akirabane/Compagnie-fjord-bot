import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { cfgGet, cfgSet } from './setup.js';

// ── Structure métiers + spécialisations ───────────────────────────────────────
export const METIERS = [
  {
    nom: 'Fermier',            emoji: '🌾', desc: 'Agriculture et terroir',
    specialisations: [
      { nom: 'Éleveur',        emoji: '🐄', desc: 'Rang 10 · Soin et élevage du bétail' },
      { nom: 'Botaniste',      emoji: '🌱', desc: 'Rang 10 · Plantes rares et cultures avancées' },
    ],
  },
  {
    nom: 'Chasseur / Pêcheur', emoji: '🏹', desc: 'Chasse, pêche et survie',
    specialisations: [
      { nom: 'Maître Chasseur', emoji: '🦌', desc: 'Rang 10 · Maîtrise de la chasse' },
      { nom: 'Maître Pêcheur',  emoji: '🎣', desc: 'Rang 10 · Maîtrise de la pêche' },
    ],
  },
  {
    nom: 'Bâtisseur',          emoji: '🪵', desc: 'Construction et architecture',
    specialisations: [
      { nom: 'Bâtisseur de Navire',      emoji: '⚓', desc: 'Rang 10 · Construction navale' },
      { nom: 'Architecte de Guerre',     emoji: '🏰', desc: 'Rang 10 · Fortifications et machines de guerre' },
    ],
  },
  {
    nom: 'Cuisinier',          emoji: '🍳', desc: 'Arts culinaires et brasserie',
    specialisations: [
      { nom: 'Maître des Breuvages', emoji: '🍺', desc: 'Rang 10 · Brasserie et potions culinaires' },
      { nom: 'Maître des Festins',   emoji: '🎉', desc: 'Rang 10 · Banquets et cuisine d\'exception' },
    ],
  },
  {
    nom: 'Forgeron',           emoji: '⚒️', desc: 'Forge et métallurgie',
    specialisations: [
      { nom: 'Forgeron de Guerre',              emoji: '⚔️', desc: 'Rang 10 · Armes et armures de combat' },
      { nom: "Forgeron d'Outils d'Exception",   emoji: '🔩', desc: 'Rang 10 · Outils rares et précis' },
    ],
  },
  {
    nom: 'Apothicaire',        emoji: '⚗️', desc: 'Potions, remèdes et soins',
    specialisations: [
      { nom: 'Préparateur de Remèdes', emoji: '🧪', desc: 'Rang 10 · Alchimie et élixirs' },
      { nom: 'Chirurgien',             emoji: '🩺', desc: 'Rang 10 · Soins et chirurgie de campagne' },
    ],
  },
  {
    nom: 'Ouvrier',            emoji: '🔨', desc: 'Travaux et main-d\'œuvre',
    specialisations: [
      { nom: 'Tailleur de Pierre', emoji: '🪨', desc: 'Rang 10 · Sculpture et taille de pierre' },
      { nom: 'Ébéniste',           emoji: '🪑', desc: 'Rang 10 · Menuiserie fine et ébénisterie' },
    ],
  },
  {
    nom: 'Tanneur / Couturier', emoji: '🪡', desc: 'Cuir, textile et couture',
    specialisations: [
      { nom: "Tanneur d'Excellence",    emoji: '🏅', desc: 'Rang 10 · Cuirs rares et travaux fins' },
      { nom: 'Expert en Grandes Pièces', emoji: '🧥', desc: 'Rang 10 · Pièces d\'armure et grandes tenues' },
    ],
  },
  {
    nom: 'Garde',              emoji: '⚔️', desc: 'Protection et ordre à Fjordheim',
    specialisations: [
      { nom: 'Archer',           emoji: '🎯', desc: 'Rang 10 · Tir à l\'arc et embuscade' },
      { nom: 'Fantassin Lourd',  emoji: '🛡️', desc: 'Rang 10 · Combat rapproché et défense' },
    ],
  },
  {
    nom: 'Druide',             emoji: '🌿', desc: 'Magie naturelle et rituels sacrés',
    specialisations: [
      { nom: 'Herboriste', emoji: '🍃', desc: 'Rang 10 · Plantes médicinales et remèdes naturels' },
      { nom: 'Völva',      emoji: '🔮', desc: 'Rang 10 · Divination et magie runique' },
    ],
  },
];

// Toutes les spécialisations à plat
export const SPECS = METIERS.flatMap(m => m.specialisations.map(s => ({ ...s, parent: m.nom })));

// ── Helpers config ─────────────────────────────────────────────────────────────
export function getRoleMap() {
  const raw = cfgGet('METIER_ROLES');
  return raw ? JSON.parse(raw) : {};
}

// ── Création automatique des rôles Discord ────────────────────────────────────
export async function ensureMetierRoles(guild) {
  await guild.roles.fetch();
  const roleMap = getRoleMap();
  const updated = { ...roleMap };

  const allEntries = [
    ...METIERS.map(m => ({ nom: m.nom, emoji: m.emoji, color: 0xC9A84C })), // or métier
    ...SPECS.map(s    => ({ nom: s.nom, emoji: s.emoji, color: 0x5865F2 })), // indigo spécialisation
  ];

  for (const entry of allEntries) {
    if (updated[entry.nom] && guild.roles.cache.has(updated[entry.nom])) continue;
    const role = await guild.roles.create({
      name: `${entry.emoji} ${entry.nom}`,
      colors: [entry.color],
      mentionable: false,
      reason: 'Rôle métier — La Compagnie du Fjord',
    });

    updated[entry.nom] = role.id;
    console.log(`[métiers] Rôle créé : ${role.name}`);
  }

  cfgSet('METIER_ROLES', JSON.stringify(updated));
  return updated;
}

// ── Embed principal ────────────────────────────────────────────────────────────
export function buildMetiersEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('⚒️ Métiers de Fjordheim')
    .setDescription(
      'Choisissez votre métier et, si vous avez atteint le **rang 10**, votre spécialisation.\n' +
      'Utilisez les boutons ci-dessous — vos rôles actuels seront pré-cochés.\n​'
    )
    .setColor(0xC9A84C)
    .setFooter({ text: 'La Compagnie du Fjord — Les 3 Routes' })
    .setTimestamp();

  for (const m of METIERS) {
    const specs = m.specialisations.map(s => `${s.emoji} ${s.nom}`).join(' · ');
    embed.addFields({
      name: `${m.emoji} ${m.nom}`,
      value: `*${m.desc}*\n↳ ${specs}`,
      inline: true,
    });
  }

  return embed;
}

// ── Boutons ───────────────────────────────────────────────────────────────────
export function buildMetiersButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('metiers_manage_base')
      .setLabel('⚒️ Choisir mon métier')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('metiers_manage_spec')
      .setLabel('✨ Choisir ma spécialisation (rang 10)')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ── Menus éphémères ───────────────────────────────────────────────────────────
function buildBaseMenu(memberRoleIds) {
  const roleMap = getRoleMap();
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('metiers_select_base')
      .setPlaceholder('Sélectionnez votre métier…')
      .setMinValues(0)
      .setMaxValues(METIERS.length)
      .addOptions(METIERS.map(m => ({
        label: m.nom,
        value: m.nom,
        emoji: m.emoji,
        description: m.desc.slice(0, 50),
        default: roleMap[m.nom] ? memberRoleIds.includes(roleMap[m.nom]) : false,
      })))
  );
}

function buildSpecMenu(memberRoleIds) {
  const roleMap = getRoleMap();
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('metiers_select_spec')
      .setPlaceholder('Sélectionnez votre spécialisation…')
      .setMinValues(0)
      .setMaxValues(SPECS.length)
      .addOptions(SPECS.map(s => ({
        label: s.nom,
        value: s.nom,
        emoji: s.emoji,
        description: `${s.parent} — ${s.desc.replace('Rang 10 · ', '')}`.slice(0, 50),
        default: roleMap[s.nom] ? memberRoleIds.includes(roleMap[s.nom]) : false,
      })))
  );
}

// ── Refresh embed ─────────────────────────────────────────────────────────────
export async function refreshMetiersEmbed(client) {
  const channelId = cfgGet('METIERS_CHANNEL_ID');
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    const embed   = buildMetiersEmbed();
    const row     = buildMetiersButtons();
    const msgId   = cfgGet('METIERS_MSG_ID');

    if (msgId) {
      try {
        const msg = await channel.messages.fetch(msgId);
        await msg.edit({ embeds: [embed], components: [row] });
        return;
      } catch {}
    }
    const msg = await channel.send({ embeds: [embed], components: [row] });
    cfgSet('METIERS_MSG_ID', msg.id);
  } catch (e) { console.error('[métiers refreshEmbed]', e); }
}

// ── Handlers boutons ──────────────────────────────────────────────────────────
export async function handleMetiersManageBase(interaction) {
  const memberRoleIds = [...interaction.member.roles.cache.keys()];
  await interaction.reply({
    content: '⚒️ **Métiers de base** — Vos métiers actuels sont pré-cochés. Ajustez et fermez le menu pour valider.',
    components: [buildBaseMenu(memberRoleIds)],
    flags: 64,
  });
}

export async function handleMetiersManageSpec(interaction) {
  const memberRoleIds = [...interaction.member.roles.cache.keys()];
  await interaction.reply({
    content: '✨ **Spécialisations (rang 10)** — Vos spécialisations actuelles sont pré-cochées. Ajustez et fermez le menu pour valider.',
    components: [buildSpecMenu(memberRoleIds)],
    flags: 64,
  });
}

// ── Handler select (base ou spec) ─────────────────────────────────────────────
async function syncRoles(interaction, pool, selected) {
  await interaction.deferUpdate();
  const member  = interaction.member;
  const roleMap = getRoleMap();
  const added = [], removed = [];

  for (const entry of pool) {
    const roleId = roleMap[entry.nom];
    if (!roleId) continue;
    const has   = member.roles.cache.has(roleId);
    const wants = selected.includes(entry.nom);
    try {
      if (wants && !has)  { await member.roles.add(roleId);    added.push(`${entry.emoji} ${entry.nom}`); }
      if (!wants && has)  { await member.roles.remove(roleId); removed.push(`${entry.emoji} ${entry.nom}`); }
    } catch (e) { console.error(`[métiers] Erreur rôle ${entry.nom}:`, e); }
  }

  const lines = [];
  if (added.length)   lines.push(`✅ **Ajoutés :** ${added.join(', ')}`);
  if (removed.length) lines.push(`❌ **Retirés :** ${removed.join(', ')}`);
  if (!lines.length)  lines.push('Aucun changement.');

  await interaction.editReply({ content: lines.join('\n'), components: [] });
}

export async function handleMetiersSelectBase(interaction) {
  await syncRoles(interaction, METIERS, interaction.values);
}

export async function handleMetiersSelectSpec(interaction) {
  await syncRoles(interaction, SPECS, interaction.values);
}
