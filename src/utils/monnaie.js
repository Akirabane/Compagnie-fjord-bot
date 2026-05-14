// 1 Or = 10 Argent = 100 Bronze
export function bronzeVersTexte(bronze) {
  const or = Math.floor(bronze / 100);
  const reste = bronze % 100;
  const argent = Math.floor(reste / 10);
  const bz = reste % 10;

  const parts = [];
  if (or > 0) parts.push(`${or} 🟡 Or`);
  if (argent > 0) parts.push(`${argent} ⚪ Argent`);
  if (bz > 0 || parts.length === 0) parts.push(`${bz} 🟤 Bronze`);
  return parts.join(' + ');
}

export function prixAvecVariation(prixBase, variation) {
  return Math.max(1, Math.round(prixBase * (1 + variation / 100)));
}

export function statutEmoji(statut) {
  const map = {
    en_attente:  '⏳',
    en_cours:    '⚒️',
    prete:       '📦',
    livree:      '✅',
    annulee:     '❌',
  };
  return map[statut] ?? '❓';
}
