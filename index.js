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

// ========== VALIDATION VARIABLES ==========
if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error("⚠️ ATTENTION : Variables BOT_TOKEN ou CHANNEL_ID manquantes.");
  console.error("Le Bot Discord ne démarrera pas, mais le Proxy Carte restera actif.");
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
        // Résolution des mentions <@123456> en pseudos
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

if (BOT_TOKEN) client.login(BOT_TOKEN).catch(e => console.error("Erreur Login Bot:", e));


// ========== PARTIE 2 : SERVEUR EXPRESS (PROXY) ==========
const app = express();

// Configuration CORS
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
// Redirige tout le reste vers Hytale
const mapProxy = createProxyMiddleware({
  target: HYTALE_MAP_TARGET,
  changeOrigin: true, 
  ws: true,           // Active les WebSockets (Vital pour la carte)
  logLevel: 'error',  // Réduit le bruit dans les logs
  onProxyReq: (proxyReq, req, res) => {
    // Force la connexion en HTTP 1.1 pour éviter des soucis de chunking
    proxyReq.setHeader('Connection', 'keep-alive');
  },
  onError: (err, req, res) => {
    console.error('[Proxy Error]', err.message);
    res.status(500).send('La carte est en cours de redémarrage ou inaccessible.');
  }
});

// Applique le proxy sur la racine
app.use("/", mapProxy);

// Démarrage du serveur
const server = app.listen(PORT, () => {
  console.log(`🚀 Serveur Render lancé sur le port ${PORT}`);
  console.log(`🌍 Proxy Carte Hytale actif vers : ${HYTALE_MAP_TARGET}`);
});

// Gestion manuelle de l'upgrade WebSocket (nécessaire sur certains hébergeurs)
server.on('upgrade', (req, socket, head) => {
  mapProxy.upgrade(req, socket, head);
});


// ========== SCRIPT ANTI-SOMMEIL RENDER ==========
setInterval(() => {
    // Remplace par ton URL finale Render ou ton domaine perso
    // ex: https://carte.spiral-buddies.fr/keep-alive
    // En attendant que ton domaine marche, utilise l'URL Render en .onrender.com
    const myUrl = `http://localhost:${PORT}/keep-alive`; 
    
    https.get(myUrl, (res) => {
        // Ping silencieux
    }).on('error', (e) => {
        // Ignorer les erreurs de ping local
    });
}, 14 * 60 * 1000); // 14 minutes
