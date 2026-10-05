
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const axios = require("axios");

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_ID = String(process.env.ADMIN_ID || "");

if (!BOT_TOKEN || !MONGODB_URI) {
  console.error("Missing BOT_TOKEN or MONGODB_URI in .env");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

mongoose.connect(MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  isBlocked: { type: Boolean, default: false },
  joinedAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

async function saveUser(msg) {
  const from = msg.from;
  if (!from) return null;

  return User.findOneAndUpdate(
    { telegramId: String(from.id) },
    {
      $set: {
        username: from.username || "",
        firstName: from.first_name || "",
        lastName: from.last_name || "",
        lastActiveAt: new Date()
      },
      $setOnInsert: { joinedAt: new Date() }
    },
    { upsert: true, new: true }
  );
}

async function isBlocked(msg) {
  const user = await saveUser(msg);
  return user?.isBlocked === true;
}

function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💰 BTC Price", callback_data: "price_bitcoin" },
         { text: "💎 ETH Price", callback_data: "price_ethereum" }],
        [{ text: "🔥 Trending", callback_data: "trending" }],
        [{ text: "ℹ️ Help", callback_data: "help" }]
      ]
    }
  };
}

async function getCoinPrice(coinId) {
  const url = "https://api.coingecko.com/api/v3/simple/price";
  const { data } = await axios.get(url, {
    params: {
      ids: coinId,
      vs_currencies: "usd,inr",
      include_24hr_change: "true",
      include_market_cap: "true",
      include_24hr_vol: "true"
    },
    timeout: 10000
  });
  return data[coinId];
}

async function searchCoin(query) {
  const { data } = await axios.get("https://api.coingecko.com/api/v3/search", {
    params: { query },
    timeout: 10000
  });
  return data.coins?.[0] || null;
}

async function sendCoin(chatId, coinId, label = coinId) {
  try {
    const p = await getCoinPrice(coinId);
    if (!p) return bot.sendMessage(chatId, "Coin data nahi mili.");

    const usd = p.usd?.toLocaleString("en-US") ?? "N/A";
    const inr = p.inr?.toLocaleString("en-IN") ?? "N/A";
    const change = Number(p.usd_24h_change || 0).toFixed(2);

    const text =
`🪙 ${label.toUpperCase()}

💵 Price: $${usd}
🇮🇳 INR: ₹${inr}
📈 24h: ${change}%
🏦 Market Cap: $${Number(p.usd_market_cap || 0).toLocaleString("en-US")}
🔁 24h Volume: $${Number(p.usd_24h_vol || 0).toLocaleString("en-US")}`;

    bot.sendMessage(chatId, text);
  } catch (err) {
    console.error(err.response?.data || err.message);
    bot.sendMessage(chatId, "Price fetch nahi ho paya. Thodi der baad try karo.");
  }
}

bot.onText(/\/start/, async (msg) => {
  if (await isBlocked(msg)) return;
  const name = msg.from?.first_name || "User";
  bot.sendMessage(
    msg.chat.id,
    `👋 Hi ${name}\n\nCrypto Tracker Bot mein welcome.\n\nCoin dekhne ke liye:\n/price BTC\n/price ETH\n/trending`,
    mainMenu()
  );
});

bot.onText(/\/help/, async (msg) => {
  if (await isBlocked(msg)) return;
  bot.sendMessage(msg.chat.id,
`Commands:

/start - Main menu
/price BTC - Coin price
/price ETH - Coin price
/trending - Trending coins

Admin:
/stats
/broadcast Your message
/block USER_ID
/unblock USER_ID`);
});

bot.onText(/\/price(?:\s+(.+))?/, async (msg, match) => {
  if (await isBlocked(msg)) return;
  const query = (match?.[1] || "").trim();
  if (!query) return bot.sendMessage(msg.chat.id, "Example: /price BTC");

  try {
    const coin = await searchCoin(query);
    if (!coin) return bot.sendMessage(msg.chat.id, "Coin nahi mila.");
    await sendCoin(msg.chat.id, coin.id, `${coin.name} (${coin.symbol})`);
  } catch (err) {
    console.error(err.response?.data || err.message);
    bot.sendMessage(msg.chat.id, "Coin search nahi ho paya.");
  }
});

