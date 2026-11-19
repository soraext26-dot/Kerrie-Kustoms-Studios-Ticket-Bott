require("dotenv").config();
const express = require("express");
const {
  Client, GatewayIntentBits, PermissionFlagsBits, ChannelType, REST, Routes,
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require("discord.js");

const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DASHBOARD_PASSWORD"];
for (const key of required) {
  if (!process.env[key]) {
    console.error("Missing environment variable:", key);
    process.exit(1);
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static("public"));

const defaults = {
  primary_color: "#ec91c5", accent_color: "#e7c36b", background_color: "#100d12",
  welcome_channel_id: "", goodbye_channel_id: "", auto_role_id: "",
  welcome_message: "Welcome {user} to {server}! You are member #{count}.",
  goodbye_message: "{username} has left {server}."
};
const settings = new Map();
const openTickets = new Map();
const getSettings = id => ({ ...defaults, ...(settings.get(id) || {}) });
const commands = [
  new SlashCommandBuilder().setName("ticket-panel").setDescription("Post the support ticket panel."),
  new SlashCommandBuilder().setName("setup-welcome").setDescription("Set the welcome channel.")
    .addChannelOption(o => o.setName("channel").setDescription("Welcome channel").setRequired(true)),
  new SlashCommandBuilder().setName("setup-goodbye").setDescription("Set the goodbye channel.")
    .addChannelOption(o => o.setName("channel").setDescription("Goodbye channel").setRequired(true)),
  new SlashCommandBuilder().setName("set-auto-role").setDescription("Set the role given to new members.")
    .addRoleOption(o => o.setName("role").setDescription("Role to assign").setRequired(true))
].map(c => c.toJSON());

function dashboardAuth(req, res, next) {
  const supplied = req.headers["x-dashboard-password"] || req.body.password;
  if (supplied !== process.env.DASHBOARD_PASSWORD) return res.status(401).json({ error: "Incorrect dashboard password." });
  next();
}
app.get("/api/health", (_req, res) => res.json({ ok: true, botReady: client.isReady() }));
app.get("/api/servers", dashboardAuth, (_req, res) => res.json(client.guilds.cache.map(g => ({ id: g.id, name: g.name }))));
app.get("/api/settings/:guildId", dashboardAuth, (req, res) => {
  if (!client.guilds.cache.has(req.params.guildId)) return res.status(404).json({ error: "Bot is not in that server." });
  res.json(getSettings(req.params.guildId));
});
app.post("/api/settings/:guildId", dashboardAuth, (req, res) => {
  if (!client.guilds.cache.has(req.params.guildId)) return res.status(404).json({ error: "Bot is not in that server." });
  const allowed = Object.keys(defaults);
  const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  for (const k of ["primary_color", "accent_color", "background_color"]) {
    if (patch[k] && !/^#[0-9a-f]{6}$/i.test(patch[k])) return res.status(400).json({ error: k + " must be a HEX color." });
  }
  settings.set(req.params.guildId, { ...getSettings(req.params.guildId), ...patch });
  res.json({ ok: true, settings: getSettings(req.params.guildId) });
});

client.once("ready", async () => {
  console.log("Logged in as " + client.user.tag);
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);
    await rest.put(route, { body: commands });
    console.log("Slash commands registered.");
  } catch (err) { console.error("Slash command registration failed:", err); }
});

client.on("guildMemberAdd", async member => {
  const s = getSettings(member.guild.id);
  if (s.auto_role_id) await member.roles.add(s.auto_role_id).catch(err => console.error("Auto-role:", err.message));
  if (s.welcome_channel_id) {
    const ch = member.guild.channels.cache.get(s.welcome_channel_id);
    if (ch && ch.isTextBased()) {
      const msg = s.welcome_message.replaceAll("{user}", "<@" + member.id + ">")
        .replaceAll("{username}", member.user.username).replaceAll("{server}", member.guild.name)
        .replaceAll("{count}", String(member.guild.memberCount));
      await ch.send({ embeds: [new EmbedBuilder().setColor(s.primary_color).setDescription(msg)] }).catch(console.error);
    }
  }
});
client.on("guildMemberRemove", async member => {
  const s = getSettings(member.guild.id);
  const ch = member.guild.channels.cache.get(s.goodbye_channel_id);
  if (ch && ch.isTextBased()) await ch.send({ embeds: [new EmbedBuilder().setColor(s.accent_color)
    .setDescription(s.goodbye_message.replaceAll("{username}", member.user.username).replaceAll("{server}", member.guild.name))] }).catch(console.error);
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "ticket-panel") {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ticket:create").setLabel("Create a ticket").setStyle(ButtonStyle.Primary)
        );
        await interaction.channel.send({ embeds: [new EmbedBuilder().setColor("#ec91c5")
          .setTitle("Kerrie Kustoms Studios Support").setDescription("Need help? Open a private support ticket below.")], components: [row] });
        return interaction.reply({ content: "Ticket panel posted.", ephemeral: true });
      }
      if (interaction.commandName === "setup-welcome") {
        settings.set(interaction.guildId, { ...getSettings(interaction.guildId), welcome_channel_id: interaction.options.getChannel("channel").id });
        return interaction.reply({ content: "Welcome channel saved.", ephemeral: true });
      }
      if (interaction.commandName === "setup-goodbye") {
        settings.set(interaction.guildId, { ...getSettings(interaction.guildId), goodbye_channel_id: interaction.options.getChannel("channel").id });
        return interaction.reply({ content: "Goodbye channel saved.", ephemeral: true });
      }
      if (interaction.commandName === "set-auto-role") {
        settings.set(interaction.guildId, { ...getSettings(interaction.guildId), auto_role_id: interaction.options.getRole("role").id });
        return interaction.reply({ content: "Auto-role saved. Place the bot role above the selected role.", ephemeral: true });
      }
    }
    if (interaction.isButton() && interaction.customId === "ticket:create") {
      const key = interaction.guildId + ":" + interaction.user.id;
      const previous = openTickets.get(key);
      if (previous && interaction.guild.channels.cache.has(previous)) {
        return interaction.reply({ content: "You already have a ticket: <#" + previous + ">.", ephemeral: true });
      }
      const channel = await interaction.guild.channels.create({
        name: "ticket-" + interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80),
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] }
        ]
      });
      openTickets.set(key, channel.id);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket:close").setLabel("Close ticket").setStyle(ButtonStyle.Danger)
      );
      await channel.send({ content: "<@" + interaction.user.id + ">", embeds: [
        new EmbedBuilder().setColor("#ec91c5").setTitle("Support ticket").setDescription("Tell our team how we can help.")
      ], components: [row] });
      return interaction.reply({ content: "Your ticket is ready: " + channel, ephemeral: true });
    }
    if (interaction.isButton() && interaction.customId === "ticket:close") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: "Only staff with Manage Channels can close this ticket.", ephemeral: true });
      }
      await interaction.reply({ content: "Closing ticket in a moment.", ephemeral: true });
      setTimeout(() => interaction.channel.delete("Ticket closed").catch(console.error), 3000);
    }
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred)
      await interaction.reply({ content: "Something went wrong. Check the bot logs.", ephemeral: true }).catch(() => {});
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => console.log("Dashboard listening on " + port));
client.login(process.env.DISCORD_TOKEN);
