export const DEFAULTS = {
  GITHUB_ORG: "vatfree",
  SLACK_HUDDLES_PATH: "~/Downloads",
  COMMIT_DURATION_MINUTES: 30,
  DATE_FORMAT: "dd MMM yyyy, HH:mm",
  CONFIG_FILE: ".timrrc",
};

export const CONFIG_KEYS = {
  SLACK_USER_ID: "slackUserId",
  SLACK_HUDDLES_PATH: "slackHuddlesPath",
  GITHUB_ORG: "githubOrg",
  NYLAS_API_KEY: "nylasApiKey",
  NYLAS_GRANT_ID: "nylasGrantId",
  DEFAULT_SOURCES: "defaultSources",
};

export const ENV_VARS = {
  SLACK_USER_ID: "SLACK_USER_ID",
  SLACK_HUDDLES_PATH: "SLACK_HUDDLES_PATH",
  GITHUB_ORG: "GITHUB_ORG",
  NYLAS_API_KEY: "NYLAS_API_KEY",
  NYLAS_GRANT_ID: "NYLAS_GRANT_ID",
};

export const ERRORS = {
  NO_GIT_EMAIL: "Could not get git user email. Run: git config user.email",
  NO_SLACK_USER_ID:
    "SLACK_USER_ID not configured. Run: timr config --set slackUserId=YOUR_ID",
  NO_GITHUB_ORG:
    "GitHub organization not configured. Run: timr config --set githubOrg=ORG_NAME",
  NO_SLACK_FILE: "No slack_huddles.json file found",
  NO_NYLAS_CREDS: "Nylas credentials not set. Calendar integration disabled.",
  INVALID_DATE_FORMAT: "Invalid date format. Use YYYY-MM-DD",
};
