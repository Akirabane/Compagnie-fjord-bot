import { SlashCommandBuilder } from 'discord.js';
import db from '../db/database.js';
import { isMarchand, refus } from '../utils/auth.js';
import { VARIATIONS_MARCHE } from '../db/seed.js';
import { embedBase, embedSucces, COULEURS } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('marche')
  .setDescription('Gérer les fluctuations du marché [Marchands uniquement]')
  
  .addSubcommand(sub =>
    sub.setName('fluctuation')
      .setDescription('Appliquer une variation de prix à une catégorie')
      .addStringOption(opt =>
        opt.setName('categorie')
          .setDescription('Catégorie de ressources')
          .setRequired(true)
          .addChoices(
            { name: '🌾 Agriculture', value: 'Agriculture' },
            { name: '🏹 Élevage & Chasse', value: 'Élevage & Chasse' },
            { name: '⛏️ Minerais', value: 'Minerais' },
            { name: '🪵 Construction', value: 'Construction' },
            { name: '⚒️ Forge & Armement', value: 'Forge & Armement' },
            { name: '🍖 Cuisine & Taverne', value: 'Cuisine & Taverne' },
            { name: '🪡 Artisanat & Cuir', value: 'Artisanat & Cuir' },
          )
      )
      .addIntegerOption(opt =>
        opt.setName('variation')
          .setDescription('Variation en % (négatif = baisse, positif = hausse)')
          .setRequired(true)
          .setMinValue(-50)
          .setMaxValue(120)
      )
      .addStringOption(opt =>
        opt.setName('raison')
          .setDescription('Raison RP de la fluctuation (affiché dans l\'annonce)')
      )
  )
  .addSubcommand(sub =>
    sub.setName('reset')
      .setDescription('Remettre toutes les variations à 0')
  )
  .addSubcommand(sub =>
    sub.setName('voir')
      .setDescription('Voir les variations actuelles du marché')
  );

export async function execute(interaction) {
  if (!isMarchand(interaction)) return refus(interaction);
  const sub = interaction.options.getSubcommand();

  if (sub === 'voir') {
    const rows = db.prepare('SELECT * FROM marche ORDER BY ressource').all();
    if (rows.length === 0) {
      return interaction.reply({ embeds: [embedBase('📊 Marché', '*Aucune variation active.*', COULEURS.gris)], flags: 64 });
    }
    const lignes = rows.map(r => {
      const arrow = r.variation > 0 ? '📈' : r.variation < 0 ? '📉' : '➡️';
      return `${arrow} **${r.ressource}** : ${r.variation > 0 ? '+' : ''}${r.variation}%`;
    });
    return interaction.reply({ embeds: [embedBase('📊 Variations du marché', lignes.join('\n'), COULEURS.or)], flags: 64 });
  }

  if (sub === 'reset') {
    db.prepare('DELETE FROM marche').run();
    return interaction.reply({ embeds: [embedSucces('Toutes les variations du marché ont été remises à zéro.')], flags: 64 });
  }

  if (sub === 'fluctuation') {
    const categorie = interaction.options.getString('categorie');
    const variation = interaction.options.getInteger('variation');
    const raison = interaction.options.getString('raison') ?? null;

    const limites = VARIATIONS_MARCHE[categorie];
    if (limites && (variation < limites.min || variation > limites.max)) {
      return interaction.reply({
        embeds: [embedBase('⚠️ Attention', `Pour **${categorie}**, la variation normale est entre **${limites.min}%** et **+${limites.max}%**.\nVariation appliquée quand même : **${variation}%**`, COULEURS.rouge)],
        flags: 64
      });
    }

    const ressources = db.prepare('SELECT ressource FROM stock WHERE categorie = ?').all(categorie);
    const upsert = db.prepare('INSERT OR REPLACE INTO marche (ressource, variation, derniere_maj) VALUES (?, ?, datetime(\'now\'))');
    const tx = db.transaction(() => {
      for (const { ressource } of ressources) upsert.run(ressource, variation);
    });
    tx()(); // notre transaction() retourne une fonction

    // Annonce publique dans le canal annonces-marche si présent
    const announceChannel = interaction.guild?.channels?.cache?.find(c => c.name === 'annonces-marche');
    if (announceChannel) {
      const arrow = variation > 0 ? '📈' : '📉';
      const sens = variation > 0 ? 'hausse' : 'baisse';
      const embed = embedBase(
        `${arrow} Fluctuation du marché — ${categorie}`,
        `*Les prix de la catégorie **${categorie}** sont en ${sens} à Fjordheim.*\n\n` +
        `**Variation :** ${variation > 0 ? '+' : ''}${variation}%` +
        (raison ? `\n\n*"${raison}"*` : ''),
        variation > 0 ? COULEURS.rouge : COULEURS.vert
      );
      announceChannel.send({ embeds: [embed] });
    }

    return interaction.reply({
      embeds: [embedSucces(`Variation de **${variation}%** appliquée à **${ressources.length}** ressources de la catégorie **${categorie}**.`)],
      flags: 64
    });
  }
}
