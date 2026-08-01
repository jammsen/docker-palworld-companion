import {
  ApplicationCommandOptionType,
  PermissionFlagsBits,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";

const MANAGE_GUILD = PermissionFlagsBits.ManageGuild.toString();

const userIdOption = {
  type: ApplicationCommandOptionType.String,
  name: "user_id",
  description: "Palworld user id (e.g. steam_12345...) - shown by /players",
  required: true,
} as const;

const reasonOption = {
  type: ApplicationCommandOptionType.String,
  name: "reason",
  description: "Message shown to the player",
  required: false,
} as const;

// Plain JSON command bodies (no builders): registered per guild as a bulk
// overwrite on every startup, which is idempotent. Moderation commands default
// to Manage Server; admins can re-scope per command in
// Server Settings -> Integrations.
export const COMMAND_DEFINITIONS: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  { name: "status", description: "Show the live server status card", dm_permission: false },
  { name: "players", description: "List the players currently online", dm_permission: false },
  {
    name: "kick",
    description: "Kick a player from the server",
    dm_permission: false,
    default_member_permissions: MANAGE_GUILD,
    options: [userIdOption, reasonOption],
  },
  {
    name: "ban",
    description: "Ban a player from the server",
    dm_permission: false,
    default_member_permissions: MANAGE_GUILD,
    options: [userIdOption, reasonOption],
  },
  {
    name: "unban",
    description: "Unban a player",
    dm_permission: false,
    default_member_permissions: MANAGE_GUILD,
    options: [userIdOption],
  },
  {
    name: "restart",
    description: "Save the world and restart the gameserver",
    dm_permission: false,
    default_member_permissions: MANAGE_GUILD,
  },
  {
    name: "setup-icons",
    description: "Upload a shipped icon set as this bot's emojis and use it for the card and event logs",
    dm_permission: false,
    default_member_permissions: MANAGE_GUILD,
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: "style",
        description: "Icon set name (start typing to search, e.g. modern-slate or pal-sphere-ultra)",
        required: true,
        autocomplete: true,
      },
    ],
  },
];
