import { SlashCommandBuilder } from 'discord.js';
import db, { stmts } from '../db/database.js';
import { bronzeVersTexte, prixAvecVariation } from '../utils/monnaie.js';
import { embedBase, embedErreur, embedSucces, COULEURS } from '../utils/embeds.js';
import { alerteNouvelleCommande, calcSegment, segmentEmoji } from '../utils/alertes.js';

export const data = new SlashCommandBuilder()
  .setName('commander')
  .setDescription('Passer une commande auprès de la Compagnie du Fjord')
  .addStringOption(opt =>
    opt.setName('ressource')
      .setDescription('La ressource souhaitée')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addNumberOption(opt =>
    opt.setName('quantite')
      .setDescription('Quantité désirée')
      .setRequired(true)
      .setMinValue(0.1)
  )
  .addStringOption(opt =>
    opt.setName('note')
      .setDescription('Message ou instruction particulière (optionnel)')
  );

export async function autocomplete(interaction) {
  const saisie = interaction.options.getFocused().toLowerCase();
  const rows = db.prepare(
    'SELECT ressource, unite FROM stock WHERE en_vente = 1 AND LOWER(ressource) LIKE ? LIMIT 25'
  ).all(`%${saisie}%`);
  await interaction.respond(rows.map(r => ({ name: `${r.ressource} (${r.unite})`, value: r.ressource })));
}

export async function execute(interaction) {
  const ressource = interaction.options.getString('ressource');
  const quantite = interaction.options.getNumber('quantite');
  const note = interaction.options.getString('note') ?? '';

  const article = db.prepare('SELECT * FROM stock WHERE ressource = ? AND en_vente = 1').get(ressource);
  if (!article) {
    return interaction.reply({ embeds: [embedErreur(`**${ressource}** n'est pas disponible au catalogue.`)], flags: 64 });
  }

  const variation = db.prepare('SELECT variation FROM marche WHERE ressource = ?').get(ressource);
  const vari = variation?.variation ?? 0;
  const prixUnit = prixAvecVariation(article.prix_bronze, vari);
  const prixTotal = Math.round(prixUnit * quantite);

  db.prepare(`
    INSERT INTO commandes (client_id, client_pseudo, ressource, quantite, unite, prix_total, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(interaction.user.id, interaction.user.username, ressource, quantite, article.unite, prixTotal, note);

  const id = db.prepare('SELECT last_insert_rowid() as id').get().id;

  const embed = embedBase(
    '📋 Commande enregistrée',
    `*"Votre demande a été reçue par les marchands de la Compagnie du Fjord. Nous vous ferons signe dès que votre commande sera prête."*`,
    COULEURS.or
  ).addFields(
    { name: '📦 Ressource', value: `${ressource} — ${article.unite}`, inline: true },
    { name: '🔢 Quantité', value: `${quantite}`, inline: true },
    { name: '💰 Prix estimé', value: bronzeVersTexte(prixTotal), inline: true },
    { name: '🧾 Référence', value: `#${String(id).padStart(4, '0')}`, inline: true },
    { name: '⏳ Statut', value: 'En attente', inline: true },
    ...(note ? [{ name: '📝 Note', value: note, inline: false }] : [])
  );

  await interaction.reply({ embeds: [embed] });

  // Alerte intelligence économique (VIP / grosse commande)
  const commande = db.prepare('SELECT * FROM commandes WHERE id=?').get(id);
  if (commande) alerteNouvelleCommande(interaction.client, commande).catch(() => {});

  // Notifier le canal marchand si configuré
  const logChannel = interaction.guild?.channels?.cache?.find(c => c.name === 'commandes-fjord');
  if (logChannel) {
    const notif = embedBase(
      `🛒 Nouvelle commande #${String(id).padStart(4, '0')}`,
      `**${interaction.user.username}** (<@${interaction.user.id}>) a passé commande.`,
      COULEURS.bleu
    ).addFields(
      { name: '📦 Ressource', value: `${ressource} × ${quantite} ${article.unite}`, inline: true },
      { name: '💰 Total', value: bronzeVersTexte(prixTotal), inline: true },
      ...(note ? [{ name: '📝 Note client', value: note, inline: false }] : [])
    );
    logChannel.send({ embeds: [notif] });
  }
}
