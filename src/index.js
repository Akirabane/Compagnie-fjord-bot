import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { fileURLToPath } from 'url';
import path from 'path';
import { readdirSync } from 'fs';

import { handleSelect as catSelect, handlePage as catPage }                                        from './commands/catalogue.js';
import { handleSelect as prixSelect, handlePage as prixPage, handleToggle as prixToggle }          from './commands/prix.js';
import { handleFiltreSelect as cmdFiltre, handlePage as cmdPage, handleStatutBtn as cmdStatut }    from './commands/commandes.js';
import { handleCatSelect as stockCat, handlePage as stockPage }                                    from './commands/stock.js';
import { handleProfSelect as recProf, handleNivSelect as recNiv, handlePage as recPage, handleDetail as recDetail } from './commands/recette.js';
import { handleNav as tarifsNav } from './commands/tarifs.js';
import { setupChannels, cfgGet, cfgSet, refreshStockEmbed, OWNER_ID } from './utils/setup.js';
import { canWriteAny, hasPermission, getEffectivePermissions, detectLevelFromRoleNames, upsertUser, LEVEL_LABELS, DEFAULT_PERMISSIONS, PERMISSION_LABELS } from './utils/permissions.js';

const WRITE_ROLES = new Set(['1502722412607836310', '1502788350665556149']);

function canWrite(interaction) {
  if (interaction.user.id === OWNER_ID) return true;
  // Check DB permissions first
  if (canWriteAny(interaction.user.id, OWNER_ID)) return true;
  // Fallback to legacy role check
  return interaction.member?.roles?.cache?.some(r => WRITE_ROLES.has(r.id)) ?? false;
}

function canDo(interaction, permKey) {
  if (interaction.user.id === OWNER_ID) return true;
  if (hasPermission(interaction.user.id, permKey, OWNER_ID)) return true;
  return interaction.member?.roles?.cache?.some(r => WRITE_ROLES.has(r.id)) ?? false;
}

// Sync member permissions to DB on interaction
function syncMemberPerms(member) {
  if (!member) return;
  try {
    const roleNames = [...(member.roles?.cache?.values() ?? [])].map(r => r.name);
    const level = detectLevelFromRoleNames(roleNames);
    const existing = db.prepare('SELECT permission_level FROM user_permissions WHERE user_id=?').get(member.user.id);
    if (!existing) {
      upsertUser(member.user.id, member.user.username, member.displayName ?? member.user.username, level);
    }
  } catch {}
}
import { enqueue, askNvidia, getQueueSize, splitResponse, buildSystemPrompt, buildVisitorPrompt, getHistory, addToHistory, updatePlayerProfile } from './utils/ia.js';
import { startMonitoring, alerteNouvelleCommande, calcSegment, segmentEmoji } from './utils/alertes.js';
import { getForumOffresId, getSellerPostId, setSellerPostId, removeSellerPost, isSellerDone } from './utils/forum.js';
import {
  handleMetiersManageBase, handleMetiersManageSpec,
  handleMetiersSelectBase, handleMetiersSelectSpec,
  METIERS, SPECS,
} from './utils/metiers.js';

const METIER_NAMES = new Set([
  ...METIERS.map(m => m.nom),
  ...SPECS.map(s => s.nom),
]);
import db from './db/database.js';
import { bronzeVersTexte } from './utils/monnaie.js';
import { embedBase, embedSucces, embedErreur, COULEURS } from './utils/embeds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROLE_VISITEUR = '1503068672392957992';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
client.commands = new Collection();

for (const file of readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
  const cmd = await import(`./commands/${file}`);
  if (cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd);
}

const IA_SALON_ID = '1503397700224290886';

const EMBEDS_IA = {
  village: {
    title: '🏰 Intendant de la Compagnie — Salon Village',
    description:
      'Bienvenue dans le bureau de l\'Intendant, camarade !\n\n' +
      'Ce salon est **réservé aux membres de la Compagnie**. Posez toutes vos questions à l\'Intendant IA : stock, commandes, trésorerie, recettes, prix par région, vie à Fjordheim, lore de Vyldra…\n​',
    color: 0xC9A84C,
    fields: [
      {
        name: '📝 Comment ça marche ?',
        value:
          '• Écrivez votre question directement dans ce salon\n' +
          '• Votre message est supprimé automatiquement\n' +
          '• L\'Intendant vous répond par votre nom RP\n' +
          '• La réponse disparaît au bout de **60 secondes**',
      },
      {
        name: '💡 Exemples de questions',
        value:
          '*"Quel est l\'état de notre stock de minerais ?"*\n' +
          '*"Quelles commandes sont en attente ?"*\n' +
          '*"Combien avons-nous en trésorerie ?"*\n' +
          '*"Quelle est la marge sur les épées en fer ?"*\n' +
          '*"Annika fait son arrivée RP, comment l\'accueillir ?"*',
      },
      {
        name: '🔒 Accès',
        value: 'Réservé aux membres de la Compagnie du Fjord. Données internes confidentielles.',
      },
    ],
  },
  visiteurs: {
    title: '🚪 Comptoir des Visiteurs — La Compagnie du Fjord',
    description:
      'Bienvenue à Fjordheim, voyageur !\n\n' +
      'Je suis le commis aux visiteurs de la Compagnie du Fjord. Posez-moi vos questions sur **nos marchandises, nos prix, comment nous vendre vos ressources**, ou tout ce qui concerne la vie à Fjordheim et le monde de Vyldra.\n​',
    color: 0x5865F2,
    fields: [
      {
        name: '📝 Comment ça marche ?',
        value:
          '• Écrivez votre question directement dans ce salon\n' +
          '• Votre message est supprimé automatiquement\n' +
          '• Le commis vous répond par votre nom RP\n' +
          '• La réponse disparaît au bout de **60 secondes**',
      },
      {
        name: '💡 Ce que vous pouvez demander',
        value:
          '*"Qu\'avez-vous en stock à vendre ?"*\n' +
          '*"Je veux vous vendre du cuir, vous intéressez-vous ?"*\n' +
          '*"Comment passer une commande ?"*\n' +
          '*"Quels sont vos prix par rapport à Skanor ?"*\n' +
          '*"Je fais mon arrivée RP à Fjordheim, comment me présenter ?"*',
      },
      {
        name: '🛒 Pour commander',
        value: 'Utilisez la commande `/commander` ou le bouton "Passer une commande" dans notre salon d\'accueil.',
      },
    ],
  },
};

