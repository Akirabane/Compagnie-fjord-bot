// Prix de base Skanor selon le lore Vyldra
export const CATALOGUE_SKANOR = [
  // Agriculture (faible en Skanor → prix élevés)
  { categorie: 'Agriculture', ressource: 'Blé', unite: 'Tonne', prix_bronze: 8 },
  { categorie: 'Agriculture', ressource: 'Carottes', unite: 'Tonne', prix_bronze: 6 },
  { categorie: 'Agriculture', ressource: 'Pommes de terre', unite: 'Tonne', prix_bronze: 6 },
  { categorie: 'Agriculture', ressource: 'Pain', unite: 'Tonne', prix_bronze: 80 },

  // Élevage / Chasse
  { categorie: 'Élevage & Chasse', ressource: 'Poulet', unite: 'Unité', prix_bronze: 3 },
  { categorie: 'Élevage & Chasse', ressource: 'Porc cru', unite: 'Unité', prix_bronze: 4 },
  { categorie: 'Élevage & Chasse', ressource: 'Bœuf cru', unite: 'Unité', prix_bronze: 5 },
  { categorie: 'Élevage & Chasse', ressource: 'Mouton (laine incluse)', unite: 'Unité', prix_bronze: 6 },
  { categorie: 'Élevage & Chasse', ressource: 'Œufs', unite: 'Boîte de 16', prix_bronze: 4 },

  // Minerais (spécialité Skanor)
  { categorie: 'Minerais', ressource: 'Charbon', unite: 'Tonne', prix_bronze: 8 },
  { categorie: 'Minerais', ressource: 'Fer (lingot)', unite: 'Lingot', prix_bronze: 4 },
  { categorie: 'Minerais', ressource: 'Fer', unite: 'Tonne', prix_bronze: 20 },
  { categorie: 'Minerais', ressource: 'Or', unite: 'Unité', prix_bronze: 7 },
  { categorie: 'Minerais', ressource: 'Redstone', unite: 'Tonne', prix_bronze: 12 },
  { categorie: 'Minerais', ressource: 'Lapis', unite: 'Tonne', prix_bronze: 15 },
  { categorie: 'Minerais', ressource: 'Diamant', unite: 'Unité', prix_bronze: 200 },

  // Construction (bois de conifères abondant)
  { categorie: 'Construction', ressource: 'Cobblestone', unite: 'Tonne', prix_bronze: 2 },
  { categorie: 'Construction', ressource: 'Bois chêne', unite: 'Tonne', prix_bronze: 6 },
  { categorie: 'Construction', ressource: 'Bois sapin', unite: 'Tonne', prix_bronze: 5 },
  { categorie: 'Construction', ressource: 'Planches', unite: 'Tonne', prix_bronze: 6 },
  { categorie: 'Construction', ressource: 'Briques de pierre', unite: 'Tonne', prix_bronze: 8 },
  { categorie: 'Construction', ressource: 'Verre', unite: 'Tonne', prix_bronze: 9 },

  // Forge & Armement
  { categorie: 'Forge & Armement', ressource: 'Épée en fer', unite: 'Unité', prix_bronze: 12 },
  { categorie: 'Forge & Armement', ressource: 'Armure en fer', unite: 'Unité', prix_bronze: 10 },
  { categorie: 'Forge & Armement', ressource: 'Arc', unite: 'Unité', prix_bronze: 10 },
  { categorie: 'Forge & Armement', ressource: 'Flèches', unite: 'Les 16', prix_bronze: 7 },

  // Produits transformés (cuisiniers de la compagnie)
  { categorie: 'Cuisine & Taverne', ressource: 'Ragoût de bœuf', unite: 'Portion', prix_bronze: 15 },
  { categorie: 'Cuisine & Taverne', ressource: 'Viande fumée', unite: 'Portion', prix_bronze: 10 },
  { categorie: 'Cuisine & Taverne', ressource: 'Poisson séché', unite: 'Portion', prix_bronze: 8 },
  { categorie: 'Cuisine & Taverne', ressource: 'Mead (hydromel)', unite: 'Tonneau', prix_bronze: 50 },

  // Artisanat (tanneur)
  { categorie: 'Artisanat & Cuir', ressource: 'Cuir tanné', unite: 'Unité', prix_bronze: 12 },
  { categorie: 'Artisanat & Cuir', ressource: 'Armure en cuir', unite: 'Unité', prix_bronze: 35 },
  { categorie: 'Artisanat & Cuir', ressource: 'Sacoche en cuir', unite: 'Unité', prix_bronze: 20 },
  { categorie: 'Artisanat & Cuir', ressource: 'Fourrure', unite: 'Unité', prix_bronze: 18 },
];

export const VARIATIONS_MARCHE = {
  'Agriculture':      { min: -15, max: 40 },
  'Élevage & Chasse': { min: -15, max: 30 },
  'Minerais':         { min: -30, max: 40 },
  'Construction':     { min: -20, max: 25 },
  'Forge & Armement': { min: -10, max: 60 },
  'Cuisine & Taverne':{ min: -10, max: 40 },
  'Artisanat & Cuir': { min: -10, max: 35 },
};
