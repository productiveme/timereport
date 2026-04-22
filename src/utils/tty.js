export function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function shouldPrompt() {
  // Don't prompt if output is piped or redirected
  return isInteractive();
}
