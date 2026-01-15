// ========================================
// API DISCORD POUR SPIRAL-BUDDIES
// Optimisé pour Render.com
// ========================================

const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const cors = require("cors");

// ========== CONFIGURATION ==========
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || process.env.DISCORD_CHANNEL_ID;
const PORT = process.env.PORT || 10000;

// ========== VALIDATION CRITIQUE ==========
if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error("❌ ERREUR CRITIQUE : Variables d'environnement manquantes!");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, // AJOUT IMPORTANT POUR LES MEMBRES
  ],
});

let cachedMessages = [];

// ========== FONCTION : RÉCUPÉRATION DES MESSAGES ==========
async function fetchMessages() {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) return;

    // Récupérer la guilde (serveur) pour résoudre les membres
    const guild = channel.guild;

    const messages = await channel.messages.fetch({ limit: 5 }); // On prend 5 messages pour être sûr d'avoir du contenu

    // Traitement asynchrone des messages pour résoudre les mentions
    const processedMessages = await Promise.all(
      messages.map(async (m) => {
        
        // 1. Résolution des mentions Utilisateurs (même ceux qui ne sont plus dans le cache message)
        const userMentions = [];
        const mentionMatches = m.content.matchAll(/<@!?(\d+)>/g);
        for (const match of mentionMatches) {
          const userId = match[1];
          try {
            // Cherche dans le cache ou fetch l'utilisateur
            const member = await guild.members.fetch(userId).catch(() => null);
            const user = member ? member.user : await client.users.fetch(userId).catch(() => null);
            
            if (user) {
              userMentions.push({
                id: userId,
                username: member ? member.displayName : user.username, // Priorité au surnom serveur
                avatar: user.displayAvatarURL({ dynamic: true })
              });
            }
          } catch (e) {
            console.warn(`Impossible de résoudre l'user ${userId}`);
          }
        }

        // 2. Résolution des mentions Salons
        const channelMentions = [];
        const channelMatches = m.content.matchAll(/<#(\d+)>/g);
        for (const match of channelMatches) {
          const cId = match[1];
          const ch = guild.channels.cache.get(cId);
          if (ch) {
            channelMentions.push({
              id: cId,
              name: ch.name
            });
          }
        }

        return {
          id: m.id,
          author: {
            id: m.author.id, // AJOUT DE L'ID AUTEUR
            username: m.author.username,
            avatar: m.author.displayAvatarURL({ format: "png", size: 128 }),
            bot: m.author.bot,
          },
          content: m.content,
          timestamp: m.createdTimestamp,
          date: new Date(m.createdTimestamp).toLocaleString("fr-FR", {
            day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
          }),
          // On envoie les mentions résolues au front-end
          mentions: userMentions, 
          channel_mentions: channelMentions,
          
          embeds: m.embeds.map((e) => ({
            title: e.title,
            description: e.description,
            image: e.image?.url,
            thumbnail: e.thumbnail?.url,
            color: e.color,
            url: e.url,
          })),
          attachments: m.attachments.map((a) => ({
            url: a.url,
            name: a.name,
            contentType: a.contentType,
          })),
        };
      })
    );

    cachedMessages = processedMessages.reverse();
    console.log(`✅ ${cachedMessages.length} messages traités avec mentions résolues`);

  } catch (error) {
    console.error("❌ Erreur fetchMessages:", error);
  }
}

// ========== ÉVÉNEMENTS DISCORD ==========
client.once("ready", () => {
  console.log(`✅ Connecté: ${client.user.tag}`);
  fetchMessages();
  setInterval(fetchMessages, 10 * 60 * 1000);
});

client.on("messageCreate", (message) => {
  if (message.channelId === CHANNEL_ID) {
    // Petit délai pour laisser le temps aux embeds/cache de se propager
    setTimeout(fetchMessages, 2000); 
  }
});

client.login(BOT_TOKEN);

// ========== API EXPRESS ==========
const app = express();

app.use(cors({
  origin: [
    "https://www.spiral-buddies.fr",
    "https://spiral-buddies.fr",
    "https://spiral-buddies.youbieflix.synology.me",
  ],
  credentials: true,
}));

app.get("/api/messages", (req, res) => {
  res.json({
    success: true,
    messages: cachedMessages,
    lastUpdate: Date.now()
  });
});

app.get("/", (req, res) => res.send("Spiral-Buddies API is Running 🚀"));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
// ========================================
// API DISCORD + PROXY MAP HYTALE
// Fusion des deux services en un seul
// ========================================

const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware"); // <--- NOUVEAU

