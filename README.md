# Time Report Generator (`timr`)

Generate time entry reports from your GitHub commits, Slack huddles, and calendar events.

## Overview

`timr` is a command-line tool that aggregates your work activities from multiple sources and generates formatted time reports. Perfect for tracking billable hours, preparing timesheets, or reviewing your work week.

## Features

- **Default Mode**: Fastest workflow with `--default` flag (current week, all sources, no prompts)
- **GitHub Integration**: Automatically fetch commits from PRs, group by task, merge overlapping work sessions
- **Slack Huddles**: Import huddle participation data from Slack
- **Calendar Events**: Sync busy time from Google Calendar, Outlook, or Exchange (via Nylas API)
- **Smart Session Merging**: Multiple commits close together become one continuous work session
- **Eng Tag Extraction**: Automatically extracts project tags (e.g., `#eng707`) from PR titles
- **Interactive CLI**: User-friendly prompts for date ranges and data sources
- **Flexible Configuration**: Persistent config file or environment variables
- **YAML Output**: Clean, readable time entry format

## Installation

### Requirements

- Node.js >= 18.0.0
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- Access to your GitHub organization
- (Optional) Slack bookmarklet for huddles data
- (Optional) Nylas API credentials for calendar integration

### Install

```bash
cd timereport
npm install
npm link
```

The `timr` command is now available globally.

## Quick Start

### Fastest Way (Default Mode)

```bash
# Use defaults: current week, all sources, no prompts
timr generate --default
```

This uses your existing configuration and generates a report for the current week with all data sources.

### Interactive Mode

```bash
timr generate
```

You'll be prompted to:

1. Select a date range (current week, last week, or custom)
2. Choose data sources (GitHub, Slack, Calendar)

### Quick Commands

```bash
# Default mode (fastest)
timr generate --default

# Current week, all sources
timr generate --current-week --all

# Last week, GitHub and Slack only
timr generate --last-week --github --slack

# Custom date range
timr generate --from 2026-04-01 --to 2026-04-07 --all

# Save to file
timr generate --current-week --all -o timereport.txt

# Verbose output (for debugging)
timr generate --current-week --all -v
```

## Configuration

### First-Time Setup

Run the interactive setup wizard:

```bash
timr config --init
```

You'll be asked for:

- **Slack User ID**: Find it in Slack (Profile → More → Copy member ID)
- **GitHub Organization**: Your company's GitHub org name
- **Slack Huddles Path**: Where `slack_huddles.json` is saved (default: `~/Downloads`)
- **Nylas API Key** (optional): For calendar integration
- **Nylas Grant ID** (optional): For calendar integration

### Manual Configuration

```bash
# Set individual values
timr config --set slackUserId=U03H3A69E2D
timr config --set githubOrg=mycompany
timr config --set slackHuddlesPath=~/Documents

# View configuration
timr config --list

# Get specific value
timr config --get githubOrg
```

### Configuration File

Config is stored in `~/.timrrc` (JSON format):

```json
{
  "slackUserId": "U03H3A69E2D",
  "githubOrg": "vatfree",
  "slackHuddlesPath": "~/Downloads",
  "nylasApiKey": "nyk_v0_...",
  "nylasGrantId": "b8c34627-..."
}
```

### Environment Variables

Environment variables override config file values:

```bash
export SLACK_USER_ID='U03H3A69E2D'
export SLACK_HUDDLES_PATH='~/Downloads'
export GITHUB_ORG='mycompany'
export NYLAS_API_KEY='nyk_v0_...'
export NYLAS_GRANT_ID='b8c34627-...'
```

## Data Sources

### GitHub Commits

**How it works:**

- Fetches all merged PRs in your organization for the date range
- Finds commits by your git email address
- Groups commits by PR and extracts eng tags from PR titles
- Each commit = 30-minute work session (merged if overlapping)
- Works across all branches (not just `main`)
- Handles squash-merged PRs correctly

**Requirements:**

- GitHub CLI (`gh`) authenticated: `gh auth login`
- Access to your organization's repositories

**Example output:**

```yaml
- taskName: "Fix receipt processing bug #eng707"
  focus:
    - 21 Apr 2026, 09:15, 30 min
    - 21 Apr 2026, 10:30, 45 min
```

### Slack Huddles

**How it works:**

- Loads huddle data from `slack_huddles.json` file
- Filters by your Slack user ID
- Uses actual huddle start/end times
- Creates backup file automatically
- Deletes main file after processing

**Setup:**

1. Open Slack in your browser
2. Run the bookmarklet to download huddles data (see `bookmarklet.js`)
3. Save as `slack_huddles.json` in your Downloads folder
4. Run `timr generate --slack`