async function postIAEmbedForChannel(client, type, channelId) {
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;
    const messages = await channel.messages.fetch({ limit: 20 });
    for (const [, msg] of messages) {
      if (msg.author.id === client.user.id) await msg.delete().catch(() => {});
    }
    const embedDef = EMBEDS_IA[type];
    await channel.send({
      embeds: [{
        ...embedDef,
        footer: { text: 'La Compagnie du Fjord — Les 3 Routes' },
        timestamp: new Date().toISOString(),
      }],
    });
    console.log(`[IA embed] ${type} posté dans #${channel.name}`);
  } catch (e) { console.error(`[IA embed ${type}]`, e); }
}

// Event déclenché par /ia village ou /ia visiteurs
client.on('postIAEmbed', (type, channelId) => postIAEmbedForChannel(client, type, channelId));

client.once('clientReady', async () => {
  console.log(`⚓ La Compagnie du Fjord est en ligne — ${client.user.tag}`);
  await setupChannels(client);
  await postIAEmbedForChannel(client, 'village',   cfgGet('AI_CHANNEL_ID'));
  await postIAEmbedForChannel(client, 'visiteurs', cfgGet('AI_CHANNEL_VISITEURS_ID'));
  startMonitoring(client);
});

// ── Nouveau membre → rôle Visiteur automatique ────────────────────────────────
client.on('guildMemberAdd', async member => {
  try {
    const role = member.guild.roles.cache.get(ROLE_VISITEUR);
    if (role) await member.roles.add(role);
  } catch (e) { console.error('[guildMemberAdd]', e); }
});

