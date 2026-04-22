#!/usr/bin/env node
import { program } from "commander";
import { generateCommand, configCommand } from "../src/cli/commands.js";

program
  .name("timr")
  .description("Generate time reports from GitHub, Slack, and Calendar")
  .version("1.0.0");

program
  .command("generate")
  .description("Generate time report")
  .option("--default", "Use defaults (current week, all sources, no prompts)")
  .option("--current-week", "Use current week (Monday to today)")
  .option("--last-week", "Use last week (Monday-Sunday)")
  .option("--from <date>", "Start date (YYYY-MM-DD)")
  .option("--to <date>", "End date (YYYY-MM-DD)")
  .option("--github", "Include GitHub commits")
  .option("--slack", "Include Slack huddles")
  .option("--calendar", "Include calendar events")
  .option("--all", "Include all sources (default if none specified)")
  .option("--use-backup", "Use slack_huddles.json.bak if main file not found")
  .option("-o, --output <file>", "Output file path")
  .option("-v, --verbose", "Show detailed logs")
  .action(generateCommand);

program
  .command("config")
  .description("Manage configuration")
  .option("--set <key=value>", "Set config value")
  .option("--get <key>", "Get config value")
  .option("--list", "List all config values")
  .option("--init", "Initialize config with wizard")
  .action(configCommand);

program.parse();
