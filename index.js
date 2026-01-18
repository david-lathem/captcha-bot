require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
} = require("discord.js");

const svgCaptcha = require("svg-captcha"); // ✅ alternate captcha
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const PREFIX = "!";
const captchaAnswers = new Map(); // store captcha text temporarily

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// --- PREFIX COMMAND ---
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.content !== `${PREFIX}sendVerify`) return;

    if (!message.member.permissions.has("Administrator"))
      return await message.reply("❌ You don’t have permission to use this.");

    const embed = new EmbedBuilder()
      .setTitle("✅ Verify Yourself")
      .setDescription(
        `Welcome to **${message.guild.name}**!\n\nClick the button below to prove you are human.`,
      )
      .addFields({
        name: "🛡️ Why Verification?",
        value: "Helps keep bots & raiders out.",
      })
      .setColor("Green");

    const button = new ButtonBuilder()
      .setCustomId("start_verify")
      .setLabel("Verify")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔑");

    const row = new ActionRowBuilder().addComponents(button);

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete();
  } catch (error) {
    console.log(error);
  }
});

// --- BUTTON HANDLER ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId === "start_verify") {
    // --- Generate captcha using svg-captcha ---

    const captcha = svgCaptcha.create({
      size: 5, // 5 characters
      ignoreChars: "0O1Il", // avoid confusing letters/numbers
      noise: 1, // just a little noise
      color: true, // colorful text
      background: "#f0f0f0", // light gray background
      width: 200, // wider
      height: 80, // taller
      fontSize: 60, // bigger font
    });

    // Convert SVG to PNG buffer
    const svg2img = require("svg2img");
    const buffer = await new Promise((resolve, reject) => {
      svg2img(captcha.data, { width: 200, height: 80 }, (error, buffer) => {
        if (error) reject(error);
        else resolve(buffer);
      });
    });

    console.log(captcha.text);
    captchaAnswers.set(interaction.user.id, captcha.text);

    const captchaEmbed = new EmbedBuilder()
      .setTitle("🧩 CAPTCHA Challenge")
      .setDescription("Enter the text shown in the image.")
      .setColor("Yellow")
      .setImage("attachment://captcha.png");

    const submitButton = new ButtonBuilder()
      .setCustomId("captcha_submit")
      .setLabel("Submit")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(submitButton);

    await interaction.reply({
      embeds: [captchaEmbed],
      files: [{ attachment: buffer, name: "captcha.png" }],
      components: [row],
      ephemeral: true,
    });
  }

  if (interaction.isButton() && interaction.customId === "captcha_submit") {
    const modal = new ModalBuilder()
      .setCustomId("captcha_modal")
      .setTitle("🔒 CAPTCHA Verification");

    const input = new TextInputBuilder()
      .setCustomId("captcha_input")
      .setLabel("Enter the CAPTCHA text")
      .setStyle(TextInputStyle.Short);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  // --- MODAL HANDLER ---
  if (interaction.isModalSubmit() && interaction.customId === "captcha_modal") {
    const userInput = interaction.fields.getTextInputValue("captcha_input");
    const logChannel = interaction.guild.channels.cache.get(
      process.env.LOG_CHANNEL_ID,
    );

    try {
      const correctAnswer = captchaAnswers.get(interaction.user.id);

      if (userInput !== correctAnswer) {
        await interaction.update({
          content: "❌ Incorrect CAPTCHA. Please try again.",
          embeds: [],
          components: [],
          files: [],
          ephemeral: true,
        });

        if (logChannel) {
          const failEmbed = new EmbedBuilder()
            .setTitle("❌ Verification Failed")
            .setDescription(`<@${interaction.user.id}> failed the CAPTCHA.`)
            .setColor("Red")
            .setTimestamp();

          await logChannel.send({ embeds: [failEmbed] });
        }
        return;
      }

      // ✅ Passed verification
      const { member } = interaction;

      const unverifiedRoleId = process.env.UNVERIFIED_ROLE_ID;
      const verifiedRoleId = process.env.VERIFIED_ROLE_ID;

      if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
        await member.roles.remove(unverifiedRoleId);
      }

      if (verifiedRoleId && !member.roles.cache.has(verifiedRoleId)) {
        await member.roles.add(verifiedRoleId);
      }

      await interaction.update({
        content: "🎉 You have been **verified** successfully!",
        embeds: [],
        components: [],
        files: [],
        ephemeral: true,
      });

      if (logChannel) {
        const successEmbed = new EmbedBuilder()
          .setTitle("✅ User Verified")
          .setDescription(
            `<@${interaction.user.id}> has been verified successfully.`,
          )
          .setColor("Green")
          .setTimestamp();

        await logChannel.send({ embeds: [successEmbed] });
      }
    } catch (error) {
      console.log(error);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
