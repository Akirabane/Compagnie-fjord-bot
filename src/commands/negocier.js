import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import db from '../db/database.js';
import { askNvidia } from '../utils/ia.js';
import { cfgGet } from '../utils/setup.js';

export const data = new SlashCommandBuilder()
  .setName('negocier')
  .setDescription('L\'IA analyse une offre et te dit si tu dois accepter, contre-proposer ou refuser')
  .addStringOption(opt => opt
    .setName('ressource')
    .setDescription('Ressource concernée')
    .setRequired(true)
  )
  .addNumberOption(opt => opt
    .setName('quantite')
    .setDescription('Quantité')
    .setRequired(true)
  )
  .addIntegerOption(opt => opt
    .setName('prix')
    .setDescription('Prix total proposé en bronze')
    .setRequired(true)
  )
  .addStringOption(opt => opt
    .setName('type')
    .setDescription('Type de transaction')
    .setRequired(true)
    .addChoices(
      { name: '🛒 Achat (quelqu\'un nous vend)', value: 'achat' },
      { name: '💰 Vente (on vend à quelqu\'un)', value: 'vente' },
    )
  )
  .addStringOption(opt => opt
    .setName('contexte')
    .setDescription('Contexte supplémentaire (urgent, relation RP, région…)')
    .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const ressource = interaction.options.getString('ressource');
  const quantite  = interaction.options.getNumber('quantite');
  const prix      = interaction.options.getInteger('prix');
  const type      = interaction.options.getString('type');
  const contexte  = interaction.options.getString('contexte') ?? '';

  // Données du stock pour cette ressource
  const stockRow = db.prepare(
    'SELECT quantite, unite, prix_bronze, en_vente FROM stock WHERE LOWER(ressource)=?'
  ).get(ressource.toLowerCase());

  // Prix régionaux
  const prixRegion = db.prepare(
    'SELECT * FROM prix_regions WHERE LOWER(produit)=?'
  ).get(ressource.toLowerCase());

  // Trésorerie
  const tresor = parseInt(cfgGet('TRESOR_BRONZE') ?? '0');

  // Historique transactions récentes pour cette ressource
  const txHistory = db.prepare(
    "SELECT type, quantite, prix_bronze, date FROM transactions WHERE LOWER(ressource)=? ORDER BY date DESC LIMIT 5"
  ).all(ressource.toLowerCase());

  // Construction du prompt analytique
  const prixUnitaire = (prix / quantite).toFixed(2);
  const stockInfo    = stockRow
    ? `Stock actuel : ${stockRow.quantite} ${stockRow.unite} · Prix catalogue : ${stockRow.prix_bronze}🟤/${stockRow.unite} · ${stockRow.en_vente ? 'En vente' : 'Hors vente'}`
    : 'Ressource absente du stock.';

  const regionInfo = prixRegion
    ? `Prix régionaux — PDM:${prixRegion.prix_pdm ?? '?'}🟤 · Rhême:${prixRegion.prix_rheme ?? '?'}🟤 · Skanor:${prixRegion.prix_skanor ?? '?'}🟤 · Byb:${prixRegion.prix_byb ?? '?'}🟤 · Yuhang:${prixRegion.prix_yuhang ?? '?'}🟤`
    : 'Aucune donnée régionale disponible.';

  const txInfo = txHistory.length
    ? txHistory.map(t => `${t.type} · ×${t.quantite} · ${t.prix_bronze}🟤/u`).join(' | ')
    : 'Aucun historique.';

  const systemPrompt =
`Tu es le Conseiller Commercial de La Compagnie du Fjord. Tu analyses des offres commerciales et donnes un avis tranché : ACCEPTER, CONTRE-PROPOSER ou REFUSER. Tu réponds en français, de façon concise et directe.

Données de la Compagnie :
- Trésorerie : ${tresor}🟤
- ${stockInfo}
- ${regionInfo}
- Dernières transactions sur ${ressource} : ${txInfo}`;

  const userMsg =
`Analyse cette ${type === 'achat' ? 'offre de vente (quelqu\'un nous vend)' : 'demande d\'achat (quelqu\'un nous achète)'} :

Ressource : ${ressource}
Quantité : ${quantite}
Prix proposé : ${prix}🟤 (${prixUnitaire}🟤/unité)
${contexte ? `Contexte : ${contexte}` : ''}

Dis-moi :
1. Si le prix est bon, trop élevé ou trop bas par rapport au marché
2. Ta recommandation : ACCEPTER / CONTRE-PROPOSER (avec le prix suggéré) / REFUSER
3. Justification en 2-3 phrases maximum
4. Risques éventuels

Sois direct et donne un avis tranché.`;

  try {
    const reponse = await askNvidia(userMsg, systemPrompt);

    const isAccept = /ACCEPTER/i.test(reponse);
    const isRefus  = /REFUSER/i.test(reponse);
    const color    = isAccept ? 0x00CC66 : isRefus ? 0xFF4444 : 0xFF8C00;
    const icon     = isAccept ? '✅' : isRefus ? '❌' : '🔄';

    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Conseiller Commercial — Compagnie du Fjord', iconURL: interaction.client.user.displayAvatarURL() })
      .setTitle(`${icon} Analyse : ${type === 'achat' ? 'Achat de' : 'Vente de'} ${quantite}× ${ressource} à ${prix}🟤`)
      .setDescription(reponse.length > 4000 ? reponse.slice(0, 3997) + '…' : reponse)
      .setColor(color)
      .addFields(
        { name: 'Prix proposé', value: `${prix}🟤 (${prixUnitaire}🟤/u)`, inline: true },
        { name: 'Prix catalogue', value: stockRow ? `${stockRow.prix_bronze}🟤/u` : 'N/A', inline: true },
        { name: 'Stock actuel', value: stockRow ? `${stockRow.quantite} ${stockRow.unite}` : 'Absent', inline: true },
      )
      .setFooter({ text: 'Analyse basée sur le stock, les prix régionaux et l\'historique des transactions' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (e) {
    console.error('[/negocier]', e);
    await interaction.editReply({ content: '❌ Erreur lors de l\'analyse. Réessaie dans un instant.' });
  }
}
