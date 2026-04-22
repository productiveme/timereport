import fs from "fs/promises";
import path from "path";
import os from "os";
import { verbose, warn } from "../utils/logger.js";
import { parseDate } from "../utils/dates.js";
import { isInteractive } from "../utils/tty.js";
import inquirer from "inquirer";

/**
 * Check if backup file should be used, prompting user if needed
 * This should be called BEFORE starting any spinners to avoid inquirer/ora conflicts
 */
export async function shouldUseSlackBackup(huddlesPath) {
  const expandedPath = huddlesPath.replace(/^~/, os.homedir());
  const huddlesFile = path.join(expandedPath, "slack_huddles.json");
  const backupFile = path.join(expandedPath, "slack_huddles.json.bak");

  // Check if main file exists
  try {
    await fs.access(huddlesFile);
    return { useBackup: false, hasFiles: true };
  } catch {
    // Main file doesn't exist, check for backup
    try {
      await fs.access(backupFile);

      // Backup exists, ask user if interactive
      if (isInteractive()) {
        const { useIt } = await inquirer.prompt([
          {
            type: "confirm",
            name: "useIt",
            message: `slack_huddles.json not found, but backup exists. Use backup?`,
            default: true,
          },
        ]);
        return { useBackup: useIt, hasFiles: true };
      } else {
        // Non-interactive, auto-use backup
        return { useBackup: true, hasFiles: true };
      }
    } catch {
      // No files at all
      return { useBackup: false, hasFiles: false };
    }
  }
}

export async function loadSlackHuddles(
  userId,
  startDate,
  endDate,
  huddlesPath,
  useBackup = false,
) {
  const expandedPath = huddlesPath.replace(/^~/, os.homedir());
  const huddlesFile = path.join(expandedPath, "slack_huddles.json");
  const backupFile = path.join(expandedPath, "slack_huddles.json.bak");

  let fileToLoad = null;

  // Check if main file exists
  try {
    await fs.access(huddlesFile);
    fileToLoad = huddlesFile;

    // Create backup
    try {
      await fs.access(backupFile);
      await fs.unlink(backupFile);
      verbose("Removed old backup");
    } catch {
      // Backup doesn't exist, ok
    }

    await fs.copyFile(huddlesFile, backupFile);
    verbose("Created backup");
  } catch {
    // Main file doesn't exist, use backup if allowed
    if (useBackup) {
      try {
        await fs.access(backupFile);
        fileToLoad = backupFile;
        verbose("Using backup file");
      } catch {
        throw new Error(`No slack_huddles.json file found in ${expandedPath}`);
      }
    } else {
      throw new Error(`No slack_huddles.json file found in ${expandedPath}`);
    }
  }

  if (!fileToLoad) {
    throw new Error("No huddles file available");
  }

  // Load and parse
  const content = await fs.readFile(fileToLoad, "utf-8");
  const data = JSON.parse(content);
  const huddles = data.huddles || [];

  verbose(`Loaded ${huddles.length} huddles from ${fileToLoad}`);

  // Filter by user and date
  const filtered = filterHuddles(huddles, userId, startDate, endDate);

  verbose(`Filtered to ${filtered.length} huddles for user ${userId}`);

  // Convert to task format
  const tasks = filtered.map((huddle) => ({
    name: "Slack huddle #meetings",
    sessions: [
      {
        start: huddle.date_start,
        end: huddle.date_end,
      },
    ],
    sort_timestamp: huddle.date_start,
  }));

  // Delete main file after processing
  if (fileToLoad === huddlesFile) {
    try {
      await fs.unlink(huddlesFile);
      verbose("Deleted slack_huddles.json");
    } catch (err) {
      warn(`Could not delete ${huddlesFile}: ${err.message}`);
    }
  }

  return tasks;
}

function filterHuddles(huddles, userId, startDate, endDate) {
  const startDt = parseDate(startDate);
  const endDt = parseDate(endDate);
  endDt.setHours(23, 59, 59, 999);

  return huddles.filter((huddle) => {
    // Check user participated
    const participants = huddle.participant_history || [];
    if (!participants.includes(userId)) return false;

    // Check date range
    const huddleStart = new Date(huddle.date_start * 1000);
    const huddleEnd = new Date(huddle.date_end * 1000);

    // Include if overlaps with date range
    return !(huddleEnd < startDt || huddleStart > endDt);
  });
}