// ── Handler modal ticket visiteur ─────────────────────────────────────────────
async function handleTicketModal(interaction) {
  const pseudo   = interaction.fields.getTextInputValue('tm_pseudo');
  const ressource = interaction.fields.getTextInputValue('tm_ressource');
  const qteRaw   = interaction.fields.getTextInputValue('tm_quantite');
  const note     = interaction.fields.getTextInputValue('tm_note') ?? '';
  const quantite = parseFloat(qteRaw) || 1;
  const clientId = interaction.user.id;

  await interaction.deferReply({ flags: 64 });

  // Prix auto depuis stock si disponible
  const article  = db.prepare('SELECT * FROM stock WHERE LOWER(ressource)=?').get(ressource.toLowerCase());
  const prixTotal = article ? Math.round(article.prix_bronze * quantite) : 0;

  const result = db.prepare(
    'INSERT INTO commandes (client_id,client_pseudo,ressource,quantite,unite,prix_total,note) VALUES (?,?,?,?,?,?,?)'
  ).run(clientId, pseudo, ressource, quantite, 'Unité', prixTotal, note);

  const commande = db.prepare('SELECT * FROM commandes WHERE id=?').get(result.lastInsertRowid);
  const num      = String(commande.id).padStart(4, '0');

  // Réserver le stock immédiatement
  db.prepare('UPDATE stock SET quantite=MAX(0,quantite-?) WHERE LOWER(ressource)=?').run(quantite, ressource.toLowerCase());

  // Créer le post forum acheteur
  let threadId = null;
  const { getForumCommandesId, getBuyerPostId, setBuyerPostId, removeBuyerPost } = await import('./utils/forum.js');
  const forumCommandesId = getForumCommandesId();
  if (forumCommandesId) {
    try {
      let postId = getBuyerPostId(clientId);
      if (postId) {
        const ok = await client.channels.fetch(postId).catch(() => null);
        if (!ok) { removeBuyerPost(clientId); postId = null; }
      }
      if (!postId) {
        const forum = await client.channels.fetch(forumCommandesId);
        const thread = await forum.threads.create({
          name: `🛒 ${pseudo}`,
          message: {
            embeds: [{
              title: `📋 Commandes — ${pseudo}`,
              description: `Ce fil regroupe toutes les commandes actives de **${pseudo}** (<@${clientId}>).\nUn marchand les traitera dans les plus brefs délais. ⚓`,
              color: 0xC9A84C,
              footer: { text: 'La Compagnie du Fjord — Les 3 Routes' },
              timestamp: new Date().toISOString(),
            }],
          },
        });
        postId = thread.id;
        setBuyerPostId(clientId, postId);
      }
      const thread = await client.channels.fetch(postId);
      const ressourceConnue = !!article;
      const embed = new EmbedBuilder()
        .setTitle(`📦 Commande #${num}`)
        .setColor(ressourceConnue ? 0xC9A84C : 0xe3b341)
        .addFields(
          { name: '📦 Ressource',  value: ressource,                                          inline: true },
          { name: '🔢 Quantité',   value: `${quantite} Unité`,                                inline: true },
          { name: '💰 Estimation', value: prixTotal ? bronzeVersTexte(prixTotal) : 'À définir', inline: true },
          { name: '⏳ Statut',     value: '⏳ En attente',                                    inline: true },
          ...(!ressourceConnue ? [{ name: '⚠️ Hors catalogue', value: 'Prix à définir manuellement.', inline: false }] : []),
          ...(note ? [{ name: '📝 Note', value: note, inline: false }] : []),
        )
        .setTimestamp()
        .setFooter({ text: 'La Compagnie du Fjord — Les 3 Routes' });

      const actions = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cmd_statut:${commande.id}:en_cours`).setLabel('⚒️ En cours').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`cmd_statut:${commande.id}:prete`).setLabel('📦 Prête').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cmd_statut:${commande.id}:livree`).setLabel('✅ Livrée').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cmd_statut:${commande.id}:annulee`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
      );

      const msg = await thread.send({ embeds: [embed], components: [actions] });
      db.prepare('UPDATE commandes SET ticket_id=?, ticket_msg_id=? WHERE id=?').run(postId, msg.id, commande.id);
      threadId = postId;
    } catch (e) { console.error('[forum ticket_modal]', e); }
  }

  await refreshStockEmbed(client);

  const replyEmbed = embedSucces(
    `Votre commande **#${num}** a été enregistrée !\n` +
    `**${ressource}** × ${quantite}\n` +
    (threadId ? `Un marchand vous contactera dans <#${threadId}>.` : 'Un marchand va vous contacter prochainement.')
  );
  return interaction.editReply({ embeds: [replyEmbed] });
}

