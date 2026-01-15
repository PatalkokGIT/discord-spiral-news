// ========================================
// API DISCORD + PROXY MAP HYTALE (Render)
// Version Corrigée Finale
// ========================================

const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const https = require('https'); // Pour pinger l'extérieur
const http = require('http');   // Pour pinger le localhost

// ========== CONFIGURATION ==========
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || process.env.DISCORD_CHANNEL_ID;
const PORT = process.env.PORT || 10000;
const HYTALE_MAP_TARGET = 'http://91.197.6.99:42037'; // Ton VPS Minestrator

// ========== 1. BOT DISCORD ==========
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
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
            id: m.id, content: content, author: m.author.username,
            avatar: m.author.displayAvatarURL({ dynamic: true }),
            timestamp: m.createdTimestamp, embeds: m.embeds, attachments: m.attachments
        };
    }));
    cachedMessages = processedMessages.reverse();
    console.log(`✅ [Discord] ${cachedMessages.length} messages mis à jour.`);
  } catch (error) { console.error("❌ [Discord] Erreur fetch:", error.message); }
}

client.once("ready", () => {
  console.log(`🤖 Bot connecté: ${client.user.tag}`);
  fetchMessages();
  setInterval(fetchMessages, 5 * 60 * 1000);
});
if (BOT_TOKEN) client.login(BOT_TOKEN);

// ========== 2. SERVEUR EXPRESS & PROXY ==========
const app = express();

// Autorise tout le monde (règle le problème d'affichage sur ton site)
app.use(cors({ origin: "*" })); 

// --- A. Routes Prioritaires (API) ---
app.get("/api/messages", (req, res) => res.json(cachedMessages));
app.get("/keep-alive", (req, res) => res.send("I am alive!"));

// --- B. Proxy Hytale (Catch-All) ---
// Tout ce qui n'est PAS /api/messages part vers la carte Hytale
const mapProxy = createProxyMiddleware({
  target: HYTALE_MAP_TARGET,
  changeOrigin: true,
  ws: true, // Vital pour la carte
  logLevel: 'error',
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('Connection', 'keep-alive');
  },
  onError: (err, req, res) => {
    // Si Hytale est éteint, on ne plante pas, on envoie un message
    console.error('[Proxy Error] Hytale injoignable:', err.message);
    res.status(502).send('La carte est en cours de redémarrage (Serveur Hytale injoignable).');
  }
});

app.use("/", mapProxy);

// Démarrage
const server = app.listen(PORT, () => {
  console.log(`🚀 Serveur Render lancé sur le port ${PORT}`);
});

// Upgrade WebSocket manuel
server.on('upgrade', (req, socket, head) => {
  mapProxy.upgrade(req, socket, head);
});

// ========== 3. SCRIPT ANTI-SOMMEIL (CORRIGÉ) ==========
setInterval(() => {
    // On ping l'URL publique HTTPS pour garder Render éveillé
    // Si ton domaine custom ne marche pas encore, utilise l'URL Render (.onrender.com)
    const publicUrl = "https://carte.spiral-buddies.fr/keep-alive";
    
    https.get(publicUrl, (res) => {
        // Ping réussi
    }).on('error', (e) => {
        console.log("Ping keep-alive échoué (normal si redémarrage)");
    });
}, 14 * 60 * 1000); // 14 minutes
