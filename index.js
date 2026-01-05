const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const cors = require("cors");

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN; // Token Discord
const CHANNEL_ID = process.env.CHANNEL_ID; // ID du salon
const PORT = 3000;

// Créer le client Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Créer l'API Express
const app = express();
app.use(cors()); // Autoriser les requêtes depuis ton site

// Variable pour stocker les messages
let cachedMessages = [];

// Fonction pour récupérer les messages
async function fetchMessages() {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) {
      console.error("❌ Salon introuvable");
      return;
    }

    const messages = await channel.messages.fetch({ limit: 3 });

    cachedMessages = messages
      .map((m) => ({
        id: m.id,
        author: {
          username: m.author.username,
          avatar: m.author.displayAvatarURL({ format: "png", size: 128 }),
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
          color: e.color,
        })),
        attachments: m.attachments.map((a) => ({
          url: a.url,
          name: a.name,
          contentType: a.contentType,
        })),
      }))
      .reverse(); // Ordre chronologique

    console.log(`✅ ${cachedMessages.length} messages récupérés`);
  } catch (error) {
    console.error("❌ Erreur récupération messages:", error);
  }
}

// Bot prêt
client.once("ready", () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
  fetchMessages();

  // Actualiser les messages toutes les 5 minutes
  setInterval(fetchMessages, 5 * 60 * 1000);
});

// Démarrer le bot
client.login(BOT_TOKEN);

// Route API
app.get("/api/messages", (req, res) => {
  res.json({
    success: true,
    count: cachedMessages.length,
    messages: cachedMessages,
  });
});

// Route de test
app.get("/", (req, res) => {
  res.send(`
    <h1>🤖 Spiral-Buddies Discord API</h1>
    <p>✅ Bot actif : ${client.user ? client.user.tag : "En attente..."}</p>
    <p>📊 Messages en cache : ${cachedMessages.length}</p>
    <p>🔗 <a href="/api/messages">Voir les messages (JSON)</a></p>
  `);
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 API démarrée sur le port ${PORT}`);
});

// Keep Alive (pour Replit gratuit)
setInterval(
  () => {
    console.log("⏰ Keep alive ping");
  },
  5 * 60 * 1000,
);