// ── Handler modal vente visiteur ──────────────────────────────────────────────
async function handleVenteModal(interaction) {
  const pseudo      = interaction.fields.getTextInputValue('vm_pseudo');
  const ressource   = interaction.fields.getTextInputValue('vm_ressource');
  const qteRaw      = interaction.fields.getTextInputValue('vm_quantite');
  const prixRaw     = interaction.fields.getTextInputValue('vm_prix');
  const note        = interaction.fields.getTextInputValue('vm_note') ?? '';
  const quantite    = parseFloat(qteRaw) || 1;
  const prixDemande = parseInt(prixRaw) || 0;
  const clientId    = interaction.user.id;

  await interaction.deferReply({ flags: 64 });

  const result = db.prepare(
    'INSERT INTO offres_vente (vendeur_id, vendeur_pseudo, ressource, quantite, prix_demande, note) VALUES (?,?,?,?,?,?)'
  ).run(clientId, pseudo, ressource, quantite, prixDemande, note);
  const offre = db.prepare('SELECT * FROM offres_vente WHERE id=?').get(result.lastInsertRowid);
  const num   = String(offre.id).padStart(4, '0');

  // Créer le post forum vendeur
  let threadId = null;
  const forumOffresId = getForumOffresId();
  if (forumOffresId) {
    try {
      let postId = getSellerPostId(clientId);
      if (postId) {
        const ok = await client.channels.fetch(postId).catch(() => null);
        if (!ok) { removeSellerPost(clientId); postId = null; }
      }
      if (!postId) {
        const forum = await client.channels.fetch(forumOffresId);
        const thread = await forum.threads.create({
          name: `📦 ${pseudo}`,
          message: {
            embeds: [{
              title: `🛒 Offres de vente — ${pseudo}`,
              description: `Ce fil regroupe toutes les offres de vente de **${pseudo}** (<@${clientId}>).\nNos marchands les étudieront prochainement. ⚓`,
              color: 0x3fb950,
              footer: { text: 'La Compagnie du Fjord — Les 3 Routes' },
              timestamp: new Date().toISOString(),
            }],
          },
        });
        postId = thread.id;
        setSellerPostId(clientId, postId);
      }
      const thread = await client.channels.fetch(postId);
      const articleConnu = !!db.prepare('SELECT id FROM stock WHERE LOWER(ressource)=?').get(ressource.toLowerCase());
      const embed = new EmbedBuilder()
        .setTitle(`🛒 Offre #${num}`)
        .setColor(articleConnu ? 0x3fb950 : 0xe3b341)
        .addFields(
          { name: '📦 Ressource',     value: ressource,                                          inline: true },
          { name: '🔢 Quantité',      value: `${quantite} Unité`,                                inline: true },
          { name: '💰 Prix souhaité', value: prixDemande ? `${prixDemande}🟤` : 'À négocier',    inline: true },
          ...(!articleConnu ? [{ name: '⚠️ Hors catalogue', value: 'Non référencé — vérifier avant d\'accepter.', inline: false }] : []),
          ...(note ? [{ name: '📝 Note', value: note, inline: false }] : []),
        )
        .setTimestamp()
        .setFooter({ text: 'La Compagnie du Fjord — Les 3 Routes' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`vente_statut:${offre.id}:accepte`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`vente_statut:${offre.id}:refuse`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
      );

      const msg = await thread.send({ embeds: [embed], components: [row] });
      db.prepare('UPDATE offres_vente SET ticket_id=?, ticket_msg_id=? WHERE id=?').run(postId, msg.id, offre.id);
      threadId = postId;
    } catch (e) { console.error('[forum vente_modal]', e); }
  }

  return interaction.editReply({ embeds: [embedSucces(
    `Votre offre **#${num}** a été transmise !\n**${ressource}** × ${quantite}` +
    (threadId ? `\nUn marchand vous contactera dans <#${threadId}>.` : '')
  )] });
}

// ── Handler boutons accepter/refuser offre de vente ───────────────────────────
async function handleVenteStatut(interaction, id, statut) {
  await interaction.deferReply({ flags: 64 });
  const offre = db.prepare('SELECT * FROM offres_vente WHERE id=?').get(parseInt(id));
  if (!offre) return interaction.editReply({ embeds: [embedErreur('Offre introuvable.')] });

  db.prepare('UPDATE offres_vente SET statut=? WHERE id=?').run(statut, offre.id);

  // Mettre à jour le message dans le forum post (retirer les boutons, changer couleur)
  if (offre.ticket_id && offre.ticket_msg_id) {
    try {
      const thread = await client.channels.fetch(offre.ticket_id);
      const msg = await thread.messages.fetch(offre.ticket_msg_id);
      const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
        .setColor(statut === 'accepte' ? 0x3fb950 : 0xf85149);
      await msg.edit({ embeds: [updatedEmbed], components: [] });
    } catch {}
  }

  // Supprimer le post forum si toutes les offres de ce vendeur sont traitées
  if (isSellerDone(offre.vendeur_id)) {
    try {
      const thread = await client.channels.fetch(offre.ticket_id);
      if (thread) await thread.delete();
      removeSellerPost(offre.vendeur_id);
    } catch {}
  }

  const DM = {
    accepte: `✅ Votre offre de vente de **${offre.ressource}** × ${offre.quantite} a été **acceptée** par la Compagnie du Fjord ! Rendez-vous à Fjordheim pour finaliser l'échange. ⚓`,
    refuse:  `❌ Votre offre de vente de **${offre.ressource}** × ${offre.quantite} a été **refusée**. Contactez nos marchands pour plus d'informations.`,
  };
  if (offre.vendeur_id) {
    try {
      const membre = await interaction.guild.members.fetch(offre.vendeur_id);
      await membre.send(DM[statut] ?? '');
    } catch {}
  }

  // Si accepté : ajouter au stock si la ressource existe
  if (statut === 'accepte') {
    try {
      const existing = db.prepare('SELECT * FROM stock WHERE LOWER(ressource)=?').get(offre.ressource.toLowerCase());
      if (existing) {
        db.prepare('UPDATE stock SET quantite=quantite+? WHERE LOWER(ressource)=?')
          .run(offre.quantite, offre.ressource.toLowerCase());
        await refreshStockEmbed(client);
      }
    } catch {}
  }

  const label = statut === 'accepte' ? '✅ acceptée' : '❌ refusée';
  return interaction.editReply({ embeds: [embedSucces(`Offre **#${String(offre.id).padStart(4,'0')}** ${label}. DM envoyé au vendeur.`)] });
}

// ── Helpers sélecteur commande visiteur ───────────────────────────────────────
const CAT_EMOJI = {
  'Agriculture':'🌾','Minerais':'⚒️','Bois':'🪵','Pierre':'🪨','Textile':'🧵',
  'Aliments':'🍖','Armes':'⚔️','Armures':'🛡️','Outils':'🔧','Potions':'⚗️',
  'Magie':'✨','Elevage':'🐄','Pêche':'🎣','Construction':'🏗️',
};

function buildTicketModal(ressource = '', unite = 'Unité') {
  const modal = new ModalBuilder().setCustomId('ticket_modal').setTitle('📋 Passer une commande');
  const resInput = new TextInputBuilder()
    .setCustomId('tm_ressource').setLabel('Ressource souhaitée')
    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);
  if (ressource) resInput.setValue(ressource);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('tm_pseudo').setLabel('Votre pseudo RP').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
    ),
    new ActionRowBuilder().addComponents(resInput),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('tm_quantite').setLabel('Quantité').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20).setPlaceholder('ex: 64')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('tm_note').setLabel('Note / Instructions (optionnel)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300)
    ),
  );
  return modal;
}

