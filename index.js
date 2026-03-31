require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  Collection,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
  ],
});

async function fetchApifyProfile(username) {
  const clean = username.replace(/^@+/, "");
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    const err = new Error("APIFY_TOKEN is missing in .env.");
    err.code = "APIFY_TOKEN_REQUIRED";
    throw err;
  }

  const actorId =
    process.env.APIFY_TIKTOK_ACTOR ?? "lanky_quantifier~tiktok-profile-scraper";
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(
    token
  )}`;

  const input = {
    profiles: [clean],
    maxVideos: 0,
    scrapeType: "profiles",
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ??
      data?.message ??
      `HTTP ${response.status}`;
    throw new Error(message);
  }

  if (!Array.isArray(data) || data.length === 0) {
    const err = new Error("TikTok profile not found.");
    err.code = "APIFY_EMPTY";
    throw err;
  }

  const byUsername = data.find(
    (item) =>
      item?.type === "profile" &&
      item?.username?.toLowerCase() === clean.toLowerCase()
  );

  return byUsername ?? data[0];
}

client.once(Events.ClientReady, () => {
  if (client.user) {
    client.user.setPresence({
      activities: [],
      status: "online",
    });
  }
  console.log(`Logged in as ${client.user?.tag ?? "bot"}`);
});

client.once(Events.ClientReady, async () => {
  const guilds = client.guilds.cache.values();
  for (const guild of guilds) {
    try {
      const invites = await guild.invites.fetch();
      inviteCache.set(guild.id, new Collection(invites.map((i) => [i.code, i])));
    } catch (err) {
      console.warn(`Invite cache init failed for guild ${guild.id}`, err);
    }
  }
});

client.on(Events.InviteCreate, (invite) => {
  const guildInvites = inviteCache.get(invite.guild.id) ?? new Collection();
  guildInvites.set(invite.code, invite);
  inviteCache.set(invite.guild.id, guildInvites);
});

client.on(Events.InviteDelete, (invite) => {
  const guildInvites = inviteCache.get(invite.guild.id);
  if (!guildInvites) return;
  guildInvites.delete(invite.code);
});

const DATA_PATH = path.join(__dirname, "balances.json");
const TICKETS_PATH = path.join(__dirname, "tickets.json");
const INVITE_CHANNEL_ID = "1476557599020290109";
const WELCOME_CHANNEL_ID = "1476599461584179295";

const inviteCache = new Map();

function loadBalances() {
  try {
    if (!fs.existsSync(DATA_PATH)) return {};
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveBalances(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
}

function loadTickets() {
  try {
    if (!fs.existsSync(TICKETS_PATH)) return {};
    const raw = fs.readFileSync(TICKETS_PATH, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTickets(data) {
  fs.writeFileSync(TICKETS_PATH, JSON.stringify(data, null, 2), "utf8");
}

function normalizeTicketEntry(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return { channelId: value, createdAt: null };
  }
  if (typeof value === "object") {
    return {
      channelId: value.channelId ?? value.channel ?? value.id ?? null,
      createdAt: value.createdAt ?? value.created_at ?? null,
    };
  }
  return null;
}

function getBalance(data, userId) {
  if (typeof data[userId] !== "number") data[userId] = 0;
  return data[userId];
}

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "help") {
      const embed = new EmbedBuilder()
        .setTitle("Help")
        .setDescription("List of available commands.")
        .addFields({ name: "/help", value: "Shows this help message." })
        .setColor(0x00b0ff);

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === "balance") {
      const data = loadBalances();
      const balance = getBalance(data, interaction.user.id);
      saveBalances(data);

      const embed = new EmbedBuilder()
        .setTitle("Balance")
        .setDescription(`Balance: **${balance}**`)
        .setColor(0x2ecc71);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("deposit")
          .setLabel("Deposit")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setLabel("Help server")
          .setStyle(ButtonStyle.Link)
          .setURL("https://discord.gg/la-7")
      );

      await interaction.reply({ embeds: [embed], components: [row] });
      return;
    }

    if (interaction.commandName === "tiktok") {
      const username = interaction.options.getString("user", true).trim();

      try {
        const data = await fetchApifyProfile(username);

        const displayName =
          data?.nickname ?? data?.displayName ?? data?.author?.nickname ?? null;
        const usernameValue =
          data?.uniqueId ??
          data?.username ??
          data?.author?.uniqueId ??
          `@${username.replace(/^@+/, "")}`;
        const avatar =
          data?.avatar ??
          data?.avatarThumb ??
          data?.avatarUrl ??
          data?.author?.avatarThumb ??
          null;

        const followerCount =
          data?.followers ??
          data?.fans ??
          data?.followerCount ??
          data?.stats?.followerCount ??
          null;
        const followingCount =
          data?.following ??
          data?.followingCount ??
          data?.stats?.followingCount ??
          null;
        const likesCount =
          data?.likes ??
          data?.heartCount ??
          data?.stats?.heartCount ??
          null;
        const videoCount =
          data?.videos ??
          data?.videoCount ??
          data?.stats?.videoCount ??
          null;

        const embed = new EmbedBuilder()
          .setTitle(`TikTok: @${usernameValue.toString().replace(/^@+/, "")}`)
          .setDescription(displayName ?? "TikTok profile")
          .setColor(0x010101);

        if (avatar) embed.setThumbnail(avatar);

        const fields = [];
        if (typeof followerCount === "number") {
          fields.push({ name: "Followers", value: `${followerCount}`, inline: true });
        }
        if (typeof followingCount === "number") {
          fields.push({ name: "Following", value: `${followingCount}`, inline: true });
        }
        if (typeof likesCount === "number") {
          fields.push({ name: "Likes", value: `${likesCount}`, inline: true });
        }
        if (typeof videoCount === "number") {
          fields.push({ name: "Videos", value: `${videoCount}`, inline: true });
        }

        if (fields.length > 0) embed.addFields(fields);

        await interaction.reply({ embeds: [embed] });
        return;
      } catch (err) {
        console.error("TikTok error:", err);
        let message = "Error while fetching TikTok profile.";
        if (err?.code === "APIFY_TOKEN_REQUIRED") {
          message = "APIFY_TOKEN is missing in .env.";
        } else if (err?.message === "TikTok profile not found.") {
          message = `TikTok profile not found for "${username}".`;
        }
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
        return;
      }
    }

    if (interaction.commandName === "ticket-setup") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          content: "You must be an administrator to use this command.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const channel =
        interaction.options.getChannel("channel") ?? interaction.channel;
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: "Please select a valid text channel.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("Support Tickets")
        .setDescription(
          "**Hey 👋**\n" +
            "**Open a ticket to get the Brawl Stars cheat.**"
        )
        .addFields(
          { name: "🥰", value: "*Please feel free to ask any questions you may have*", inline: true },
          { name: "☺️", value: "*We will reply as soon as possible.*", inline: true }
        )
        .setColor(0x5865f2);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_open")
          .setLabel("Open a ticket ✨")
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: "Ticket panel sent.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.commandName === "ticket-cleanup") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          content: "You must be an administrator to use this command.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!interaction.guild) {
        await interaction.reply({
          content: "This command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const days = interaction.options.getInteger("days") ?? 30;
      if (days < 1) {
        await interaction.reply({
          content: "Days must be 1 or more.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const tickets = loadTickets();
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let deletedCount = 0;
      let removedCount = 0;
      let skippedCount = 0;

      for (const [userId, raw] of Object.entries(tickets)) {
        const entry = normalizeTicketEntry(raw);
        if (!entry || !entry.channelId) {
          delete tickets[userId];
          removedCount++;
          continue;
        }

        if (!entry.createdAt || Number.isNaN(Number(entry.createdAt))) {
          skippedCount++;
          continue;
        }

        if (Number(entry.createdAt) > cutoff) continue;

        const channel =
          interaction.guild.channels.cache.get(entry.channelId) ??
          (await interaction.guild.channels
            .fetch(entry.channelId)
            .catch(() => null));
        if (channel) {
          await channel.delete(`Ticket cleanup (${days}d)`);
          deletedCount++;
        } else {
          removedCount++;
        }
        delete tickets[userId];
      }

      saveTickets(tickets);

      await interaction.reply({
        content: `Cleanup done. Deleted: ${deletedCount}, removed missing: ${removedCount}, skipped (no date): ${skippedCount}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === "deposit") {
      const data = loadBalances();
      const balance = getBalance(data, interaction.user.id);
      const newBalance = balance + 100;
      data[interaction.user.id] = newBalance;
      saveBalances(data);

      const embed = new EmbedBuilder()
        .setTitle("Balance")
        .setDescription(`Balance: **${newBalance}**`)
        .setColor(0x2ecc71);

      await interaction.update({ embeds: [embed] });
      return;
    }

    if (interaction.customId === "ticket_open") {
      if (!interaction.guild) return;

      const tickets = loadTickets();
      const existing = normalizeTicketEntry(tickets[interaction.user.id]);
      if (existing?.channelId) {
        const channel =
          interaction.guild.channels.cache.get(existing.channelId) ??
          (await interaction.guild.channels
            .fetch(existing.channelId)
            .catch(() => null));
        if (channel) {
          if (!existing.createdAt) {
            tickets[interaction.user.id] = {
              channelId: existing.channelId,
              createdAt: Date.now(),
            };
            saveTickets(tickets);
          }
          await interaction.reply({
            content: `You already have an open ticket: ${channel}.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      const staffRoleId = process.env.TICKET_STAFF_ROLE_ID ?? null;
      const categoryId = process.env.TICKET_CATEGORY_ID ?? null;
      const everyoneId = interaction.guild.roles.everyone.id;

      const overwrites = [
        { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
      ];
      if (staffRoleId) {
        overwrites.push({
          id: staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
          ],
        });
      }
      overwrites.push({
        id: interaction.guild.members.me?.id ?? client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });

      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username.toLowerCase()}`.slice(0, 90),
        type: ChannelType.GuildText,
        parent: categoryId ?? undefined,
        permissionOverwrites: overwrites,
        topic: `Ticket for ${interaction.user.tag} (${interaction.user.id})`,
      });

      tickets[interaction.user.id] = {
        channelId: ticketChannel.id,
        createdAt: Date.now(),
      };
      saveTickets(tickets);

      const embed = new EmbedBuilder()
        .setTitle("Ticket opened")
        .setDescription(
          `Hey ${interaction.user} !\n` +
          `**I'm Pierre and I'm going to help you get the cheat for Brawl Stars.**\n\n`+
          "The cheat costs `€15`. It is available for __iOS__ and __Android__." +
          `\nPayment is made via **PayPal.**\n` +
          "Please send the amount to the following address: `gertrudegast@gmail.com`, making sure to tick the **‘Friends and Family’** box to avoid PayPal fees. " +
          `\nPlease remember to include your Discord username in the payment message so that we can send you the cheat as soon as we receive payment.\n ` +
          `\nIf you have any further questions, please feel free to ask them below.\n` + 
          `Thank you and have a lovely day!`
        
        )  
        .addFields(
          { name: "User", value: `${interaction.user.tag}`, inline: true },
          { name: "ID", value: `${interaction.user.id}`, inline: true }
        )
        .setColor(0x57f287);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_claim")
          .setLabel("Claim")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("ticket_close")
          .setLabel("Close")
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({
        content: staffRoleId ? `<@&${staffRoleId}>` : null,
        embeds: [embed],
        components: [row],
      });

      await interaction.reply({
        content: `Ticket created: ${ticketChannel}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.customId === "ticket_claim") {
      if (!interaction.guild || !interaction.channel) return;
      const staffRoleId = process.env.TICKET_STAFF_ROLE_ID ?? null;
      if (
        staffRoleId &&
        !interaction.member.roles.cache.has(staffRoleId) &&
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      ) {
        await interaction.reply({
          content: "Only staff can claim a ticket.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("Ticket claimed")
        .setDescription(`${interaction.user} claimed this ticket.`)
        .setColor(0xf1c40f);
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (interaction.customId === "ticket_close") {
      if (!interaction.guild || !interaction.channel) return;
      const staffRoleId = process.env.TICKET_STAFF_ROLE_ID ?? null;
      if (
        staffRoleId &&
        !interaction.member.roles.cache.has(staffRoleId) &&
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      ) {
        await interaction.reply({
          content: "Only staff can close a ticket.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const channel = interaction.channel;
      await interaction.reply({
        content: "Ticket will be closed in 5s...",
        flags: MessageFlags.Ephemeral,
      });

      const tickets = loadTickets();
      for (const [userId, channelId] of Object.entries(tickets)) {
        const entry = normalizeTicketEntry(channelId);
        if (entry?.channelId === channel.id) {
          delete tickets[userId];
          break;
        }
      }
      saveTickets(tickets);

      setTimeout(() => {
        channel.delete("Ticket closed");
      }, 5000);
      return;
    }

    return;
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!welcomeChannel || welcomeChannel.type !== ChannelType.GuildText) return;

  let inviterTag = "Unknown inviter";
  try {
    const cachedInvites = inviteCache.get(member.guild.id) ?? new Collection();
    const newInvites = await member.guild.invites.fetch();
    inviteCache.set(
      member.guild.id,
      new Collection(newInvites.map((i) => [i.code, i]))
    );

    const usedInvite = newInvites.find((inv) => {
      const prev = cachedInvites.get(inv.code);
      return prev && inv.uses > prev.uses;
    });

    if (usedInvite?.inviter) {
      inviterTag = usedInvite.inviter.toString();
    }
  } catch (err) {
    console.warn("Failed to resolve inviter:", err);
  }

  const message =
    `Welcome ${member}!\n` +
    `Invited by: ${inviterTag}\n` +
    `Please check <#${INVITE_CHANNEL_ID}>.`;

  await welcomeChannel.send({ content: message });
});

async function deployCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId) {
    console.error("Required variables: DISCORD_TOKEN and CLIENT_ID.");
    return;
  }

  const commands = [
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Shows the list of commands.")
      .toJSON(),
    new SlashCommandBuilder()
      .setName("balance")
      .setDescription("Shows your balance and offers a deposit button.")
      .toJSON(),
    new SlashCommandBuilder()
      .setName("tiktok")
      .setDescription("Shows info about a TikTok profile.")
      .addStringOption((option) =>
        option
          .setName("user")
          .setDescription("TikTok username")
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("ticket-setup")
      .setDescription("Sends the ticket panel.")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel to send the panel (optional)")
          .setRequired(false)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("ticket-cleanup")
      .setDescription("Deletes tickets older than X days.")
      .addIntegerOption((option) =>
        option
          .setName("days")
          .setDescription("Delete tickets older than this (default: 30)")
          .setRequired(false)
      )
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log("Commands deployed to guild.");
      return;
    }

    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("Commands deployed globally.");
  } catch (err) {
    console.error("Deploy commands error:", err);
  }
}

client.login(process.env.DISCORD_TOKEN);

client.once(Events.ClientReady, async () => {
  await deployCommands();
});
