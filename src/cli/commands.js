import fs from "fs/promises";
import ora from "ora";
import chalk from "chalk";
import { loadConfig, saveConfig, configExists } from "../utils/config.js";
import { setVerbose, success, error, info, warn } from "../utils/logger.js";
import { shouldPrompt } from "../utils/tty.js";
import {
  promptForDateRange,
  promptForSources,
  promptForGitHubOrg,
  promptForConfig,
} from "./prompts.js";
import { resolveDateRange } from "./flags.js";
import { fetchGitHubData } from "../sources/github.js";
import { loadSlackHuddles, shouldUseSlackBackup } from "../sources/slack.js";
import { fetchCalendarEvents } from "../sources/calendar.js";
import { formatTimeReport } from "../formatters/yaml.js";
import { getCurrentWeek } from "../utils/dates.js";
import { ERRORS } from "../constants.js";

export async function generateCommand(options) {
  // Handle --default flag (sets current-week and all sources)
  if (options.default) {
    options.currentWeek = true;
    options.all = true;
  }

  // Set verbose mode
  if (options.verbose) {
    setVerbose(true);
  }

  // Load config
  let config = await loadConfig();

  // Check for first-run config (skip if --default flag)
  if (!(await configExists()) && shouldPrompt() && !options.default) {
    info("No configuration found. Let's set up timr!");
    await promptForConfig();
    config = await loadConfig(); // Reload
  }

  // Determine date range
  let dateRange;
  if (options.currentWeek || options.lastWeek || (options.from && options.to)) {
    dateRange = resolveDateRange(options);
  } else {
    if (shouldPrompt() && !options.default) {
      dateRange = await promptForDateRange();
    } else {
      // Non-interactive or --default flag, use current week default
      dateRange = getCurrentWeek();
    }
  }

  info(`Generating report: ${dateRange.startDate} to ${dateRange.endDate}`);

  // Determine sources
  let sources;
  if (options.github || options.slack || options.calendar) {
    sources = [];
    if (options.github) sources.push("github");
    if (options.slack) sources.push("slack");
    if (options.calendar) sources.push("calendar");
  } else if (options.all) {
    sources = ["github", "slack", "calendar"];
  } else {
    if (shouldPrompt() && !options.default) {
      sources = await promptForSources();
    } else {
      // Non-interactive or --default flag, use all sources
      sources = ["github", "slack", "calendar"];
    }
  }

  // Check GitHub org (skip prompt if --default flag)
  if (
    sources.includes("github") &&
    !config.githubOrg &&
    shouldPrompt() &&
    !options.default
  ) {
    config.githubOrg = await promptForGitHubOrg();
  }

  // Check Slack backup BEFORE starting any spinners
  let useSlackBackup = false;
  if (sources.includes("slack")) {
    if (!config.slackUserId) {
      error(ERRORS.NO_SLACK_USER_ID);
    } else {
      const backupCheck = await shouldUseSlackBackup(config.slackHuddlesPath);
      if (!backupCheck.hasFiles) {
        warn(`No slack_huddles.json file found in ${config.slackHuddlesPath}`);
      } else {
        useSlackBackup = backupCheck.useBackup;
      }
    }
  }

  // Fetch data from each source
  const allTasks = [];

  if (sources.includes("github")) {
    const spinner = ora("Fetching GitHub commits...").start();
    try {
      const tasks = await fetchGitHubData(
        dateRange.startDate,
        dateRange.endDate,
        config.githubOrg,
      );
      allTasks.push(...tasks);
      spinner.succeed(`Found ${tasks.length} GitHub tasks`);
    } catch (err) {
      spinner.fail(`GitHub fetch failed: ${err.message}`);
      if (options.verbose) {
        console.error(err);
      }
    }
  }

  if (sources.includes("slack")) {
    const spinner = ora("Loading Slack huddles...").start();
    try {
      if (!config.slackUserId) {
        throw new Error(ERRORS.NO_SLACK_USER_ID);
      }

      const tasks = await loadSlackHuddles(
        config.slackUserId,
        dateRange.startDate,
        dateRange.endDate,
        config.slackHuddlesPath,
        useSlackBackup,
      );
      allTasks.push(...tasks);
      spinner.succeed(`Found ${tasks.length} Slack huddles`);
    } catch (err) {
      spinner.fail(`Slack load failed: ${err.message}`);
      if (options.verbose) {
        console.error(err);
      }
    }
  }

  if (sources.includes("calendar")) {
    const spinner = ora("Fetching calendar events...").start();
    try {
      const tasks = await fetchCalendarEvents(
        dateRange.startDate,
        dateRange.endDate,
        config,
      );
      allTasks.push(...tasks);
      spinner.succeed(`Found ${tasks.length} calendar events`);
    } catch (err) {
      spinner.fail(`Calendar fetch failed: ${err.message}`);
      if (options.verbose) {
        console.error(err);
      }
    }
  }

  if (allTasks.length === 0) {
    warn("No tasks found for the specified period.");
    return;
  }

  // Format and output
  const report = formatTimeReport(allTasks);

  if (options.output) {
    await fs.writeFile(options.output, report, "utf-8");
    success(`Report saved to ${options.output}`);
  } else {
    console.log("\n" + report);
  }
}

export async function configCommand(options) {
  if (options.init) {
    await promptForConfig();
    success("Configuration saved");
    return;
  }

  if (options.set) {
    const [key, value] = options.set.split("=");
    if (!key || !value) {
      error("Invalid format. Use: --set key=value");
      return;
    }

    const config = await loadConfig();
    config[key] = value;
    await saveConfig(config);
    success(`Set ${key} = ${value}`);
    return;
  }

  if (options.get) {
    const config = await loadConfig();
    const value = config[options.get];
    if (value === undefined) {
      warn(`No value for key: ${options.get}`);
    } else {
      console.log(value);
    }
    return;
  }

  if (options.list) {
    const config = await loadConfig();
    console.log(chalk.bold("Current configuration:"));
    for (const [key, value] of Object.entries(config)) {
      console.log(`  ${chalk.cyan(key)}: ${value}`);
    }
    return;
  }

  // Default: show help
  error("No option specified. Use --init, --set, --get, or --list");
}
