export const ROLE_MARCHAND = '1502788350665556149';

export function isMarchand(interaction) {
  return interaction.member?.roles?.cache?.has(ROLE_MARCHAND) ?? false;
}

export function refus(interaction) {
  return interaction.reply({
    content: '🔒 Accès réservé aux **Marchands de la Compagnie du Fjord**.',
    flags: 64,
  });
}
