import inquirer from "inquirer";
import { getCurrentWeek, getLastWeek } from "../utils/dates.js";
import { loadConfig, saveConfig } from "../utils/config.js";
import { ERRORS } from "../constants.js";

export async function promptForDateRange() {
  const { dateOption } = await inquirer.prompt([
    {
      type: "list",
      name: "dateOption",
      message: "Select time period:",
      choices: [
        { name: "Current week (Monday to today)", value: "current" },
        { name: "Last week (Monday-Sunday)", value: "last" },
        { name: "Custom date range", value: "custom" },
      ],
    },
  ]);

  if (dateOption === "current") {
    return getCurrentWeek();
  } else if (dateOption === "last") {
    return getLastWeek();
  } else {
    const { startDate, endDate } = await inquirer.prompt([
      {
        type: "input",
        name: "startDate",
        message: "Start date (YYYY-MM-DD):",
        validate: (input) =>
          /^\d{4}-\d{2}-\d{2}$/.test(input) || ERRORS.INVALID_DATE_FORMAT,
      },
      {
        type: "input",
        name: "endDate",
        message: "End date (YYYY-MM-DD):",
        validate: (input) =>
          /^\d{4}-\d{2}-\d{2}$/.test(input) || ERRORS.INVALID_DATE_FORMAT,
      },
    ]);
    return { startDate, endDate };
  }
}

export async function promptForSources() {
  const { sources } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "sources",
      message: "Select data sources:",
      choices: [
        { name: "GitHub commits", value: "github", checked: true },
        { name: "Slack huddles", value: "slack", checked: true },
        { name: "Calendar events", value: "calendar", checked: true },
      ],
      validate: (input) => input.length > 0 || "Select at least one source",
    },
  ]);
  return sources;
}

export async function promptForGitHubOrg() {
  const { org } = await inquirer.prompt([
    {
      type: "input",
      name: "org",
      message: "GitHub organization:",
      validate: (input) =>
        input.trim().length > 0 || "Organization name required",
    },
  ]);

  // Save to config
  const config = await loadConfig();
  config.githubOrg = org;
  await saveConfig(config);

  return org;
}

export async function promptForConfig() {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "slackUserId",
      message: "Slack User ID (e.g., U03H3A69E2D):",
      default: process.env.SLACK_USER_ID,
    },
    {
      type: "input",
      name: "githubOrg",
      message: "GitHub Organization:",
      default: "vatfree",
    },
    {
      type: "input",
      name: "slackHuddlesPath",
      message: "Slack huddles file path:",
      default: "~/Downloads",
    },
    {
      type: "input",
      name: "nylasApiKey",
      message: "Nylas API Key (optional, press Enter to skip):",
      default: process.env.NYLAS_API_KEY,
    },
    {
      type: "input",
      name: "nylasGrantId",
      message: "Nylas Grant ID (optional, press Enter to skip):",
      default: process.env.NYLAS_GRANT_ID,
    },
  ]);

  await saveConfig(answers);
  return answers;
}
