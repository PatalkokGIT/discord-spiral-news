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