bot.onText(/\/trending/, async (msg) => {
  if (await isBlocked(msg)) return;
  try {
    const { data } = await axios.get("https://api.coingecko.com/api/v3/search/trending", { timeout: 10000 });
    const coins = (data.coins || []).slice(0, 7).map((x, i) =>
      `${i + 1}. ${x.item.name} (${x.item.symbol})`
    );
    bot.sendMessage(msg.chat.id, `🔥 Trending Coins\n\n${coins.join("\n") || "No data"}`);
  } catch {
    bot.sendMessage(msg.chat.id, "Trending data nahi mil paayi.");
  }
});

bot.on("callback_query", async (q) => {
  const msg = q.message;
  if (!msg) return;
  await saveUser({ from: q.from });

  if (q.data === "price_bitcoin") await sendCoin(msg.chat.id, "bitcoin", "Bitcoin (BTC)");
  if (q.data === "price_ethereum") await sendCoin(msg.chat.id, "ethereum", "Ethereum (ETH)");
  if (q.data === "trending") {
    try {
      const { data } = await axios.get("https://api.coingecko.com/api/v3/search/trending", { timeout: 10000 });
      const coins = (data.coins || []).slice(0, 7).map((x, i) =>
        `${i + 1}. ${x.item.name} (${x.item.symbol})`
      );
      await bot.sendMessage(msg.chat.id, `🔥 Trending Coins\n\n${coins.join("\n") || "No data"}`);
    } catch {
      await bot.sendMessage(msg.chat.id, "Trending data nahi mil paayi.");
    }
  }
  if (q.data === "help") {
    await bot.sendMessage(msg.chat.id, "Use /price BTC, /price ETH, /trending");
  }

  bot.answerCallbackQuery(q.id).catch(() => {});
});

bot.onText(/\/stats/, async (msg) => {
  if (String(msg.from?.id) !== ADMIN_ID) return;
  const total = await User.countDocuments();
  const blocked = await User.countDocuments({ isBlocked: true });

  bot.sendMessage(msg.chat.id,
`📊 Bot Stats

👥 Total users: ${total}
🚫 Blocked: ${blocked}
✅ Active/Allowed: ${total - blocked}`);
});

bot.onText(/\/broadcast\s+([\s\S]+)/, async (msg, match) => {
  if (String(msg.from?.id) !== ADMIN_ID) return;

  const message = match?.[1]?.trim();
  if (!message) return;

  const users = await User.find({ isBlocked: false }).select("telegramId");
  let sent = 0;
  let failed = 0;

  for (const u of users) {
    try {
      await bot.sendMessage(u.telegramId, `📢 ${message}`);
      sent++;
    } catch {
      failed++;
    }
  }

  bot.sendMessage(msg.chat.id, `Broadcast done.\n✅ Sent: ${sent}\n❌ Failed: ${failed}`);
});

bot.onText(/\/block\s+(\d+)/, async (msg, match) => {
  if (String(msg.from?.id) !== ADMIN_ID) return;
  const id = match[1];

  await User.findOneAndUpdate(
    { telegramId: id },
    { $set: { isBlocked: true } },
    { upsert: true }
  );

  bot.sendMessage(msg.chat.id, `🚫 User ${id} blocked.`);
});

bot.onText(/\/unblock\s+(\d+)/, async (msg, match) => {
  if (String(msg.from?.id) !== ADMIN_ID) return;
  const id = match[1];

  await User.findOneAndUpdate(
    { telegramId: id },
    { $set: { isBlocked: false } },
    { upsert: true }
  );

  bot.sendMessage(msg.chat.id, `✅ User ${id} unblocked.`);
});

bot.on("polling_error", (err) => {
  console.error("Polling error:", err.message);
});

console.log("Bot running...");
