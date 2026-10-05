# Crypto Tracking Telegram Bot

## APIs
- CoinGecko public API: live prices, INR/USD price, 24h change, market cap, volume, trending coins.
- MongoDB Atlas: users and admin management.

## Setup
1. Revoke the old Telegram token in @BotFather and generate a new token.
2. Copy `.env.example` to `.env`.
3. Put the NEW token in `BOT_TOKEN`.
4. Put your MongoDB Atlas connection string in `MONGODB_URI`.
5. Put your Telegram numeric ID in `ADMIN_ID`.
6. Run:
   npm install
   npm start

## User commands
/start
/price BTC
/price ETH
/price DOGE
/trending
/help

## Admin commands
/stats
/broadcast Your message
/block USER_ID
/unblock USER_ID

Do NOT upload `.env` to GitHub.
