import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getHistory, clearHistory } from '../utils/ia.js';

export const data = new SlashCommandBuilder()
  .setName('recap')
  .setDescription('Affiche ou efface ton historique de conversation avec l\'Intendant IA')
  .addSubcommand(sub => sub
    .setName('voir')
    .setDescription('Affiche tes derniers échanges avec l\'IA')
  )
  .addSubcommand(sub => sub
    .setName('effacer')
    .setDescription('Remet à zéro ta mémoire conversationnelle avec l\'IA')
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === 'effacer') {
    clearHistory(userId);
    return interaction.reply({ content: '🗑️ Ta mémoire conversationnelle a été effacée. L\'Intendant repart de zéro à votre prochain échange.', flags: 64 });
  }

  // sub === 'voir'
  const history = getHistory(userId);
  if (history.length === 0) {
    return interaction.reply({ content: '📭 Aucun historique de conversation trouvé. Commence par envoyer un message à l\'Intendant !', flags: 64 });
  }

  const lines = history.map((m, i) => {
    const who  = m.role === 'user' ? '👤 **Toi**' : '🏰 **Intendant**';
    const text = m.content.length > 300 ? m.content.slice(0, 297) + '…' : m.content;
    // Retire le bloc [CONTEXTE DU JOUEUR] des messages utilisateur pour la lisibilité
    const clean = text.replace(/\[CONTEXTE DU JOUEUR[\s\S]*?\[FIN DU CONTEXTE[^\]]*\]\n\n/g, '').trim();
    return `${who} : ${clean}`;
  });

  // Découpe si trop long
  const MAX = 3800;
  let desc = lines.join('\n\n');
  if (desc.length > MAX) desc = desc.slice(desc.length - MAX);

  const embed = new EmbedBuilder()
    .setAuthor({ name: 'Historique — Intendant de la Compagnie', iconURL: interaction.client.user.displayAvatarURL() })
    .setDescription(desc)
    .setColor(0xC9A84C)
    .setFooter({ text: `${history.length} message(s) en mémoire · /recap effacer pour tout effacer` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: 64 });
}
