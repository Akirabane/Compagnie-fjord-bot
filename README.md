# La Compagnie du Fjord — Bot & Dashboard

Bot Discord et interface web de gestion pour la guilde marchande **La Compagnie du Fjord, dite les 3 Routes** sur le serveur Minecraft RP Viking **Vyldra**.

---

## Fonctionnalités

**Bot Discord**
- Gestion du stock avec alertes de seuil et réservation automatique à la commande
- Système de commandes et offres de vente via forums Discord (1 post par client / par vendeur)
- Catalogue, prix par région, recettes avec calcul de marges
- Trésorerie avec historique des mouvements
- IA intendant double-canal (membres / visiteurs)
- Rappels matinaux automatiques (commandes en retard, stocks critiques)
- Slash commands : `/stock`, `/commandes`, `/prix`, `/recettes`, `/marche`, `/bourse`, `/catalogue`, `/inventaire`, `/forum`, `/ia`, `/annonce`, `/roles`, `/metiers`, `/macommande`

**Dashboard web** (`fjord.zenkai-police.tech`)
- KPIs et graphiques (revenus, statuts, top produits, stocks par catégorie)
- Gestion stock inline, commandes, offres de vente, trésorerie, recettes
- Journaux d'activité et export CSV
- Authentification Discord OAuth2 (accès réservé aux membres Marchands)

---

## Prérequis

- **Node.js v22+** (la base de données utilise `node:sqlite`, intégré nativement depuis Node 22)
- Un bot Discord configuré sur le [Discord Developer Portal](https://discord.com/developers/applications)
- Un serveur Discord avec les bons IDs configurés

---

## Installation

```bash
# Cloner le dépôt
git clone https://github.com/Akirabane/Compagnie-fjord-bot.git
cd Compagnie-fjord-bot

# Installer les dépendances
npm install
```

---

## Configuration

Copier le fichier d'exemple et remplir les valeurs :

```bash
cp .env.example .env
```

```env
DISCORD_TOKEN=        # Token du bot Discord
CLIENT_ID=            # Application ID du bot
GUILD_ID=             # ID du serveur Discord

# OAuth2 (pour le dashboard web)
DISCORD_CLIENT_SECRET=
SESSION_SECRET=

# API NVIDIA (pour l'IA intendant)
NVIDIA_API_KEY=
```

> Les IDs des canaux, forums et salons sont configurables directement via les slash commands du bot (ex: `/forum acheteurs`, `/forum vendeurs`) ou en base de données via la table `config`.

---

## Lancement

### Déployer les slash commands (une seule fois ou après modification)

```bash
npm run deploy
```

### Démarrer le bot

```bash
npm start
```

### Démarrer le dashboard web

```bash
npm run web
```

Le dashboard écoute sur le port **4000** par défaut.

---

## Lancement avec PM2 (recommandé en production)

```bash
pm2 start src/index.js --name compagnie-du-fjord
pm2 start web/server.js --name fjord-web
pm2 save
```

---

## Structure du projet

```
├── src/
│   ├── commands/       # Slash commands Discord
│   ├── db/             # Schéma SQLite, migrations, seeds
│   └── utils/          # Helpers (forum, IA, embeds, monnaie...)
├── web/
│   ├── public/         # Frontend SPA (HTML/CSS/JS)
│   └── server.js       # API Express + OAuth2
├── scripts/            # Scripts utilitaires
├── data/               # Base de données SQLite (ignorée par git)
├── .env.example
└── package.json
```

---

## Base de données

SQLite via `node:sqlite` (aucune dépendance externe). Le fichier `data/fjord.db` est créé automatiquement au premier démarrage. Les migrations sont idempotentes.

---

## Monnaie

Le serveur Vyldra utilise un système trimétal :

| Unité | Valeur |
|-------|--------|
| 🟤 Bronze | base |
| ⚪ Argent | 10 Bronze |
| 🟡 Or | 100 Bronze |
