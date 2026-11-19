# Kerrie Kustoms Studios Ticket Bot

Discord.js v14 ticket and welcome bot with a pink, gold and black web dashboard.

## Deploy on Railway
1. Connect this GitHub repository to Railway.
2. Add the variables below in Railway > Variables.
3. Deploy. Railway runs `npm start` and checks `/api/health`.

Required variables:
- `DISCORD_TOKEN`: bot token from Discord Developer Portal
- `DISCORD_CLIENT_ID`: Application ID
- `DASHBOARD_PASSWORD`: choose a strong private password

Optional:
- `GUILD_ID`: test server ID for faster slash-command registration
- `PORT`: Railway supplies this automatically

## Discord setup
- Enable **Server Members Intent** in Developer Portal for welcome/goodbye and auto-role.
- Invite the bot with `bot` and `applications.commands` scopes.
- Grant View Channels, Send Messages, Read Message History, Manage Channels, and (for auto-role) Manage Roles.
- Keep the bot's role above any role it must assign.
- Run `/ticket-panel` in the channel where users should open tickets.
- Use `/setup-welcome`, `/setup-goodbye`, and `/set-auto-role` to configure the server.

## Dashboard
Open the Railway service's public domain. Enter the dashboard password from Railway Variables. Dashboard settings are currently held in process memory and reset if the service restarts; add a persistent database before relying on long-term settings storage.

Never commit your bot token or dashboard password. Do not upload your `.env` file to GitHub.