async function showCategorySelect(interaction) {
  const cats = db.prepare("SELECT DISTINCT categorie FROM stock WHERE en_vente=1 AND quantite>0 ORDER BY categorie").all();
  if (cats.length === 0) return interaction.showModal(buildTicketModal());

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_cat')
    .setPlaceholder('Choisissez une catégorie...')
    .addOptions([
      ...cats.slice(0, 24).map(c => ({
        label: c.categorie,
        value: c.categorie,
        emoji: CAT_EMOJI[c.categorie] ?? '📦',
      })),
      { label: 'Autre ressource...', value: '__custom__', emoji: '🔍', description: 'Saisir un nom manuellement' },
    ]);

  return interaction.reply({
    content: '**📋 Passer une commande** — De quelle catégorie avez-vous besoin ?',
    components: [new ActionRowBuilder().addComponents(menu)],
    flags: 64,
  });
}

async function handleTicketCat(interaction) {
  const cat = interaction.values[0];
  if (cat === '__custom__') return interaction.showModal(buildTicketModal());

  const items = db.prepare(
    "SELECT * FROM stock WHERE categorie=? AND en_vente=1 AND quantite>0 ORDER BY ressource"
  ).all(cat);

  if (items.length === 0) return interaction.showModal(buildTicketModal());

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_res')
    .setPlaceholder('Choisissez une ressource...')
    .addOptions([
      ...items.slice(0, 24).map(r => {
        const dot = r.quantite >= 20 ? '🟢' : r.quantite >= 5 ? '🟡' : '🔴';
        return {
          label: r.ressource,
          value: r.ressource,
          description: `${dot} ${r.quantite} ${r.unite} dispo · ${r.prix_bronze}🟤/${r.unite}`,
        };
      }),
      { label: 'Autre ressource...', value: '__custom__', emoji: '🔍', description: 'Saisir un nom manuellement' },
    ]);

  return interaction.update({
    content: `**📋 Passer une commande** — ${CAT_EMOJI[cat] ?? '📦'} ${cat} — Quelle ressource ?`,
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

async function handleTicketRes(interaction) {
  const ressource = interaction.values[0];
  if (ressource === '__custom__') return interaction.showModal(buildTicketModal());
  const article = db.prepare("SELECT * FROM stock WHERE ressource=?").get(ressource);
  return interaction.showModal(buildTicketModal(ressource, article?.unite));
}

client.on('interactionCreate', async interaction => {
  try {
    // Sync member permissions to DB on each interaction
    if (interaction.member) syncMemberPerms(interaction.member);

    // ── Modals ────────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'ticket_modal') return await handleTicketModal(interaction);
      if (interaction.customId === 'vente_modal')  return await handleVenteModal(interaction);
      return;
    }

    // ── Select menus ──────────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'cat_select')               return await catSelect(interaction);
      if (interaction.customId === 'prix_select')              return await prixSelect(interaction);
      if (interaction.customId === 'cmd_filtre')               return await cmdFiltre(interaction);
      if (interaction.customId === 'stock_cat')                return await stockCat(interaction);
      if (interaction.customId === 'rec_prof')                 return await recProf(interaction);
      if (interaction.customId.startsWith('rec_niv:'))         return await recNiv(interaction);
      if (interaction.customId === 'ticket_cat')               return await handleTicketCat(interaction);
      if (interaction.customId === 'ticket_res')               return await handleTicketRes(interaction);
      if (interaction.customId === 'metiers_select_base')       return await handleMetiersSelectBase(interaction);
      if (interaction.customId === 'metiers_select_spec')       return await handleMetiersSelectSpec(interaction);
      return;
    }

    // ── Boutons ───────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
      if (interaction.customId === 'noop') return interaction.deferUpdate();

      // Boutons accessibles à tous (création + métiers)
      if (interaction.customId.startsWith('tarifs_nav:')) {
        const metier = interaction.customId.split(':')[1];
        return await tarifsNav(interaction, metier);
      }

      if (interaction.customId === 'metiers_manage_base') return await handleMetiersManageBase(interaction);
      if (interaction.customId === 'metiers_manage_spec') return await handleMetiersManageSpec(interaction);
      if (interaction.customId === 'ticket_new') return await showCategorySelect(interaction);
      if (interaction.customId === 'vente_new') {
        const modal = new ModalBuilder().setCustomId('vente_modal').setTitle('💰 Vendre à la Compagnie');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('vm_pseudo').setLabel('Votre pseudo RP').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('vm_ressource').setLabel('Ressource proposée').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('vm_quantite').setLabel('Quantité').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20).setPlaceholder('ex: 64')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('vm_prix').setLabel('Prix souhaité (en bronze)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20).setPlaceholder('ex: 150')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('vm_note').setLabel('Note (optionnel)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300)
          ),
        );
        return await interaction.showModal(modal);
      }

      // Boutons de gestion : rôles requis
      if (!canWrite(interaction)) return interaction.reply({ content: '🔒 Accès en lecture seule.', flags: 64 });

      // Boutons accepter/refuser offre de vente
      if (interaction.customId.startsWith('vente_statut:')) {
        const [, offreId, statut] = interaction.customId.split(':');
        return await handleVenteStatut(interaction, offreId, statut);
      }

      const id = interaction.customId;

      if (id.startsWith('aide:')) {
        const page = parseInt(id.split(':')[1], 10);
        const AIDE_PAGES = [
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
              { name: '🏰 Intendant IA',      value: 'Écrivez dans le salon village ou visiteurs pour parler à l\'Intendant en temps réel (stock, prix, lore…).' },
              { name: '🖼️ `/analyser`',       value: 'Envoyer une image (inventaire, carte, screenshot) — l\'IA l\'analyse et conseille.' },
              { name: '🤝 `/negocier`',        value: 'Soumettre une offre commerciale à l\'IA pour un verdict : ACCEPTER / CONTRE-PROPOSER / REFUSER.' },
              { name: '📜 `/contrat`',         value: 'Créer, consulter, accepter ou changer le statut d\'un contrat commercial entre joueurs.' },
              { name: '💬 `/recap`',           value: 'Voir ou effacer votre historique de conversation avec l\'Intendant IA (25 messages par joueur).' },
              { name: '🧾 `/inventaire`',      value: 'Consulter votre profil client : historique, réputation, segment (VIP/Régulier/Risque).' },
              { name: '🌐 Tableau de bord',    value: '**[fjord.zenkai-police.tech](https://fjord.zenkai-police.tech/)** — Interface web complète : stock, commandes, trésorerie, IA, contrats, wiki.' },
            ],
          },
          {
            title: '🛡️ Commandes Marchands & Administration (3/3)',
            color: 0x1A3A5C,
            fields: [
              { name: '📋 `/commandes`',  value: 'Gérer les commandes clients : lister, consulter, changer le statut, marquer livrée.' },
              { name: '🗄️ `/stock`',      value: 'Consulter et mettre à jour le stock de la Compagnie, avec alertes de seuil bas.' },
              { name: '📈 `/marche`',     value: 'Appliquer des fluctuations de prix par catégorie (avec annonce RP automatique).' },
              { name: '📯 `/annonce`',    value: 'Publier une annonce RP officielle (cargaison, enchère, recrutement, alerte…).' },
              { name: '👑 `/roles`',      value: 'Promouvoir ou rétrograder des membres dans la hiérarchie RP de la Compagnie.' },
              { name: '🔔 `/alertes`',    value: 'Configurer le salon des alertes Intelligence Économique (stock critique, grosses commandes VIP…).' },
              { name: '💬 `/forum`',      value: 'Configurer les forums Discord pour les commandes acheteurs et offres vendeurs.' },
              { name: '🤖 `/ia`',         value: 'Configurer les salons de l\'Intendant IA (membres et visiteurs).' },
            ],
          },
        ];
        const p = AIDE_PAGES[page];
        const embed = new EmbedBuilder()
          .setColor(p.color)
          .setTitle(p.title)
          .setDescription('🌐 **[Accéder au tableau de bord web](https://fjord.zenkai-police.tech/)**\n\nVoici la liste des commandes disponibles sur ce serveur. Utilisez les boutons pour naviguer entre les pages.')
          .addFields(p.fields)
          .setFooter({ text: '⚓ La Compagnie du Fjord — Les 3 Routes • Fjordheim, Empire de Skanor' });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`aide:${page - 1}`).setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId(`aide:${page + 1}`).setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary).setDisabled(page === AIDE_PAGES.length - 1),
        );
        return interaction.update({ embeds: [embed], components: [row] });
      }

      if (id.startsWith('cat:')) {
        const parts = id.split(':');
        const page  = parseInt(parts.pop(), 10);
        const cat   = parts.slice(1).join(':');
        return await catPage(interaction, cat, page);
      }
      if (id.startsWith('prix_toggle:')) {
        const [, cat, page, tok] = id.split(':');
        return await prixToggle(interaction, cat, parseInt(page, 10), tok);
      }
      if (id.startsWith('prix:')) {
        const parts = id.split(':');
        const page  = parseInt(parts.pop(), 10);
        const tok   = parts.pop();
        const cat   = parts.slice(1).join(':');
        return await prixPage(interaction, cat, page, tok);
      }
      if (id.startsWith('cmdlist:')) {
        const parts  = id.split(':');
        const page   = parseInt(parts.pop(), 10);
        const filtre = parts.slice(1).join(':');
        return await cmdPage(interaction, filtre, page);
      }
      if (id.startsWith('cmd_statut:')) {
        const [, numId, statut] = id.split(':');
        return await cmdStatut(interaction, parseInt(numId, 10), statut);
      }
      if (id.startsWith('stock:')) {
        const parts = id.split(':');
        const page  = parseInt(parts.pop(), 10);
        const cat   = parts.slice(1).join(':');
        return await stockPage(interaction, cat, page);
      }
      if (id.startsWith('rec:')) {
        const parts      = id.split(':');
        const page       = parseInt(parts.pop(), 10);
        const filtreNiv  = parts.pop();
        const profession = parts.slice(1).join(':');
        return await recPage(interaction, profession, filtreNiv, page);
      }
      if (id.startsWith('rec_detail:')) {
        const [, recId] = id.split(':');
        return await recDetail(interaction, recId);
      }
      return;
    }

    // ── Autocomplete ──────────────────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd?.autocomplete) await cmd.autocomplete(interaction);
      return;
    }

    // ── Commandes slash ───────────────────────────────────────────────────────
    if (!interaction.isChatInputCommand()) return;
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    // Commandes lecture seule accessibles à tous
    const READ_CMDS = new Set(['catalogue', 'stock', 'prix', 'recette']);
    if (!READ_CMDS.has(interaction.commandName) && !canWrite(interaction)) {
      return interaction.reply({ content: '🔒 Accès en lecture seule.', flags: 64 });
    }
    await cmd.execute(interaction);
    // Auto-suppression après 5 min (commandes non permanentes et non éphémères)
    const NO_AUTODELETE = new Set(['annonce', 'ia', 'forum', 'metiers']);
    if (!NO_AUTODELETE.has(interaction.commandName)) {
      try {
        const msg = await interaction.fetchReply();
        if (msg?.deletable) setTimeout(() => msg.delete().catch(() => {}), 5 * 60 * 1000);
      } catch { /* réponse éphémère ou introuvable */ }
    }

  } catch (err) {
    console.error(err);
    const msg = { content: '❌ Une erreur est survenue.', flags: 64 };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else if (interaction.isRepliable?.()) await interaction.reply(msg);
    } catch { /* ignore */ }
  }
});

