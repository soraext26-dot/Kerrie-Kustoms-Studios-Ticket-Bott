require("dotenv").config();
const express = require("express");
const {
  Client, GatewayIntentBits, PermissionFlagsBits, ChannelType, REST, Routes,
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, AttachmentBuilder
} = require("discord.js");

const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DASHBOARD_PASSWORD"];
for (const key of required) {
  if (!process.env[key]) { console.error("Missing environment variable:", key); process.exit(1); }
}
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static("public"));

const defaults = {
  primary_color:"#ec91c5", accent_color:"#e7c36b", background_color:"#100d12",
  welcome_channel_id:"", goodbye_channel_id:"", auto_role_id:"",
  staff_role_id:"", transcript_channel_id:"",
  welcome_message:"Welcome {user} to {server}! You are member #{count}.",
  goodbye_message:"{username} has left {server}."
};
const settings = new Map();
const openTickets = new Map();
const ticketMeta = new Map();
const getSettings = id => ({ ...defaults, ...(settings.get(id) || {}) });
const categories = [
  { label:"General Support", value:"support", description:"Questions and general help" },
  { label:"Purchases", value:"purchases", description:"Help with an order or purchase" },
  { label:"Custom Orders", value:"custom-orders", description:"Discuss a custom order" }
];
const commands = [
  new SlashCommandBuilder().setName("ticket-panel").setDescription("Post the support ticket panel."),
  new SlashCommandBuilder().setName("setup-welcome").setDescription("Set the welcome channel.")
    .addChannelOption(o=>o.setName("channel").setDescription("Welcome channel").setRequired(true)),
  new SlashCommandBuilder().setName("setup-goodbye").setDescription("Set the goodbye channel.")
    .addChannelOption(o=>o.setName("channel").setDescription("Goodbye channel").setRequired(true)),
  new SlashCommandBuilder().setName("set-auto-role").setDescription("Set the role given to new members.")
    .addRoleOption(o=>o.setName("role").setDescription("Role to assign").setRequired(true))
].map(c=>c.toJSON());

function dashboardAuth(req,res,next) {
  const supplied=req.headers["x-dashboard-password"] || req.body.password;
  if(supplied!==process.env.DASHBOARD_PASSWORD) return res.status(401).json({error:"Incorrect dashboard password."});
  next();
}
function isStaff(interaction, s) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
    (s.staff_role_id && interaction.member?.roles?.cache?.has(s.staff_role_id));
}
app.get("/api/health",(_req,res)=>res.json({ok:true,botReady:client.isReady()}));
app.get("/api/servers",dashboardAuth,(_req,res)=>res.json(client.guilds.cache.map(g=>({id:g.id,name:g.name}))));
app.get("/api/settings/:guildId",dashboardAuth,(req,res)=>{
  if(!client.guilds.cache.has(req.params.guildId)) return res.status(404).json({error:"Bot is not in that server."});
  res.json(getSettings(req.params.guildId));
});
app.post("/api/settings/:guildId",dashboardAuth,(req,res)=>{
  if(!client.guilds.cache.has(req.params.guildId)) return res.status(404).json({error:"Bot is not in that server."});
  const allowed=Object.keys(defaults);
  const patch=Object.fromEntries(Object.entries(req.body).filter(([k])=>allowed.includes(k)));
  for(const k of ["primary_color","accent_color","background_color"])
    if(patch[k] && !/^#[0-9a-f]{6}$/i.test(patch[k])) return res.status(400).json({error:k+" must be a HEX color."});
  settings.set(req.params.guildId,{...getSettings(req.params.guildId),...patch});
  res.json({ok:true,settings:getSettings(req.params.guildId)});
});

client.once("ready",async()=>{
  console.log("Logged in as "+client.user.tag);
  const rest=new REST({version:"10"}).setToken(process.env.DISCORD_TOKEN);
  try {
    const route=process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID,process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);
    await rest.put(route,{body:commands});
    console.log("Slash commands registered.");
  } catch(err) { console.error("Slash command registration failed:",err); }
});
client.on("guildMemberAdd",async member=>{
  const s=getSettings(member.guild.id);
  if(s.auto_role_id) await member.roles.add(s.auto_role_id).catch(err=>console.error("Auto-role:",err.message));
  const ch=member.guild.channels.cache.get(s.welcome_channel_id);
  if(ch?.isTextBased()) {
    const msg=s.welcome_message.replaceAll("{user}","<@"+member.id+">")
      .replaceAll("{username}",member.user.username).replaceAll("{server}",member.guild.name)
      .replaceAll("{count}",String(member.guild.memberCount));
    await ch.send({embeds:[new EmbedBuilder().setColor(s.primary_color).setDescription(msg)]}).catch(console.error);
  }
});
client.on("guildMemberRemove",async member=>{
  const s=getSettings(member.guild.id), ch=member.guild.channels.cache.get(s.goodbye_channel_id);
  if(ch?.isTextBased()) await ch.send({embeds:[new EmbedBuilder().setColor(s.accent_color)
    .setDescription(s.goodbye_message.replaceAll("{username}",member.user.username).replaceAll("{server}",member.guild.name))]}).catch(console.error);
});

