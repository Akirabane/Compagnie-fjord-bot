import { SlashCommandBuilder } from 'discord.js';
import { isMarchand, refus } from '../utils/auth.js';
import { embedBase, COULEURS } from '../utils/embeds.js';

const TYPES_ANNONCE = {
  cargaison: {
    titre: '⚓ Cargaison arrivée au port de Fjordheim',
    couleur: COULEURS.bleu,
    intro: '*Les navires de la Compagnie du Fjord ont accosté au port. Les dockers déchargent les marchandises.*',
  },
  enchere: {
    titre: '🔨 Enchère publique — La Compagnie du Fjord',
    couleur: COULEURS.or,
    intro: '*La Compagnie du Fjord organise une vente aux enchères. Que les offres commencent !*',
  },
  recrutement: {
    titre: '📯 La Compagnie du Fjord recrute !',
    couleur: COULEURS.vert,
    intro: '*La Compagnie du Fjord, dite les 3 Routes, ouvre ses portes à de nouveaux compagnons.*',
  },
  route: {
    titre: '🗺️ Ouverture d\'une nouvelle route commerciale',
    couleur: COULEURS.bleu,
    intro: '*Les éclaireurs de la Compagnie du Fjord ont tracé une nouvelle route.*',
  },
  alerte: {
    titre: '⚠️ Avis aux marchands — La Compagnie du Fjord',
    couleur: COULEURS.rouge,
    intro: '*La Compagnie du Fjord émet un avertissement officiel.*',
  },
  general: {
    titre: '📜 Proclamation — La Compagnie du Fjord',
    couleur: COULEURS.or,
    intro: null,
  },
};

export const data = new SlashCommandBuilder()
  .setName('annonce')
  .setDescription('Publier une annonce RP de la Compagnie [Marchands uniquement]')
  
  .addStringOption(opt =>
    opt.setName('type')
      .setDescription('Type d\'annonce')
      .setRequired(true)
      .addChoices(
        { name: '⚓ Arrivée de cargaison', value: 'cargaison' },
        { name: '🔨 Enchère publique', value: 'enchere' },
        { name: '📯 Recrutement', value: 'recrutement' },
        { name: '🗺️ Nouvelle route commerciale', value: 'route' },
        { name: '⚠️ Alerte marchande', value: 'alerte' },
        { name: '📜 Annonce générale', value: 'general' },
      )
  )
  .addStringOption(opt =>
    opt.setName('contenu')
      .setDescription('Contenu de l\'annonce (texte RP)')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('canal')
      .setDescription('Nom du canal où publier (défaut : annonces-compagnie)')
  );

export async function execute(interaction) {
  if (!isMarchand(interaction)) return refus(interaction);
  const type = interaction.options.getString('type');
  const contenu = interaction.options.getString('contenu');
  const canalNom = interaction.options.getString('canal') ?? 'annonces-compagnie';

  const config = TYPES_ANNONCE[type];
  const canal = interaction.guild?.channels?.cache?.find(c => c.name === canalNom);

  const embed = embedBase(config.titre, config.intro ? `${config.intro}\n\n${contenu}` : contenu, config.couleur)
    .setAuthor({ name: 'La Compagnie du Fjord — Les 3 Routes', iconURL: interaction.guild.iconURL() });

  if (canal) {
    await canal.send({ embeds: [embed] });
    return interaction.reply({ content: `✅ Annonce publiée dans <#${canal.id}>.`, flags: 64 });
  } else {
    await interaction.reply({ embeds: [embed] });
  }
}
