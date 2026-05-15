import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isMarchand, refus } from '../utils/auth.js';
import { embedBase, embedSucces, embedErreur, COULEURS } from '../utils/embeds.js';
import {
  SAISONS, SAISON_EMOJIS, SAISON_LABELS,
  getSaisonInfo, setSaison, getCulturesParSaison, getAllCultures,
} from '../utils/saison.js';

const COULEURS_SAISON = {
  printemps: 0x90EE90,
  ete:       0xFFD700,
  automne:   0xD2691E,
  hiver:     0xADD8E6,
};

export const data = new SlashCommandBuilder()
  .setName('saison')
  .setDescription('Gestion des saisons de Vyldra')
  .addSubcommand(sub =>
    sub.setName('info')
      .setDescription('Afficher la saison courante et les cultures compatibles'))
  .addSubcommand(sub =>
    sub.setName('set')
      .setDescription('Déclarer le début d\'une nouvelle saison [Marchands uniquement]')
      .addStringOption(opt =>
        opt.setName('saison')
          .setDescription('Saison à activer')
          .setRequired(true)
          .addChoices(
            { name: '🌸 Printemps', value: 'printemps' },
            { name: '☀️ Été',       value: 'ete'       },
            { name: '🍂 Automne',   value: 'automne'   },
            { name: '❄️ Hiver',     value: 'hiver'     },
          )))
  .addSubcommand(sub =>
    sub.setName('cultures')
      .setDescription('Lister toutes les cultures et leurs saisons compatibles'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    if (!isMarchand(interaction)) return refus(interaction);

    const saison = interaction.options.getString('saison');
    setSaison(saison);

    const cultures = getCulturesParSaison(saison);
    const normales = cultures.filter(c => !c.perenne).map(c => c.nom);
    const perennes = cultures.filter(c => c.perenne).map(c => `${c.nom} *(repousse ${c.temps_repousse_min} min)*`);

    const embed = new EmbedBuilder()
      .setTitle(`${SAISON_EMOJIS[saison]} Changement de saison — ${SAISON_LABELS[saison]}`)
      .setDescription(
        `Le cycle naturel de Vyldra entre dans une nouvelle phase.\n` +
        `La **${SAISON_LABELS[saison]}** commence maintenant.\n\n` +
        `*Prochaine saison dans ~80 minutes (4 jours Minecraft).*`
      )
      .setColor(COULEURS_SAISON[saison])
      .addFields(
        normales.length ? { name: '🌱 Cultures de saison', value: normales.join(', '), inline: false } : [],
        perennes.length ? { name: '🔄 Cultures pérennes actives', value: perennes.join('\n'), inline: false } : [],
      )
      .setFooter({ text: `Défini par ${interaction.user.username} · Compagnie du Fjord` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'info') {
    const info = getSaisonInfo();
    if (!info) {
      return interaction.reply({
        embeds: [embedErreur('Aucune saison définie', 'Utilisez `/saison set` pour initialiser le cycle saisonnier.')],
        flags: 64,
      });
    }

    const cultures = getCulturesParSaison(info.saison);
    const normales = cultures.filter(c => !c.perenne).map(c => c.nom);
    const perennes = cultures.filter(c => c.perenne).map(c => c.nom);

    const maintenant  = Date.now();
    const resteMs     = info.finSaisonTs - maintenant;
    const resteMin    = Math.max(0, Math.round(resteMs / 60000));
    const resteH      = Math.floor(resteMin / 60);
    const resteM      = resteMin % 60;
    const dureeStr    = resteH > 0 ? `${resteH}h${resteM.toString().padStart(2,'0')}` : `${resteM} min`;
    const prochaineTs = Math.floor(info.finSaisonTs / 1000);

    const embed = new EmbedBuilder()
      .setTitle(`${info.emoji} Saison actuelle — ${info.label}`)
      .setDescription(
        `Prochaine saison : **${info.prochaineEmoji} ${info.prochaineLabel}** dans ~${dureeStr}\n` +
        `*(soit <t:${prochaineTs}:R>)*`
      )
      .setColor(COULEURS_SAISON[info.saison])
      .addFields(
        normales.length
          ? { name: '🌱 Cultures (poussent normalement)', value: normales.join(', '), inline: false }
          : { name: '🌱 Cultures', value: 'Aucune culture en saison.', inline: false },
        perennes.length
          ? { name: '🔄 Pérennes actives (fruit repousse en 10 min)', value: perennes.join(', '), inline: false }
          : [],
      )
      .setFooter({ text: 'Compagnie du Fjord — Cycle saisonnier Vyldra' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'cultures') {
    const toutes = getAllCultures();
    const info   = getSaisonInfo();
    const saison = info?.saison ?? null;

    const bySaison = { printemps: [], ete: [], automne: [], hiver: [] };
    for (const c of toutes) {
      const ss = JSON.parse(c.saisons);
      for (const s of ss) bySaison[s]?.push(c.nom);
    }

    const fields = SAISONS.map(s => ({
      name: `${SAISON_EMOJIS[s]} ${SAISON_LABELS[s]}${saison === s ? ' ← maintenant' : ''}`,
      value: bySaison[s].length ? bySaison[s].join(', ') : '—',
      inline: false,
    }));

    const embed = new EmbedBuilder()
      .setTitle('🌾 Cultures de Vyldra par saison')
      .setColor(saison ? COULEURS_SAISON[saison] : COULEURS.or)
      .addFields(...fields)
      .setFooter({ text: 'Perennes : Tomate, Melon, Citrouille, Vignes & Raisins (repousse 10 min, hors saison = bloqué)' });

    return interaction.reply({ embeds: [embed] });
  }
}