async function createTicket(interaction, category) {
  const guild=interaction.guild, s=getSettings(guild.id), key=guild.id+":"+interaction.user.id;
  const previous=openTickets.get(key);
  if(previous && guild.channels.cache.has(previous))
    return interaction.reply({content:"You already have a ticket: <#"+previous+">.",ephemeral:true});
  const safeName=interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,65) || "member";
  const overwrites=[
    {id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
    {id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},
    {id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]}
  ];
  if(s.staff_role_id) overwrites.push({id:s.staff_role_id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]});
  const channel=await guild.channels.create({
    name:"ticket-"+category+"-"+safeName, type:ChannelType.GuildText, permissionOverwrites:overwrites
  });
  openTickets.set(key,channel.id);
  ticketMeta.set(channel.id,{guildId:guild.id,ownerId:interaction.user.id,category,claimedBy:null});
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:claim").setLabel("Claim Ticket").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ticket:close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger)
  );
  await channel.send({
    content:"<@"+interaction.user.id+">"+(s.staff_role_id?" <@&"+s.staff_role_id+">":""),
    embeds:[new EmbedBuilder().setColor(s.primary_color).setTitle(categories.find(c=>c.value===category)?.label+" Ticket")
      .setDescription("Thanks for contacting Kerrie Kustoms Studios. A staff member will assist you shortly.")
      .addFields({name:"Opened by",value:"<@"+interaction.user.id+">",inline:true},{name:"Category",value:category,inline:true})],
    components:[row], allowedMentions:{users:[interaction.user.id],roles:s.staff_role_id?[s.staff_role_id]:[]}
  });
  return interaction.reply({content:"Your "+category+" ticket is ready: "+channel,ephemeral:true});
}
async function makeTranscript(channel) {
  const messages=await channel.messages.fetch({limit:100});
  const lines=[...messages.values()].reverse().map(m=>{
    const stamp=new Date(m.createdTimestamp).toISOString();
    const body=m.content || (m.attachments.size ? "[attachment: "+[...m.attachments.values()].map(a=>a.url).join(", ")+"]" : "[embed or attachment]");
    return "["+stamp+"] "+m.author.tag+": "+body;
  });
  return new AttachmentBuilder(Buffer.from(lines.join("\n"),"utf8"),{name:channel.name+"-transcript.txt"});
}
client.on("interactionCreate",async interaction=>{
  try {
    if(interaction.isChatInputCommand()) {
      if(interaction.commandName==="ticket-panel") {
        const menu=new StringSelectMenuBuilder().setCustomId("ticket:category").setPlaceholder("Choose a ticket category")
          .addOptions(categories.map(c=>({label:c.label,value:c.value,description:c.description})));
        await interaction.channel.send({
          embeds:[new EmbedBuilder().setColor("#ec91c5").setTitle("Kerrie Kustoms Studios Support")
            .setDescription("Select a category below to open a private support ticket.")],
          components:[new ActionRowBuilder().addComponents(menu)]
        });
        return interaction.reply({content:"Ticket panel posted.",ephemeral:true});
      }
      if(interaction.commandName==="setup-welcome") {
        settings.set(interaction.guildId,{...getSettings(interaction.guildId),welcome_channel_id:interaction.options.getChannel("channel").id});
        return interaction.reply({content:"Welcome channel saved.",ephemeral:true});
      }
      if(interaction.commandName==="setup-goodbye") {
        settings.set(interaction.guildId,{...getSettings(interaction.guildId),goodbye_channel_id:interaction.options.getChannel("channel").id});
        return interaction.reply({content:"Goodbye channel saved.",ephemeral:true});
      }
      if(interaction.commandName==="set-auto-role") {
        settings.set(interaction.guildId,{...getSettings(interaction.guildId),auto_role_id:interaction.options.getRole("role").id});
        return interaction.reply({content:"Auto-role saved. Place the bot role above the selected role.",ephemeral:true});
      }
    }
    if(interaction.isStringSelectMenu() && interaction.customId==="ticket:category")
      return createTicket(interaction,interaction.values[0]);
    if(interaction.isButton() && interaction.customId==="ticket:claim") {
      const meta=ticketMeta.get(interaction.channelId), s=getSettings(interaction.guildId);
      if(!meta) return interaction.reply({content:"Ticket details unavailable. This ticket may have been created before the update.",ephemeral:true});
      if(!isStaff(interaction,s)) return interaction.reply({content:"Only configured staff can claim tickets.",ephemeral:true});
      if(meta.claimedBy) return interaction.reply({content:"This ticket is already claimed by <@"+meta.claimedBy+">.",ephemeral:true});
      meta.claimedBy=interaction.user.id;
      const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket:claim").setLabel("Claimed").setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId("ticket:close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger)
      );
      await interaction.message.edit({components:[row]});
      return interaction.reply({content:"You claimed this ticket.",ephemeral:true});
    }
    if(interaction.isButton() && interaction.customId==="ticket:close") {
      const meta=ticketMeta.get(interaction.channelId), s=getSettings(interaction.guildId);
      if(!meta) return interaction.reply({content:"Ticket details unavailable. Please ask a server admin to close this channel.",ephemeral:true});
      if(interaction.user.id!==meta.ownerId && !isStaff(interaction,s))
        return interaction.reply({content:"Only the ticket owner or configured staff can close this ticket.",ephemeral:true});
      await interaction.reply({content:"Creating transcript and closing ticket…",ephemeral:true});
      try {
        const transcript=await makeTranscript(interaction.channel);
        const logChannel=s.transcript_channel_id && interaction.guild.channels.cache.get(s.transcript_channel_id);
        if(logChannel?.isTextBased()) await logChannel.send({
          content:"Transcript for **"+interaction.channel.name+"** (opened by <@"+meta.ownerId+">).",
          files:[transcript]
        });
      } catch(err) { console.error("Transcript creation failed:",err); }
      openTickets.delete(meta.guildId+":"+meta.ownerId);
      ticketMeta.delete(interaction.channelId);
      await interaction.channel.delete("Ticket closed by "+interaction.user.tag).catch(console.error);
    }
  } catch(err) {
    console.error(err);
    if(interaction.isRepliable() && !interaction.replied && !interaction.deferred)
      await interaction.reply({content:"Something went wrong. Check the bot logs.",ephemeral:true}).catch(()=>{});
  }
});
const port=Number(process.env.PORT)||3000;
app.listen(port,"0.0.0.0",()=>console.log("Dashboard listening on "+port));
client.login(process.env.DISCORD_TOKEN);