// ── Rappels matinaux (8h00) ───────────────────────────────────────────────────
async function postMorningBriefing(client) {
  const channelId = cfgGet('ALERT_CHANNEL_ID') ?? cfgGet('LANDING_CHANNEL_ID');
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const retard48h = db.prepare(
    "SELECT id, client_pseudo, ressource, quantite, unite FROM commandes WHERE statut='en_cours' AND creee_le <= datetime('now','-48 hours')"
  ).all();
  const retard24h = db.prepare(
    "SELECT id, client_pseudo, ressource, quantite, unite FROM commandes WHERE statut='en_attente' AND creee_le <= datetime('now','-24 hours')"
  ).all();
  const stocksCritiques = db.prepare(
    'SELECT ressource, quantite, unite, seuil_alerte FROM stock WHERE seuil_alerte > 0 AND quantite <= seuil_alerte ORDER BY quantite ASC'
  ).all();

  const lines = [];
  if (retard24h.length) {
    lines.push(`**⏳ Commandes en attente depuis +24h (${retard24h.length})**`);
    for (const c of retard24h.slice(0, 10))
      lines.push(`  • #${String(c.id).padStart(4,'0')} — ${c.client_pseudo} · ${c.ressource} ×${c.quantite} ${c.unite}`);
  }
  if (retard48h.length) {
    lines.push(`\n**⚒️ Commandes en cours depuis +48h (${retard48h.length})**`);
    for (const c of retard48h.slice(0, 10))
      lines.push(`  • #${String(c.id).padStart(4,'0')} — ${c.client_pseudo} · ${c.ressource} ×${c.quantite} ${c.unite}`);
  }
  if (stocksCritiques.length) {
    lines.push(`\n**📦 Stocks critiques (${stocksCritiques.length})**`);
    for (const s of stocksCritiques.slice(0, 10)) {
      const dot = s.quantite === 0 ? '⬛ ÉPUISÉ' : `🔴 ${s.quantite} ${s.unite}`;
      lines.push(`  • ${s.ressource} : ${dot} (seuil : ${s.seuil_alerte})`);
    }
  }

  if (!lines.length) return;

  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  await channel.send({
    embeds: [{
      title: `🌅 Briefing du matin — ${date}`,
      description: lines.join('\n'),
      color: 0xe3b341,
      footer: { text: 'La Compagnie du Fjord — Rappels automatiques' },
      timestamp: new Date().toISOString(),
    }],
  }).catch(e => console.error('[briefing]', e));
}