// ========== CONFIGURATION ==========
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || process.env.DISCORD_CHANNEL_ID;
const PORT = process.env.PORT || 10000;
// L'IP de ton serveur Hytale MyBox
const HYTALE_MAP_TARGET = 'http://91.197.6.99:42037'; 

// ========== VALIDATION CRITIQUE ==========
if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error("❌ ERREUR CRITIQUE : Variables d'environnement manquantes!");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

let cachedMessages = [];

// ========== FONCTION : RÉCUPÉRATION DES MESSAGES ==========
async function fetchMessages() {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) return;

    const messages = await channel.messages.fetch({ limit: 5 });

    const processedMessages = await Promise.all(
      messages.map(async (m) => {
        let content = m.content;
        
        // Résolution des mentions (inchangé)
        const mentionMatches = content.match(/<@!?(\d+)>/g);
        if (mentionMatches) {
          for (const mention of mentionMatches) {
            const userId = mention.replace(/[<@!>]/g, "");
            try {
              const member = await m.guild.members.fetch(userId);
              const displayName = member.nickname || member.user.username;
              content = content.replace(mention, `@${displayName}`);
            } catch (err) {
              console.warn(`Impossible de résoudre l'utilisateur ${userId}`);
            }
          }
        }

        return {
          id: m.id,
          content: content, // Contenu avec pseudos lisibles
          author: m.author.username,
          avatar: m.author.displayAvatarURL({ dynamic: true }),
          timestamp: m.createdTimestamp,
          embeds: m.embeds.map((e) => ({
            title: e.title,
            description: e.description,
            image: e.image?.url,
            thumbnail: e.thumbnail?.url,
            color: e.color,
            url: e.url,
          })),
          attachments: m.attachments.map((a) => ({
            url: a.url,
            name: a.name,
            contentType: a.contentType,
          })),
        };
      })
    );

    cachedMessages = processedMessages.reverse();
    console.log(`✅ ${cachedMessages.length} messages traités`);

  } catch (error) {
    console.error("❌ Erreur fetchMessages:", error);
  }
}

// ========== ÉVÉNEMENTS DISCORD ==========
client.once("ready", () => {
  console.log(`✅ Connecté: ${client.user.tag}`);
  fetchMessages();
  setInterval(fetchMessages, 10 * 60 * 1000);
});

client.on("messageCreate", (message) => {
  if (message.channelId === CHANNEL_ID) {
    setTimeout(fetchMessages, 2000); 
  }
});

client.login(BOT_TOKEN);

// ========== SERVEUR EXPRESS (API + PROXY) ==========
const app = express();

app.use(cors({
  origin: "*", // On autorise tout pour éviter les blocages iframe/api
  credentials: true,
}));

// 1. D'abord, on sert ton API Discord (Prioritaire)
app.get("/api/messages", (req, res) => {
  res.json(cachedMessages);
});

// 2. Ensuite, tout le reste est redirigé vers la CARTE HYTALE
// C'est le proxy qui remplace Nginx
app.use("/", createProxyMiddleware({
    target: HYTALE_MAP_TARGET,
    changeOrigin: true,
    ws: true, // IMPORTANT : Active les WebSockets pour que la carte bouge en direct
    logLevel: 'debug', // Pour voir ce qui se passe dans les logs Render
    onError: (err, req, res) => {
        console.error('Erreur Proxy:', err);
        res.status(500).send('Erreur de connexion à la carte Hytale.');
    }
}));

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
  console.log(`- API Discord: /api/messages`);
  console.log(`- Carte Hytale: / (Proxy vers ${HYTALE_MAP_TARGET})`);
});
// ========================================
// SCRIPT DE MAINTIEN EN ÉVEIL (KEEP ALIVE)
// ========================================
// Empêche Render de mettre le serveur en veille après 15min d'inactivité
// S'auto-ping toutes les 14 minutes

const https = require('https');

setInterval(() => {
    // IMPORTANT : Remplace cette URL par la VRAIE adresse de ton projet Render
    // Exemple : https://carte-spiral-buddies.onrender.com/api/messages
    // Ou si tu as déjà lié ton domaine : https://carte.spiral-buddies.fr/api/messages
    
    const myUrl = 'https://carte.spiral-buddies.fr/api/messages';

    https.get(myUrl, (res) => {
        // On ne fait rien de la réponse, on veut juste générer du trafic
        // console.log(`⏰ Keep-Alive Ping envoyé (Status: ${res.statusCode})`);
    }).on('error', (err) => {
        console.error('❌ Erreur Keep-Alive:', err.message);
    });

}, 14 * 60 * 1000); // 14 minutes * 60 secondes * 1000 millisecondes
