import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { cfgGet, cfgSet, requireOwner } from '../utils/setup.js';

export const data = new SlashCommandBuilder()
  .setName('forum')
  .setDescription('Configure les forums de tickets de la Compagnie')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub => sub
    .setName('acheteurs')
    .setDescription('Définit le forum des commandes (acheteurs)')
    .addChannelOption(opt => opt
      .setName('forum')
      .setDescription('Channel Forum dédié aux commandes')
      .addChannelTypes(ChannelType.GuildForum)
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('vendeurs')
    .setDescription('Définit le forum des offres de vente (vendeurs)')
    .addChannelOption(opt => opt
      .setName('forum')
      .setDescription('Channel Forum dédié aux offres de vente')
      .addChannelTypes(ChannelType.GuildForum)
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('info')
    .setDescription('Affiche les forums actuellement configurés')
  );

export async function execute(interaction) {
  if (!requireOwner(interaction)) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'acheteurs') {
    const channel = interaction.options.getChannel('forum');
    cfgSet('FORUM_COMMANDES_ID', channel.id);
    await interaction.reply({
      content: `✅ **Forum acheteurs** configuré : ${channel}\nLes prochaines commandes créeront un post par acheteur dans ce forum.`,
      flags: 64,
    });
  }

  if (sub === 'vendeurs') {
    const channel = interaction.options.getChannel('forum');
    cfgSet('FORUM_OFFRES_ID', channel.id);
    await interaction.reply({
      content: `✅ **Forum vendeurs** configuré : ${channel}\nLes prochaines offres de vente créeront un post par vendeur dans ce forum.`,
      flags: 64,
    });
  }

  if (sub === 'info') {
    const acheteurs = cfgGet('FORUM_COMMANDES_ID');
    const vendeurs  = cfgGet('FORUM_OFFRES_ID');
    await interaction.reply({
      content:
        `🛒 **Forum acheteurs :** ${acheteurs ? `<#${acheteurs}>` : '*non configuré*'}\n` +
        `📦 **Forum vendeurs :** ${vendeurs  ? `<#${vendeurs}>`  : '*non configuré*'}`,
      flags: 64,
    });
  }
}
