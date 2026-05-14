import { EmbedBuilder } from 'discord.js';

export const COULEURS = {
  or:      0xC9A84C,
  rouge:   0x8B1A1A,
  vert:    0x2D6A2D,
  bleu:    0x1A3A5C,
  gris:    0x4A4A4A,
};

export function embedBase(titre, description, couleur = COULEURS.or) {
  return new EmbedBuilder()
    .setColor(couleur)
    .setTitle(titre)
    .setDescription(description)
    .setFooter({ text: '⚓ La Compagnie du Fjord — Les 3 Routes • Fjordheim, Empire de Skanor' })
    .setTimestamp();
}

export function embedErreur(message) {
  return embedBase('❌ Erreur', message, COULEURS.rouge);
}

export function embedSucces(message) {
  return embedBase('✅ Succès', message, COULEURS.vert);
}