setInterval(() => {
  const now = new Date();
  if (now.getHours() !== 8 || now.getMinutes() !== 0) return;
  const today = now.toISOString().slice(0, 10);
  if (cfgGet('LAST_BRIEFING_DATE') === today) return;
  cfgSet('LAST_BRIEFING_DATE', today);
  postMorningBriefing(client).catch(e => console.error('[briefing]', e));
}, 60_000);

// ── Nettoyage automatique du salon aide (toutes les 15 min) ──────────────────
const AIDE_CHANNEL_ID = '1503070770983604244';
const AIDE_MAX_AGE_MS = 10 * 60 * 1000;

async function cleanAideChannel() {
  try {
    const channel = await client.channels.fetch(AIDE_CHANNEL_ID);
    if (!channel?.isTextBased()) return;
    const messages = await channel.messages.fetch({ limit: 100 });
    const cutoff = Date.now() - AIDE_MAX_AGE_MS;
    const old = messages.filter(m => m.createdTimestamp < cutoff);
    for (const msg of old.values()) {
      await msg.delete().catch(() => {});
    }
  } catch (e) {
    console.error('[aide-clean]', e);
  }
}

setInterval(() => cleanAideChannel(), 15 * 60 * 1000);

// ── Salon IA — chat avec l'Intendant ──────────────────────────────────────────
const AUTO_DELETE_MS = 60_000;
function autoDelete(msg) {
  setTimeout(() => msg.delete().catch(() => {}), AUTO_DELETE_MS);
}

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content?.trim()) return;

  const villageId   = cfgGet('AI_CHANNEL_ID');
  const visiteursId = cfgGet('AI_CHANNEL_VISITEURS_ID');
  const isVillage   = villageId   && message.channelId === villageId;
  const isVisiteurs = visiteursId && message.channelId === visiteursId;
  if (!isVillage && !isVisiteurs) return;

  const isVisitorChannel = isVisiteurs;

  // Supprimer le message de l'utilisateur immédiatement
  message.delete().catch(e => console.error('[IA] Suppression message échouée:', e.message));

  // ── Contexte joueur ───────────────────────────────────────────────────────
  const member      = message.member;
  const displayName = member?.displayName ?? message.author.globalName ?? message.author.username;
  const username    = message.author.username;

  let nomRP = displayName;
  if (displayName.includes('|')) {
    nomRP = displayName.split('|').pop().trim();
  }

  // Uniquement métiers et spécialisations (pas les grades comme Paysan, Écuyer…)
  const roles = (member?.roles?.cache ?? new Map())
    .filter(r => {
      const clean = r.name.replace(/^[\p{Emoji}\s]+/u, '').trim();
      return METIER_NAMES.has(clean);
    })
    .sort((a, b) => b.position - a.position)
    .map(r => r.name.replace(/^[\p{Emoji}\s]+/u, '').trim());

  // Sync member to permissions DB and get their level
  syncMemberPerms(member);
  const { level: permLevel, permissions: effectivePerms } = getEffectivePermissions(message.author.id);
  const levelLabel = LEVEL_LABELS[permLevel] ?? '🚪 Visiteur';
  const grantedPerms = Object.entries(effectivePerms)
    .filter(([, v]) => v)
    .map(([k]) => PERMISSION_LABELS[k] ?? k);

  // Segment client pour l'IA
  const allCmds     = db.prepare("SELECT statut, prix_total FROM commandes WHERE client_id=?").all(message.author.id);
  const nbLivrees   = allCmds.filter(c => c.statut === 'livree').length;
  const nbAnnulees  = allCmds.filter(c => c.statut === 'annulee').length;
  const totalBronze = allCmds.filter(c => c.statut === 'livree').reduce((s, c) => s + c.prix_total, 0);
  const segment     = calcSegment(nbLivrees, nbAnnulees, totalBronze);

  const contexteJoueur =
    `[CONTEXTE DU JOUEUR QUI ENVOIE CE MESSAGE]\n` +
    `Nom RP : ${nomRP}\n` +
    `Pseudo Discord : ${username}\n` +
    (roles.length ? `Métiers / Spécialisations : ${roles.join(', ')}\n` : 'Aucun métier enregistré.\n') +
    `Grade RP (niveau de permission) : ${levelLabel}\n` +
    `Segment client : ${segmentEmoji(segment)} ${segment} (${nbLivrees} commandes livrées · ${totalBronze}🟤 dépensés)\n` +
    (grantedPerms.length
      ? `Permissions accordées : ${grantedPerms.join(' · ')}\n`
      : 'Aucune permission d\'écriture accordée (lecture seule).\n') +
    `[FIN DU CONTEXTE — message du joueur ci-dessous]\n\n`;

  const positionFile = getQueueSize();
  const waitMsg = await message.channel.send(
    positionFile > 0
      ? `⌛ **${nomRP}**, votre question est en file d'attente… (position **${positionFile + 1}**)`
      : `⏳ **${nomRP}**, réponse en cours de rédaction…`
  );

  const systemPrompt = isVisitorChannel ? buildVisitorPrompt(userId) : buildSystemPrompt(userId);
  const embedColor   = isVisitorChannel ? 0x5865F2 : 0xC9A84C;
  const authorName   = isVisitorChannel ? 'Commis aux Visiteurs — Compagnie du Fjord' : 'Intendant de la Compagnie';

  const userId = message.author.id;
  const history = getHistory(userId);
  addToHistory(userId, 'user', contexteJoueur + message.content);

  enqueue(async () => {
    try {
      const reponse = await askNvidia(contexteJoueur + message.content, systemPrompt, history);
      addToHistory(userId, 'assistant', reponse);
      updatePlayerProfile(userId, nomRP, message.content);
      const parts   = splitResponse(reponse);

      const makeEmbed = (content) => new EmbedBuilder()
        .setAuthor({ name: authorName, iconURL: message.client.user.displayAvatarURL() })
        .setDescription(content)
        .setColor(embedColor)
        .setFooter({ text: `En réponse à ${nomRP} · Suppression dans 60s` })
        .setTimestamp();

      await waitMsg.edit({ content: `# Réponse pour <@${message.author.id}>`, embeds: [makeEmbed(parts[0])] });
      autoDelete(waitMsg);
      for (const part of parts.slice(1)) {
        const m = await message.channel.send({ embeds: [makeEmbed(part)] });
        autoDelete(m);
      }
    } catch (e) {
      console.error('[IA messageCreate]', e);
      const m = await waitMsg.edit({ content: '❌ Une erreur est survenue lors de la génération de la réponse.', embeds: [] }).catch(() => null);
      if (m) autoDelete(m);
    }
  });
});

client.login(process.env.DISCORD_TOKEN);
