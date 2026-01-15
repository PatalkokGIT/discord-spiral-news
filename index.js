// ========================================
// API DISCORD + PROXY MAP HYTALE (Render)
// ========================================

const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const https = require('https');

// ========== CONFIGURATION ==========
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || process.env.DISCORD_CHANNEL_ID;
const PORT = process.env.PORT || 10000;
// L'adresse brute de ton serveur Hytale (HTTP)
const HYTALE_MAP_TARGET = 'http://91.197.6.99:42037'; 

// ========== VALIDATION BOT DISCORD ==========
if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error("❌ ERREUR : Variables BOT_TOKEN ou CHANNEL_ID manquantes !");
  // On ne quitte pas le process pour ne pas tuer le proxy si le bot échoue, 
  // mais le bot ne marchera pas.
}

// ========== PARTIE 1 : BOT DISCORD ==========
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

let cachedMessages = [];

async function fetchMessages() {
  if (!client.isReady()) return;
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) return;
    const messages = await channel.messages.fetch({ limit: 5 });
    
    const processedMessages = await Promise.all(messages.map(async (m) => {
        let content = m.content;
        // Résolution basique des mentions
        const mentionMatches = content.match(/<@!?(\d+)>/g);
        if (mentionMatches) {
          for (const mention of mentionMatches) {
            const userId = mention.replace(/[<@!>]/g, "");
            try {
              const member = await m.guild.members.fetch(userId);
              content = content.replace(mention, `@${member.displayName}`);
            } catch (e) {}
          }
        }
        return {
          id: m.id,
          content: content,
          author: m.author.username,
          avatar: m.author.displayAvatarURL({ dynamic: true }),
          timestamp: m.createdTimestamp,
          embeds: m.embeds,
          attachments: m.attachments
        };
    }));
    cachedMessages = processedMessages.reverse();
    console.log(`✅ [Discord] ${cachedMessages.length} messages mis à jour.`);
  } catch (error) {
    console.error("❌ [Discord] Erreur fetch:", error.message);
  }
}

client.once("ready", () => {
  console.log(`🤖 Bot connecté: ${client.user.tag}`);
  fetchMessages();
  setInterval(fetchMessages, 5 * 60 * 1000); // Mise à jour toutes les 5 min
});

if (BOT_TOKEN) client.login(BOT_TOKEN);


// ========== PARTIE 2 : SERVEUR EXPRESS (PROXY) ==========
const app = express();

// Configuration CORS permissive pour éviter les blocages
app.use(cors({ origin: "*" }));

// --- Route API Discord ---
app.get("/api/messages", (req, res) => {
  res.json(cachedMessages);
});

// --- Route Keep-Alive (pour Render) ---
app.get("/keep-alive", (req, res) => {
  res.send("I am alive!");
});

// --- PROXY VERS HYTALE (Le cœur du système) ---
// On intercepte TOUT ce qui n'est pas /api/messages et on l'envoie vers Hytale
const mapProxy = createProxyMiddleware({
  target: HYTALE_MAP_TARGET,
  changeOrigin: true, // Important pour tromper le serveur Hytale
  ws: true,           // CRUCIAL : Active le support WebSocket pour les mises à jour live
  pathRewrite: {
    // Pas de réécriture nécessaire ici, on veut tout passer tel quel
  },
  router: {
    // Si besoin de logique complexe, mais ici c'est direct
  },
  onProxyReq: (proxyReq, req, res) => {
    // Parfois utile pour déboguer
    // console.log(`[Proxy] ${req.method} ${req.url} -> ${HYTALE_MAP_TARGET}${req.url}`);
  },
  onError: (err, req, res) => {
    console.error('[Proxy] Erreur:', err.message);
    res.status(500).send('Erreur de connexion à la carte Hytale.');
  }
});

// On applique le proxy sur la racine "/"
app.use("/", mapProxy);

// Démarrage du serveur
const server = app.listen(PORT, () => {
  console.log(`🚀 Serveur Render lancé sur le port ${PORT}`);
  console.log(`🌍 Proxy Carte Hytale actif vers : ${HYTALE_MAP_TARGET}`);
});

// Important pour les WebSockets : on upgrade manuellement la connexion
server.on('upgrade', (req, socket, head) => {
  mapProxy.upgrade(req, socket, head);
});


// ========== SCRIPT ANTI-SOMMEIL RENDER ==========
setInterval(() => {
    // On ping notre propre route keep-alive
    // Adapte l'URL si tu utilises un domaine perso
    const myUrl = `https://carte.spiral-buddies.fr/keep-alive`; 
    
    https.get(myUrl, (res) => {
        // console.log(`⏰ Ping Keep-Alive envoyé (${res.statusCode})`);
    }).on('error', (e) => {
        console.error(`❌ Erreur Keep-Alive: ${e.message}`);
    });
}, 14 * 60 * 1000); // 14 minutes
