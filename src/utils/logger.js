import chalk from "chalk";

let verboseMode = false;

export function setVerbose(enabled) {
  verboseMode = enabled;
}

export function log(message) {
  console.log(message);
}

export function info(message) {
  console.log(chalk.blue("ℹ"), message);
}

export function success(message) {
  console.log(chalk.green("✓"), message);
}

export function warn(message) {
  console.log(chalk.yellow("⚠"), message);
}

export function error(message) {
  console.error(chalk.red("✗"), message);
}

export function verbose(message) {
  if (verboseMode) {
    console.log(chalk.gray("→"), message);
  }
}

export function debug(label, data) {
  if (verboseMode) {
    console.log(chalk.gray(`[DEBUG ${label}]`), data);
  }
}
