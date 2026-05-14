import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';

export const PAGE_SIZE = 6;

export function paginationButtons(customId, page, total, extras = []) {
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const prev = new ButtonBuilder()
    .setCustomId(`${customId}:${page - 1}`)
    .setLabel('◀')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(page <= 0);
  const counter = new ButtonBuilder()
    .setCustomId('noop')
    .setLabel(`${page + 1} / ${maxPage + 1}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);
  const next = new ButtonBuilder()
    .setCustomId(`${customId}:${page + 1}`)
    .setLabel('▶')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(page >= maxPage);

  const rows = [new ActionRowBuilder().addComponents(prev, counter, next, ...extras)];
  return rows;
}

export function categoryMenu(customId, categories, placeholder = 'Choisir une catégorie…') {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(categories.map(c => ({ label: c, value: c })));
  return new ActionRowBuilder().addComponents(menu);
}

export function paginate(items, page) {
  const start = page * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}
