import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { cfgGet, cfgSet, requireOwner } from '../utils/setup.js';
import { SECTIONS } from '../utils/ia-proactive.js';

export const data = new SlashCommandBuilder()
  .setName('salons-ia')
  .setDescription('Configure les salons de communication proactive de l\'IA')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub => sub
    .setName('visiteurs')
    .setDescription('Salon proactif IA — section Visiteurs')
    .addChannelOption(opt => opt
      .setName('salon')
      .setDescription('Salon texte dédié aux visiteurs')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('domaine')
    .setDescription('Salon proactif IA — section Domaine (marchands/membres)')
    .addChannelOption(opt => opt
      .setName('salon')
      .setDescription('Salon texte dédié aux membres du Domaine')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('nobles')
    .setDescription('Salon proactif IA — section Nobles')
    .addChannelOption(opt => opt
      .setName('salon')
      .setDescription('Salon texte dédié aux Nobles')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('info')
    .setDescription('Affiche les salons proactifs actuellement configurés')
  );

export async function execute(interaction) {
  if (!requireOwner(interaction)) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'info') {
    const lines = Object.entries(SECTIONS).map(([key, { label, cfgKey, color }]) => {
      const id = cfgGet(cfgKey);
      return `**${label}** : ${id ? `<#${id}>` : '❌ Non configuré'}`;
    });
    const embed = new EmbedBuilder()
      .setTitle('🤖 Salons IA Proactifs — Configuration')
      .setDescription(lines.join('\n'))
      .setColor(0xC9A84C)
      .setFooter({ text: 'Compagnie du Fjord — Intelligence Proactive' })
      .setTimestamp();
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  const channel = interaction.options.getChannel('salon');
  const sectionMap = { visiteurs: 'visiteurs', domaine: 'domaine', nobles: 'nobles' };
  const section = sectionMap[sub];
  if (!section) return interaction.reply({ content: '❌ Section inconnue.', flags: 64 });

  cfgSet(SECTIONS[section].cfgKey, channel.id);
  await interaction.reply({
    content: `✅ Salon **${SECTIONS[section].label}** configuré : ${channel}\nL'IA postera ses messages proactifs pour cette section ici.`,
    flags: 64,
  });
}
