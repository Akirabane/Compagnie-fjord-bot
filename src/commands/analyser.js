import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getStockSummary } from '../utils/ia.js';

const NVIDIA_API_KEY = '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';
const BASE_URL       = 'https://integrate.api.nvidia.com/v1';
const VISION_MODEL   = 'meta/llama-3.2-90b-vision-instruct';

function buildVisionPrompt() {
  const stock = getStockSummary();
  return `Tu es l'Analyste Visuel de La Compagnie du Fjord, sur le serveur Minecraft RP Vyldra (an 1005). Tu analyses les images envoyées par les membres et visiteurs. Tu réponds exclusivement en français, avec le ton d'un marchand viking avisé.

Tu peux analyser : inventaires Minecraft, cartes du monde, screenshots de jeu, ressources, constructions, interfaces de craft, etc.
Si l'image n'est pas liée à Minecraft ou au contexte de Vyldra/Fjordheim, tu le signales poliment mais tu décris quand même ce que tu vois.
Sois précis, concis et utile. Si tu vois des ressources, quantités ou équipements, liste-les clairement.

Si tu identifies des ressources dans l'image (inventaire, coffre, drop au sol…), compare-les avec notre stock actuel ci-dessous et suggère proactivement ce que la Compagnie pourrait acheter ou ce que le joueur pourrait commander chez nous.

=== STOCK ACTUEL DE LA COMPAGNIE ===
${stock}
=== FIN DU STOCK ===

Langues : détecte la langue du joueur et réponds dans sa langue.`;
}

export const data = new SlashCommandBuilder()
  .setName('analyser')
  .setDescription('Analyse une image avec l\'IA vision de la Compagnie')
  .addAttachmentOption(opt => opt
    .setName('image')
    .setDescription('Image à analyser (screenshot, inventaire, carte…)')
    .setRequired(true)
  )
  .addStringOption(opt => opt
    .setName('question')
    .setDescription('Question ou contexte précis sur l\'image (optionnel)')
    .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const attachment = interaction.options.getAttachment('image');
  const question   = interaction.options.getString('question') ?? 'Décris et analyse cette image dans le contexte de Fjordheim et du serveur Vyldra.';

  // Vérifie que c'est bien une image
  if (!attachment.contentType?.startsWith('image/')) {
    return interaction.editReply({ content: '❌ Le fichier joint n\'est pas une image. Formats acceptés : PNG, JPG, WEBP, GIF.' });
  }

  try {
    // Télécharge l'image depuis Discord et encode en base64
    const imgRes = await fetch(attachment.url);
    if (!imgRes.ok) throw new Error(`Impossible de télécharger l'image (${imgRes.status})`);
    const imgBuffer = await imgRes.arrayBuffer();
    const base64    = Buffer.from(imgBuffer).toString('base64');
    const dataUrl   = `data:${attachment.contentType};base64,${base64}`;

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: buildVisionPrompt() },
          {
            role: 'user',
            content: [
              { type: 'text', text: question },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 1024,
        temperature: 0.5,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`NVIDIA API ${res.status}: ${err}`);
    }

    const data = await res.json();
    const reponse = data.choices[0]?.message?.content?.trim() ?? '*(Pas de réponse)*';

    const member      = interaction.member;
    const displayName = member?.displayName ?? interaction.user.globalName ?? interaction.user.username;
    let nomRP = displayName.includes('|') ? displayName.split('|').pop().trim() : displayName;

    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Analyste Visuel — Compagnie du Fjord', iconURL: interaction.client.user.displayAvatarURL() })
      .setDescription(reponse.length > 4096 ? reponse.slice(0, 4090) + '…' : reponse)
      .setThumbnail(attachment.url)
      .setColor(0x2F8A6E)
      .setFooter({ text: `Analyse pour ${nomRP}` })
      .setTimestamp();

    await interaction.editReply({ content: `# Analyse pour <@${interaction.user.id}>`, embeds: [embed] });

  } catch (e) {
    console.error('[/analyser]', e);
    await interaction.editReply({ content: '❌ Une erreur est survenue lors de l\'analyse de l\'image.' });
  }
}
