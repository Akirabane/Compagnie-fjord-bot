import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { cfgGet, cfgSet, requireOwner } from '../utils/setup.js';

export const data = new SlashCommandBuilder()
  .setName('alertes')
  .setDescription('Configure le système d\'alertes automatiques')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub => sub
    .setName('salon')
    .setDescription('Définit le salon où envoyer les alertes')
    .addChannelOption(opt => opt
      .setName('salon')
      .setDescription('Salon texte pour les alertes')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('tresor')
    .setDescription('Seuil d\'alerte trésorerie (en bronze)')
    .addIntegerOption(opt => opt
      .setName('seuil')
      .setDescription('Alerte si trésorerie < ce montant (en bronze)')
      .setRequired(true)
    )
  )
  .addSubcommand(sub => sub
    .setName('info')
    .setDescription('Affiche la configuration actuelle des alertes')
  );

export async function execute(interaction) {
  if (!requireOwner(interaction)) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'salon') {
    const channel = interaction.options.getChannel('salon');
    cfgSet('ALERTE_CHANNEL_ID', channel.id);
    await interaction.reply({ content: `✅ Alertes configurées sur ${channel}. Le monitoring envoie ses alertes toutes les 5 minutes.`, flags: 64 });
  }

  if (sub === 'tresor') {
    const seuil = interaction.options.getInteger('seuil');
    cfgSet('ALERTE_TRESOR_SEUIL', String(seuil));
    await interaction.reply({ content: `✅ Seuil d'alerte trésorerie : **${seuil}🟤**`, flags: 64 });
  }

  if (sub === 'info') {
    const channelId = cfgGet('ALERTE_CHANNEL_ID');
    const seuil     = cfgGet('ALERTE_TRESOR_SEUIL') ?? '500';
    await interaction.reply({
      content:
        `📡 **Salon alertes :** ${channelId ? `<#${channelId}>` : '*non configuré*'}\n` +
        `🏦 **Seuil trésorerie :** ${seuil}🟤\n` +
        `⏱️ **Intervalle :** toutes les 5 minutes\n\n` +
        `**Alertes actives :**\n` +
        `• ⬛ Stock épuisé / ⚠️ Stock bas (seuil d'alerte par ressource)\n` +
        `• ⏳ Commandes en attente depuis +2h\n` +
        `• 🏦 Trésorerie critique\n` +
        `• 👑 Commandes VIP ou grosses commandes (+200🟤)\n` +
        `• 📜 Contrats expirant dans moins de 24h`,
      flags: 64,
    });
  }
}
