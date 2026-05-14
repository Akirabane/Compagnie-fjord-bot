import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { cfgGet, cfgSet, requireOwner } from '../utils/setup.js';

export const data = new SlashCommandBuilder()
  .setName('ia')
  .setDescription('Configure les salons IA de la Compagnie')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub => sub
    .setName('village')
    .setDescription('Définit le salon #intendant-village (membres de la Compagnie)')
    .addChannelOption(opt => opt
      .setName('salon')
      .setDescription('Salon texte dédié aux membres')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('visiteurs')
    .setDescription('Définit le salon #intendant-visiteurs (voyageurs et marchands de passage)')
    .addChannelOption(opt => opt
      .setName('salon')
      .setDescription('Salon texte dédié aux visiteurs')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('info')
    .setDescription('Affiche les salons IA actuellement configurés')
  );

export async function execute(interaction) {
  if (!requireOwner(interaction)) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'village') {
    const channel = interaction.options.getChannel('salon');
    cfgSet('AI_CHANNEL_ID', channel.id);
    // Déclencher le re-post de l'embed via event custom
    interaction.client.emit('postIAEmbed', 'village', channel.id);
    await interaction.reply({
      content: `✅ **#intendant-village** configuré : ${channel}\nL'embed d'accueil va être posté.`,
      flags: 64,
    });
  }

  if (sub === 'visiteurs') {
    const channel = interaction.options.getChannel('salon');
    cfgSet('AI_CHANNEL_VISITEURS_ID', channel.id);
    interaction.client.emit('postIAEmbed', 'visiteurs', channel.id);
    await interaction.reply({
      content: `✅ **#intendant-visiteurs** configuré : ${channel}\nL'embed d'accueil va être posté.`,
      flags: 64,
    });
  }

  if (sub === 'info') {
    const village   = cfgGet('AI_CHANNEL_ID');
    const visiteurs = cfgGet('AI_CHANNEL_VISITEURS_ID');
    await interaction.reply({
      content:
        `🏰 **Village :** ${village   ? `<#${village}>`   : '*non configuré*'}\n` +
        `🚪 **Visiteurs :** ${visiteurs ? `<#${visiteurs}>` : '*non configuré*'}`,
      flags: 64,
    });
  }
}
