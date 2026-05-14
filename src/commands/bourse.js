import { SlashCommandBuilder } from 'discord.js';
import { embedBase, COULEURS } from '../utils/embeds.js';
import { bronzeVersTexte } from '../utils/monnaie.js';

// Convertisseur de monnaie et utilitaire RP
export const data = new SlashCommandBuilder()
  .setName('bourse')
  .setDescription('Calculer une conversion ou un prix de revient')
  .addSubcommand(sub =>
    sub.setName('convertir')
      .setDescription('Convertir une somme en bronze vers Or/Argent/Bronze')
      .addIntegerOption(opt =>
        opt.setName('bronze').setDescription('Montant en pièces de bronze').setRequired(true).setMinValue(1)
      )
  )
  .addSubcommand(sub =>
    sub.setName('calculer')
      .setDescription('Calculer le prix d\'un achat en quantité')
      .addIntegerOption(opt =>
        opt.setName('prix_unitaire').setDescription('Prix unitaire en bronze').setRequired(true).setMinValue(1)
      )
      .addNumberOption(opt =>
        opt.setName('quantite').setDescription('Quantité').setRequired(true).setMinValue(0.1)
      )
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'convertir') {
    const bronze = interaction.options.getInteger('bronze');
    const embed = embedBase(
      '💱 Conversion monétaire',
      `**${bronze} pièces de bronze** équivalent à :\n\n**${bronzeVersTexte(bronze)}**\n\n*Taux officiel de la Banque Centrale de Vyldra : 1 Or = 10 Argent = 100 Bronze*`,
      COULEURS.or
    );
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (sub === 'calculer') {
    const prixUnit = interaction.options.getInteger('prix_unitaire');
    const quantite = interaction.options.getNumber('quantite');
    const total = Math.round(prixUnit * quantite);
    const embed = embedBase(
      '🧮 Calcul de prix',
      `**${prixUnit} bronze** × **${quantite}** unités\n\n= **${bronzeVersTexte(total)}** *(${total} bronze)*`,
      COULEURS.or
    );
    return interaction.reply({ embeds: [embed], flags: 64 });
  }
}
