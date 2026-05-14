import { SlashCommandBuilder } from 'discord.js';
import { embedSucces, embedErreur } from '../utils/embeds.js';

const ROLE_MARCHAND = '1502788350665556149';
const ROLE_VISITEUR = '1503068672392957992';

// Hiérarchie RP : index 0 = bas, index N = haut
// Les IDs null sont résolus dynamiquement par nom
const HIERARCHY = [
  { name: 'Visiteur',  id: ROLE_VISITEUR },
  { name: 'Paysan',    id: null },
  { name: 'Écuyer',    id: null },
  { name: 'Noble',     id: null },
  { name: 'Jarl',      id: null },
];

async function resolveHierarchy(guild) {
  await guild.roles.fetch();
  return HIERARCHY.map(h => {
    if (h.id) return { ...h, role: guild.roles.cache.get(h.id) ?? null };
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === h.name.toLowerCase()) ?? null;
    return { ...h, role };
  });
}

async function findMember(guild, pseudo) {
  const results = await guild.members.search({ query: pseudo, limit: 10 });
  if (results.size === 0) return null;
  // Priorité : nickname exact > username exact > premier résultat
  return (
    results.find(m => (m.nickname ?? '').toLowerCase() === pseudo.toLowerCase()) ??
    results.find(m => m.user.username.toLowerCase() === pseudo.toLowerCase()) ??
    results.first()
  );
}

// ── /promote ──────────────────────────────────────────────────────────────────
async function doPromote(interaction, pseudo) {
  await interaction.deferReply({ flags: 64 });
  const guild    = interaction.guild;
  const member   = await findMember(guild, pseudo);
  if (!member) return interaction.editReply({ embeds: [embedErreur(`Membre **${pseudo}** introuvable.`)] });

  const hierarchy = await resolveHierarchy(guild);
  const currentIdx = [...hierarchy].reverse().findIndex(h => h.role && member.roles.cache.has(h.role.id));
  const realIdx    = currentIdx === -1 ? -1 : hierarchy.length - 1 - currentIdx;

  if (realIdx >= hierarchy.length - 1) {
    return interaction.editReply({ embeds: [embedErreur(`**${member.displayName}** est déjà au rang le plus élevé (${hierarchy[hierarchy.length-1].name}).`)] });
  }

  const nextLevel = hierarchy[realIdx + 1];
  if (!nextLevel.role) {
    return interaction.editReply({ embeds: [embedErreur(`Rôle **${nextLevel.name}** introuvable sur le serveur. Créez-le d'abord.`)] });
  }

  // Retirer l'ancien rang RP
  if (realIdx >= 0 && hierarchy[realIdx].role) {
    try { await member.roles.remove(hierarchy[realIdx].role); } catch {}
  }
  await member.roles.add(nextLevel.role);

  const from = realIdx >= 0 ? hierarchy[realIdx].name : '(sans rang)';
  return interaction.editReply({ embeds: [embedSucces(`**${member.displayName}** promu : **${from}** → **${nextLevel.name}**`)] });
}

// ── /demote ───────────────────────────────────────────────────────────────────
async function doDemote(interaction, pseudo) {
  await interaction.deferReply({ flags: 64 });
  const guild    = interaction.guild;
  const member   = await findMember(guild, pseudo);
  if (!member) return interaction.editReply({ embeds: [embedErreur(`Membre **${pseudo}** introuvable.`)] });

  const hierarchy = await resolveHierarchy(guild);
  const currentIdx = [...hierarchy].reverse().findIndex(h => h.role && member.roles.cache.has(h.role.id));
  const realIdx    = currentIdx === -1 ? -1 : hierarchy.length - 1 - currentIdx;

  if (realIdx <= 0) {
    return interaction.editReply({ embeds: [embedErreur(`**${member.displayName}** est déjà au rang le plus bas ou sans rang RP.`)] });
  }

  const prevLevel = hierarchy[realIdx - 1];
  if (!prevLevel.role) {
    return interaction.editReply({ embeds: [embedErreur(`Rôle **${prevLevel.name}** introuvable sur le serveur. Créez-le d'abord.`)] });
  }

  await member.roles.remove(hierarchy[realIdx].role);
  await member.roles.add(prevLevel.role);

  return interaction.editReply({ embeds: [embedSucces(`**${member.displayName}** rétrogradé : **${hierarchy[realIdx].name}** → **${prevLevel.name}**`)] });
}

// ── /add_compagnie_member ────────────────────────────────────────────────────
async function doAddMember(interaction, pseudo) {
  await interaction.deferReply({ flags: 64 });
  const member = await findMember(interaction.guild, pseudo);
  if (!member) return interaction.editReply({ embeds: [embedErreur(`Membre **${pseudo}** introuvable.`)] });

  const role = interaction.guild.roles.cache.get(ROLE_MARCHAND);
  if (!role) return interaction.editReply({ embeds: [embedErreur('Rôle Marchand introuvable.')] });

  if (member.roles.cache.has(ROLE_MARCHAND)) {
    return interaction.editReply({ embeds: [embedErreur(`**${member.displayName}** est déjà membre de la Compagnie.`)] });
  }

  await member.roles.add(role);
  return interaction.editReply({ embeds: [embedSucces(`**${member.displayName}** a rejoint **La Compagnie du Fjord** ! ⚓`)] });
}

// ── Commandes slash ───────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('roles')
  .setDescription('Gestion des rangs RP')
  .setDefaultMemberPermissions('0')
  .addSubcommand(sub =>
    sub.setName('promote')
      .setDescription('Promouvoir un membre (Visiteur → Paysan → Écuyer → Noble → Jarl)')
      .addStringOption(o => o.setName('pseudo').setDescription('Pseudo Discord ou RP du membre').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('demote')
      .setDescription('Rétrograder un membre dans la hiérarchie RP')
      .addStringOption(o => o.setName('pseudo').setDescription('Pseudo Discord ou RP du membre').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('add_compagnie_member')
      .setDescription('Donner le rôle Marchand de la Compagnie à un membre')
      .addStringOption(o => o.setName('pseudo').setDescription('Pseudo Discord ou RP du membre').setRequired(true))
  );

export async function execute(interaction) {
  const sub    = interaction.options.getSubcommand();
  const pseudo = interaction.options.getString('pseudo');

  if (sub === 'promote')             return doPromote(interaction, pseudo);
  if (sub === 'demote')              return doDemote(interaction, pseudo);
  if (sub === 'add_compagnie_member') return doAddMember(interaction, pseudo);
}