**Backup handling:**

- If main file exists: creates `.bak` backup, uses main file
- If main file missing but `.bak` exists: prompts to use backup
- Use `--use-backup` flag to auto-use backup without prompting

**Example output:**

```yaml
- taskName: "Slack huddle #meetings"
  focus:
    - 21 Apr 2026, 14:00, 60 min
```

### Calendar Events (via Nylas)

**How it works:**

- Fetches events from Nylas API (unified calendar API)
- Supports Google Calendar, Outlook, Exchange, and more
- Only includes "busy" events (excludes free time)
- Excludes cancelled events
- Uses actual event titles

**Setup:**

1. Sign up at [Nylas Dashboard](https://dashboard.nylas.com) (free for up to 5 accounts)
2. Create a new application
3. Connect your Google Calendar or other calendar provider
4. Get your API key from Settings
5. Get your grant ID after connecting a calendar
6. Configure in `timr`:
   ```bash
   timr config --set nylasApiKey=nyk_v0_...
   timr config --set nylasGrantId=b8c34627-...
   ```

**Example output:**

```yaml
- taskName: "Team Standup #meetings"
  focus:
    - 21 Apr 2026, 11:00, 30 min
```

## Output Format

The generated report uses a YAML-like format:

```yaml
# Time Entry Submission
# Review and confirm the sessions below:
# Save and close this file to submit, or delete all content to cancel

tasks:
  - taskName: "Implement user authentication #eng456"
    focus:
      - 21 Apr 2026, 08:30, 60 min
      - 21 Apr 2026, 14:15, 45 min
  - taskName: "Slack huddle #meetings"
    focus:
      - 21 Apr 2026, 10:00, 30 min
  - taskName: "Team Standup #meetings"
    focus:
      - 21 Apr 2026, 11:00, 15 min
  - taskName: "Fix CSS layout bug #eng789"
    focus:
      - 21 Apr 2026, 15:00, 90 min
```

## Command Reference

### `timr generate [options]`

Generate a time report.

**Options:**

- `--default` - Use defaults (current week, all sources, no prompts)
- `--current-week` - Use current week (Monday to today)
- `--last-week` - Use last week (Monday-Sunday)
- `--from <date>` - Start date (YYYY-MM-DD)
- `--to <date>` - End date (YYYY-MM-DD)
- `--github` - Include GitHub commits
- `--slack` - Include Slack huddles
- `--calendar` - Include calendar events
- `--all` - Include all sources (default if none specified)
- `--use-backup` - Use `slack_huddles.json.bak` if main file not found
- `-o, --output <file>` - Save report to file instead of stdout
- `-v, --verbose` - Show detailed logs

**Examples:**

```bash
# Default mode (fastest - current week, all sources, no prompts)
timr generate --default

# Interactive mode
timr generate

# Current week, all sources
timr generate --current-week --all

# Last week, GitHub and Slack
timr generate --last-week --github --slack

# Custom date range, save to file
timr generate --from 2026-04-14 --to 2026-04-20 --all -o report.txt

# Verbose mode for debugging
timr generate --current-week --all -v
```

### `timr config [options]`

Manage configuration.

**Options:**

- `--init` - Run interactive setup wizard
- `--set <key=value>` - Set a config value
- `--get <key>` - Get a config value
- `--list` - List all config values

**Examples:**

```bash
# Interactive setup
timr config --init

# Set values
timr config --set slackUserId=U03H3A69E2D
timr config --set githubOrg=mycompany

# View config
timr config --list

# Get specific value
timr config --get slackUserId
```

## How It Works

### GitHub Pipeline

1. Fetches all repositories in your organization
2. Gets all merged PRs in the date range
3. For each PR, finds commits by your git email
4. Works across all branches (not just default branch)
5. Handles squash-merged PRs by examining original commits
6. Extracts eng tags from PR titles (e.g., `eng707` → `#eng707`)
7. Each commit = 30-minute session ending at commit time
8. Merges overlapping sessions automatically

### Slack Pipeline

1. Loads huddles from `slack_huddles.json` file
2. Filters by your Slack user ID
3. Filters by date range
4. Labels all huddles as "Slack huddle #meetings"
5. Preserves actual huddle duration
6. Creates backup and deletes main file after processing

### Calendar Pipeline

1. Fetches events from Nylas API using your credentials
2. Filters by date range and busy status
3. Excludes cancelled events
4. Uses actual meeting titles with `#meetings` hashtag
5. Preserves actual event duration

### Session Merging

- Multiple commits within overlapping 30-minute windows merge into longer sessions
- Example: Commits at 09:15 and 09:30 → single 45-minute session (08:45-09:30)
- Applied per task (doesn't merge across different PRs)

### Eng Tag Extraction

- Detects eng tags in various formats: `eng707`, `eng-707`, `ENG 707`, `eng#707`, `[eng789]`
- Removes eng tag from PR title
- Adds as hashtag at end: `#eng707`
- Example: "Fix receipt issue eng-707" → "Fix receipt issue #eng707"

## Troubleshooting

### "SLACK_USER_ID not configured"

Set your Slack user ID:

```bash
timr config --set slackUserId=U03H3A69E2D
```

To find your ID in Slack: Profile → More → Copy member ID

### "No slack_huddles.json file found"

1. Make sure you ran the bookmarklet in Slack
2. Check the file is saved as `slack_huddles.json` (not `slack_huddles (1).json`)
3. Verify it's in `~/Downloads` or update the path:
   ```bash
   timr config --set slackHuddlesPath=~/Documents
   ```

### "Nylas credentials not configured"

This is informational - calendar integration is optional. To enable:

1. Sign up at https://dashboard.nylas.com
2. Connect your calendar and get credentials
3. Configure:
   ```bash
   timr config --set nylasApiKey=nyk_v0_...
   timr config --set nylasGrantId=b8c34627-...
   ```

### "Could not get git user email"

Configure your git email:

```bash
git config --global user.email "you@example.com"
```

### GitHub CLI not authenticated

Authenticate with GitHub:

```bash
gh auth login
```

### Empty Output

- Check you have commits/huddles/events in the specified date range
- Verify `gh` is authenticated: `gh auth status`
- Run with `-v` flag to see detailed logs
- Check stderr for error messages

## Advanced Usage

### Programmatic Use

You can import and use `timr` functions in your own Node.js code:

```javascript
import {
  fetchGitHubData,
  loadSlackHuddles,
  fetchCalendarEvents,
  formatTimeReport,
} from "timereport";

// Fetch data
const githubTasks = await fetchGitHubData("2026-04-14", "2026-04-20", "myorg");
const slackTasks = await loadSlackHuddles(
  "U03H3A69E2D",
  "2026-04-14",
  "2026-04-20",
  "~/Downloads",
);

// Combine and format
const allTasks = [...githubTasks, ...slackTasks];
const report = formatTimeReport(allTasks);
console.log(report);
```

### Custom Data Sources

The internal JSON format is extensible. Create your own data source:

```javascript
const customTasks = [
  {
    name: "Custom task #tag",
    sessions: [
      { start: 1713700000, end: 1713701800 }, // Unix timestamps
    ],
    sort_timestamp: 1713700000,
  },
];
```

### Piping and Scripting

Use in scripts with pipes:

```bash
# Generate and email report
timr generate --last-week --all | mail -s "Weekly Report" manager@example.com

# Save with timestamp
timr generate --last-week --all > "report-$(date +%Y-%m-%d).txt"
```

## Project Structure

```
timereport/
├── bin/
│   └── timr.js                  # CLI entry point
├── src/
│   ├── index.js                 # Programmatic API exports
│   ├── cli/
│   │   ├── commands.js          # Command handlers
│   │   ├── prompts.js           # Interactive prompts
│   │   └── flags.js             # CLI flag parsing
│   ├── sources/
│   │   ├── github.js            # GitHub data fetcher
│   │   ├── slack.js             # Slack huddles loader
│   │   └── calendar.js          # Nylas calendar fetcher
│   ├── formatters/
│   │   └── yaml.js              # YAML-like formatter
│   ├── utils/
│   │   ├── dates.js             # Date utilities
│   │   ├── sessions.js          # Session merging
│   │   ├── config.js            # Config management
│   │   ├── github-helpers.js    # Eng tag extraction
│   │   ├── logger.js            # Logging utilities
│   │   └── tty.js               # TTY detection
│   └── constants.js             # Constants and defaults
├── python-scripts/              # Archived Python scripts
├── package.json
├── bookmarklet.js               # Slack huddles bookmarklet
└── README.md
```

## Development

### Setup

```bash
git clone <repo>
cd timereport
npm install
npm link
```

### Code Style

- ES Modules with `import/export`
- Async/await throughout
- Single-purpose files
- Clear function naming (camelCase)
- Comprehensive error handling
- Verbose logging support

### Dependencies

- **commander**: CLI framework
- **inquirer**: Interactive prompts
- **chalk**: Terminal colors
- **ora**: Loading spinners
- **date-fns**: Date manipulation
- **execa**: Shell command execution

### Testing

Currently manual testing only. Run:

```bash
timr --help
timr generate --help
timr config --list
timr generate --current-week --github -v
```

## License

ISC

## Support

For issues or questions, please open an issue on GitHub.
