import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { cfgGet, cfgSet, requireOwner } from '../utils/setup.js';
import { ensureMetierRoles, refreshMetiersEmbed, METIERS, getRoleMap } from '../utils/metiers.js';

export const data = new SlashCommandBuilder()
  .setName('metiers')
  .setDescription('Gestion des rôles métiers')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub => sub
    .setName('setup')
    .setDescription('Configure le salon de sélection des métiers (crée les rôles + poste l\'embed)')
    .addChannelOption(opt => opt
      .setName('salon')
      .setDescription('Salon texte dédié')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('info')
    .setDescription('Affiche la configuration actuelle des métiers')
  )
  .addSubcommand(sub => sub
    .setName('refresh')
    .setDescription('Remet à jour l\'embed dans le salon configuré')
  );

export async function execute(interaction) {
  if (!requireOwner(interaction)) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'setup') {
    await interaction.deferReply({ flags: 64 });
    const channel = interaction.options.getChannel('salon');
    cfgSet('METIERS_CHANNEL_ID', channel.id);
    cfgSet('METIERS_MSG_ID', ''); // force repost

    await interaction.editReply({ content: '⏳ Création des rôles en cours…' });

    const roleMap = await ensureMetierRoles(interaction.guild);
    const count   = Object.keys(roleMap).length;

    await refreshMetiersEmbed(interaction.client);

    await interaction.editReply({
      content:
        `✅ **${count} rôles métiers** configurés.\n` +
        `📌 Embed posté dans ${channel}.\n` +
        `Les membres peuvent désormais choisir leurs métiers !`,
    });
  }

  if (sub === 'info') {
    const channelId = cfgGet('METIERS_CHANNEL_ID');
    const roleMap   = getRoleMap();
    const lines     = METIERS.map(m => {
      const id = roleMap[m.nom];
      return `${m.emoji} **${m.nom}** → ${id ? `<@&${id}>` : '*(rôle manquant)*'}`;
    });
    await interaction.reply({
      content:
        `🏷️ **Salon :** ${channelId ? `<#${channelId}>` : '*non configuré*'}\n\n` +
        lines.join('\n'),
      flags: 64,
    });
  }

  if (sub === 'refresh') {
    await interaction.deferReply({ flags: 64 });
    await refreshMetiersEmbed(interaction.client);
    await interaction.editReply({ content: '✅ Embed métiers rafraîchi.' });
  }
}
