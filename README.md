# Kerrie Kustoms Studios Ticket Bot

Dashboard includes ticket message history and a manually maintained transaction ledger.

## Railway variables
Required: DISCORD_TOKEN, DISCORD_CLIENT_ID, DASHBOARD_PASSWORD.
Optional: GUILD_ID. Railway supplies PORT automatically.
Add a Railway PostgreSQL database and set DATABASE_URL from its connection variables to persist message and transaction history across restarts. Without DATABASE_URL, history is held in memory and is lost on restart.

## Discord setup
Enable **Server Members Intent** and **Message Content Intent** in Developer Portal > Bot > Privileged Gateway Intents. The latter is required to record actual text in ticket channels. Invite bot with bot and applications.commands scopes and grant channel management, message history, send messages and attachment permissions.

## Dashboard history
Message History records new messages in channels whose names start with ticket-. It does not backfill older messages. Transaction History is a manual ledger: entries are not payment processing or provider-verified. Only users with the dashboard password can view or add records.

## Install app
Open the Railway public domain in Chrome/Edge and choose Install app, or Safari Share > Add to Home Screen. History requires an online connection.
