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
const PORT = process.env.PORT || 10000; // Render utilise PORT dynamique

// ========== VALIDATION CRITIQUE ==========
if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error("❌ ERREUR CRITIQUE : Variables d'environnement manquantes!");
  console.error("BOT_TOKEN:", BOT_TOKEN ? "✅ Défini" : "❌ MANQUANT");
  console.error("CHANNEL_ID:", CHANNEL_ID ? "✅ Défini" : "❌ MANQUANT");
  console.error("\n📋 Sur Render, configure ces variables dans Environment :");
  console.error("   - BOT_TOKEN ou DISCORD_TOKEN");
  console.error("   - CHANNEL_ID ou DISCORD_CHANNEL_ID");
  process.exit(1); // Arrête l'app si config invalide
}

console.log("✅ Configuration validée");
console.log("- Channel ID:", CHANNEL_ID);
console.log("- Port:", PORT);

// ========== CLIENT DISCORD ==========
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Variable pour stocker les messages en cache
let cachedMessages = [];

// ========== FONCTION : RÉCUPÉRATION DES MESSAGES ==========
async function fetchMessages() {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    
    if (!channel) {
      console.error(`❌ Salon ${CHANNEL_ID} introuvable`);
      return;
    }

    const messages = await channel.messages.fetch({ limit: 3 }); // Augmenté à 3
    
    cachedMessages = messages
      .map((m) => ({
        id: m.id,
        author: {
          username: m.author.username,
          avatar: m.author.displayAvatarURL({ format: "png", size: 128 }),
          bot: m.author.bot,
        },
        content: m.content,
        timestamp: m.createdTimestamp,
        date: new Date(m.createdTimestamp).toLocaleString("fr-FR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
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
          size: a.size,
        })),
      }))
      .reverse(); // Ordre chronologique (du plus ancien au plus récent)

    console.log(`✅ ${cachedMessages.length} messages récupérés depuis Discord`);
  } catch (error) {
    console.error("❌ Erreur récupération messages:", error.message);
    console.error("Stack:", error.stack);
  }
}

// ========== ÉVÉNEMENTS DISCORD ==========

// Bot prêt
client.once("ready", () => {
  console.log(`✅ Bot Discord connecté : ${client.user.tag}`);
  console.log(`📡 Serveurs : ${client.guilds.cache.size}`);
  
  // Récupération initiale
  fetchMessages();
  
  // Actualiser automatiquement toutes les 10 minutes
  setInterval(fetchMessages, 10 * 60 * 1000);
});

// Nouveau message créé (actualisation immédiate)
client.on("messageCreate", (message) => {
  if (message.channelId === CHANNEL_ID) {
    console.log(`📩 Nouveau message dans le canal surveillé, actualisation...`);
    fetchMessages();
  }
});

// Gestion des erreurs Discord
client.on("error", (error) => {
  console.error("❌ Erreur Discord Client:", error);
});

// Connexion au bot Discord
client.login(BOT_TOKEN).catch((err) => {
  console.error("❌ Impossible de se connecter à Discord:", err);
  process.exit(1);
});

// ========== API EXPRESS ==========
const app = express();

// CORS configuré pour Spiral-Buddies
app.use(
  cors({
    origin: [
      "https://www.spiral-buddies.fr",
      "https://spiral-buddies.fr",
      "http://localhost:3000", // Pour tests en local
    ],
    credentials: true,
  })
);

app.use(express.json());

// ========== ROUTES ==========

// Route API principale (pour ton site)
app.get("/api/messages", (req, res) => {
  res.json({
    success: true,
    count: cachedMessages.length,
    messages: cachedMessages,
    lastUpdate: cachedMessages[0]?.timestamp || null,
  });
});

// Route de diagnostic (page HTML)
app.get("/", (req, res) => {
  const uptimeMinutes = Math.floor(process.uptime() / 60);
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Spiral-Buddies API</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          max-width: 800px; 
          margin: 50px auto; 
          padding: 20px;
          background: #0d1117;
          color: #c9d1d9;
        }
        .status { 
          padding: 15px; 
          border-radius: 8px; 
          margin: 10px 0;
          background: #161b22;
          border: 1px solid #30363d;
        }
        .ok { color: #3fb950; }
        .error { color: #f85149; }
        a { color: #58a6ff; }
      </style>
    </head>
    <body>
      <h1>🎮 Spiral-Buddies Discord API</h1>
      
      <div class="status">
        <h2>📊 Statut</h2>
        <p class="${client.user ? 'ok' : 'error'}">
          Bot Discord : ${client.user ? `✅ ${client.user.tag}` : "❌ Déconnecté"}
        </p>
        <p>📦 Messages en cache : <strong>${cachedMessages.length}</strong></p>
        <p>⏱️ Uptime : <strong>${uptimeMinutes} minutes</strong></p>
        <p>🕒 Dernière actualisation : ${cachedMessages[0]?.date || "Jamais"}</p>
      </div>

      <div class="status">
        <h2>🔗 Endpoints</h2>
        <ul>
          <li><a href="/api/messages">/api/messages</a> - Messages Discord (JSON)</li>
          <li><a href="/health">/health</a> - Health check</li>
        </ul>
      </div>

      <div class="status">
        <p><small>🚀 Hébergé sur Render.com</small></p>
      </div>
    </body>
    </html>
  `);
});

// Health check (pour monitoring Render + keep-alive)
app.get("/health", (req, res) => {
  const isHealthy = client.user && cachedMessages.length > 0;
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    bot: client.user ? client.user.tag : "Disconnected",
    messages: cachedMessages.length,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// 404 pour routes inconnues
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    availableRoutes: ["/", "/api/messages", "/health"],
  });
});

// ========== DÉMARRAGE SERVEUR ==========
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API Express démarrée`);
  console.log(`🌐 Port : ${PORT}`);
  console.log(`🔗 URL locale : http://localhost:${PORT}`);
  
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`🌍 URL publique : ${process.env.RENDER_EXTERNAL_URL}`);
  }
});

// ========== KEEP-ALIVE RENDER (ANTI-SLEEP) ==========
if (process.env.RENDER_EXTERNAL_URL) {
  const SELF_URL = process.env.RENDER_EXTERNAL_URL;
  
  console.log("✅ Keep-alive activé pour Render");
  
  // Ping toutes les 10 minutes pour empêcher le sleep
  setInterval(() => {
    fetch(`${SELF_URL}/health`)
      .then((res) => res.json())
      .then((data) => console.log("✅ Keep-alive ping:", data.status))
      .catch((err) => console.error("❌ Keep-alive failed:", err.message));
  }, 10 * 60 * 1000); // 10 minutes
}

// ========== GESTION DES ERREURS GLOBALES ==========
process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Promise Rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

// Arrêt propre
process.on("SIGTERM", () => {
  console.log("⚠️ SIGTERM reçu, arrêt propre...");
  client.destroy();
  process.exit(0);
});

console.log("✅ Serveur initialisé avec succès");
