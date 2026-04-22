import fs from "fs/promises";
import path from "path";
import os from "os";
import { DEFAULTS, ENV_VARS } from "../constants.js";

const CONFIG_PATH = path.join(os.homedir(), DEFAULTS.CONFIG_FILE);

export async function loadConfig() {
  const config = {};

  // Load from config file if exists
  try {
    const fileContent = await fs.readFile(CONFIG_PATH, "utf-8");
    const fileConfig = JSON.parse(fileContent);
    Object.assign(config, fileConfig);
  } catch (error) {
    // Config file doesn't exist or invalid, continue
  }

  // Override with env vars if set (higher priority)
  if (process.env[ENV_VARS.SLACK_USER_ID]) {
    config.slackUserId = process.env[ENV_VARS.SLACK_USER_ID];
  }
  if (process.env[ENV_VARS.SLACK_HUDDLES_PATH]) {
    config.slackHuddlesPath = process.env[ENV_VARS.SLACK_HUDDLES_PATH];
  }
  if (process.env[ENV_VARS.GITHUB_ORG]) {
    config.githubOrg = process.env[ENV_VARS.GITHUB_ORG];
  }
  if (process.env[ENV_VARS.NYLAS_API_KEY]) {
    config.nylasApiKey = process.env[ENV_VARS.NYLAS_API_KEY];
  }
  if (process.env[ENV_VARS.NYLAS_GRANT_ID]) {
    config.nylasGrantId = process.env[ENV_VARS.NYLAS_GRANT_ID];
  }

  // Apply defaults for missing values
  if (!config.slackHuddlesPath) {
    config.slackHuddlesPath = DEFAULTS.SLACK_HUDDLES_PATH;
  }
  if (!config.githubOrg) {
    config.githubOrg = DEFAULTS.GITHUB_ORG;
  }

  return config;
}

export async function saveConfig(config) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export async function setConfigValue(key, value) {
  const config = await loadConfig();
  config[key] = value;
  await saveConfig(config);
}

export async function getConfigValue(key) {
  const config = await loadConfig();
  return config[key];
}

export async function listConfig() {
  const config = await loadConfig();
  return config;
}

export async function configExists() {
  try {
    await fs.access(CONFIG_PATH);
    return true;
  } catch {
    return false;
  }
}
