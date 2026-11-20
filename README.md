# Kerrie Kustoms Studios Ticket Bot

Discord.js ticket and welcome bot with a pink, gold and black dashboard.

## Ticket features
- Private tickets for General Support, Purchases and Custom Orders.
- Configurable staff role can view and claim tickets.
- Ticket owner or configured staff can close tickets.
- Transcript text file is sent to the configured transcript log channel when a ticket closes.
- Dashboard settings for staff role, transcript channel, welcome/goodbye channels and theme colors.

## Railway variables
Required: DISCORD_TOKEN, DISCORD_CLIENT_ID, DASHBOARD_PASSWORD.
Optional: GUILD_ID (test guild for faster slash-command registration). Railway supplies PORT automatically.

## Discord setup
- Enable Server Members Intent in the Developer Portal for welcome/goodbye and auto-role.
- Invite with bot and applications.commands scopes.
- Grant View Channels, Send Messages, Read Message History, Manage Channels, Attach Files and (for auto-role) Manage Roles.
- Put the bot role above roles it must assign.
- Use /ticket-panel to post the category selector.
- In the dashboard, set Staff role ID and Transcript log channel ID, then save Ticket settings.
- Members with the configured staff role can see and claim tickets. Ticket creators and staff can close them.

## Dashboard persistence note
Settings currently live in process memory and reset when Railway restarts. Configure them again after a restart until persistent database storage is added. Never commit your .env file or bot token.
