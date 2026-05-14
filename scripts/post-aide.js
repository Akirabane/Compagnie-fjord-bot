import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const CHANNEL_ID = '1503070770983604244';

const PAGES = [
  {
    title: '📖 Commandes — Membres & Visiteurs (1/3)',
    color: 0xC9A84C,
    fields: [
      { name: '⚓ `/commander`',  value: 'Passer une commande de ressources auprès de la Compagnie.' },
      { name: '📦 `/catalogue`',  value: 'Parcourir le catalogue complet des ressources disponibles à la vente.' },
      { name: '📜 `/tarifs`',     value: 'Consulter les tarifs officiels de la Compagnie par métier.' },
      { name: '🍺 `/recette`',    value: 'Rechercher une recette de craft du serveur, par profession ou par nom.' },
      { name: '🪙 `/bourse`',     value: 'Convertir une somme en Or/Argent/Bronze, ou calculer un prix de revient.' },
      { name: '🎒 `/macommande`', value: 'Suivre l\'état de vos commandes en cours auprès de la Compagnie.' },
      { name: '💰 `/prix`',       value: 'Tableau de prix comparatif entre toutes les régions de Vyldra.' },
      { name: '⚒️ `/metiers`',    value: 'Choisir ou administrer les rôles métiers disponibles sur le serveur.' },
    ],
  },
  {
    title: '🤖 Commandes IA & Avancées (2/3)',
    color: 0x3dd68c,
    fields: [
      { name: '🏰 Intendant IA',   value: 'Écrivez dans le salon village ou visiteurs pour parler à l\'Intendant en temps réel (stock, prix, lore…).' },
      { name: '🖼️ `/analyser`',    value: 'Envoyer une image (inventaire, carte, screenshot) — l\'IA l\'analyse et conseille.' },
      { name: '🤝 `/negocier`',     value: 'Soumettre une offre commerciale à l\'IA pour un verdict : ACCEPTER / CONTRE-PROPOSER / REFUSER.' },
      { name: '📜 `/contrat`',      value: 'Créer, consulter, accepter ou changer le statut d\'un contrat commercial entre joueurs.' },
      { name: '💬 `/recap`',        value: 'Voir ou effacer votre historique de conversation avec l\'Intendant IA (25 messages par joueur).' },
      { name: '🧾 `/inventaire`',   value: 'Consulter votre profil client : historique, réputation, segment (VIP/Régulier/Risque).' },
      { name: '🌐 Tableau de bord', value: '**[fjord.zenkai-police.tech](https://fjord.zenkai-police.tech/)** — Interface web complète : stock, commandes, trésorerie, IA, contrats, wiki.' },
    ],
  },
  {
    title: '🛡️ Commandes Marchands & Administration (3/3)',
    color: 0x1A3A5C,
    fields: [
      { name: '📋 `/commandes`', value: 'Gérer les commandes clients : lister, consulter, changer le statut, marquer livrée.' },
      { name: '🗄️ `/stock`',     value: 'Consulter et mettre à jour le stock de la Compagnie, avec alertes de seuil bas.' },
      { name: '📈 `/marche`',    value: 'Appliquer des fluctuations de prix par catégorie (avec annonce RP automatique).' },
      { name: '📯 `/annonce`',   value: 'Publier une annonce RP officielle (cargaison, enchère, recrutement, alerte…).' },
      { name: '👑 `/roles`',     value: 'Promouvoir ou rétrograder des membres dans la hiérarchie RP de la Compagnie.' },
      { name: '🔔 `/alertes`',   value: 'Configurer le salon des alertes Intelligence Économique (stock critique, grosses commandes VIP…).' },
      { name: '💬 `/forum`',     value: 'Configurer les forums Discord pour les commandes acheteurs et offres vendeurs.' },
      { name: '🤖 `/ia`',        value: 'Configurer les salons de l\'Intendant IA (membres et visiteurs).' },
    ],
  },
];

function buildEmbed(page) {
  const p = PAGES[page];
  return new EmbedBuilder()
    .setColor(p.color)
    .setTitle(p.title)
    .setDescription('🌐 **[Accéder au tableau de bord web](https://fjord.zenkai-police.tech/)**\n\nVoici la liste des commandes disponibles sur ce serveur. Utilisez les boutons ◀ ▶ pour naviguer entre les pages.')
    .addFields(p.fields)
    .setFooter({ text: `⚓ La Compagnie du Fjord — Les 3 Routes • Fjordheim, Empire de Skanor  •  Page ${page + 1}/${PAGES.length}` });
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
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel?.isTextBased()) { console.error('Canal introuvable ou non textuel'); client.destroy(); return; }

    // Supprimer les anciens messages du bot dans ce canal
    const existing = await channel.messages.fetch({ limit: 50 });
    const botMsgs = existing.filter(m => m.author.id === client.user.id);
    for (const msg of botMsgs.values()) {
      await msg.delete().catch(() => {});
    }

    await channel.send({ embeds: [buildEmbed(0)], components: [buildRow(0)] });
    console.log('✅ Embed aide posté avec succès (3 pages).');
  } catch (e) {
    console.error('Erreur:', e.message);
  }
  client.destroy();
});

client.login(process.env.DISCORD_TOKEN);
