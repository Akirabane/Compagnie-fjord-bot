import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const CHANNEL_ID = '1503070770983604244';

const PAGES = [
  {
    title: '📖 Commandes de la Compagnie — Membres & Visiteurs (1/2)',
    color: 0xC9A84C,
    fields: [
      { name: '⚓ `/commander`',   value: 'Passer une commande de ressources auprès de la Compagnie.' },
      { name: '📦 `/catalogue`',   value: 'Parcourir le catalogue complet des ressources disponibles à la vente.' },
      { name: '📜 `/tarifs`',      value: 'Consulter les tarifs officiels de la Compagnie par métier.' },
      { name: '🍺 `/recette`',     value: 'Rechercher une recette de craft du serveur, par profession ou par nom.' },
      { name: '🪙 `/bourse`',      value: 'Convertir une somme en Or/Argent/Bronze, ou calculer un prix de revient.' },
      { name: '🎒 `/macommande`',  value: 'Suivre l\'état de vos commandes en cours auprès de la Compagnie.' },
      { name: '💰 `/prix`',        value: 'Tableau de prix comparatif entre toutes les régions de Vyldra.' },
      { name: '⚒️ `/metiers`',     value: 'Choisir ou administrer les rôles métiers disponibles sur le serveur.' },
    ],
  },
  {
    title: '🛡️ Commandes de la Compagnie — Marchands (2/2)',
    color: 0x1A3A5C,
    fields: [
      { name: '📋 `/commandes`',   value: 'Gérer les commandes clients : passer, lister, consulter le détail, changer le statut.' },
      { name: '🗄️ `/stock`',       value: 'Consulter et mettre à jour le stock de la Compagnie, avec alertes de seuil.' },
      { name: '📈 `/marche`',      value: 'Appliquer des fluctuations de prix par catégorie (avec annonce RP automatique).' },
      { name: '📯 `/annonce`',     value: 'Publier une annonce RP officielle (cargaison, enchère, recrutement, alerte…).' },
      { name: '🧾 `/inventaire`',  value: 'Consulter l\'historique d\'achats et la réputation d\'un client.' },
      { name: '👑 `/roles`',       value: 'Promouvoir ou rétrograder des membres dans la hiérarchie RP de la Compagnie.' },
      { name: '💬 `/forum`',       value: 'Configurer les forums Discord pour les commandes acheteurs et offres vendeurs.' },
      { name: '🤖 `/ia`',          value: 'Configurer les salons de l\'Intendant IA (membres et visiteurs).' },
    ],
  },
];

function buildEmbed(page) {
  const p = PAGES[page];
  return new EmbedBuilder()
    .setColor(p.color)
    .setTitle(p.title)
    .setDescription('🌐 **[Accéder au tableau de bord web](https://fjord.zenkai-police.tech/)**\n\nVoici la liste des commandes disponibles sur ce serveur. Utilisez les boutons pour naviguer entre les pages.')
    .addFields(p.fields)
    .setFooter({ text: '⚓ La Compagnie du Fjord — Les 3 Routes • Fjordheim, Empire de Skanor' });
}

function buildRow(page) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aide:${page - 1}`)
      .setLabel('◀ Précédent')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`aide:${page + 1}`)
      .setLabel('Suivant ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === PAGES.length - 1),
  );
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  const channel = await client.channels.fetch(CHANNEL_ID);
  await channel.send({ embeds: [buildEmbed(0)], components: [buildRow(0)] });
  console.log('Embed aide posté.');
  client.destroy();
});

client.login(process.env.DISCORD_TOKEN);
