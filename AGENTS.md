# Agent Guidelines for timereport

## Package Identity

- **npm package**: `timereport`
- **CLI command**: `timr`
- **Type**: ES Modules (`"type": "module"` in package.json)
- **Node requirement**: >= 18.0.0 (for native fetch)

## Development Setup

```bash
npm install
npm link              # Installs `timr` command globally
```

**No test suite exists** - manual testing only with `timr --help`, `timr generate --default`

## Critical File Extensions

**Always include `.js` in imports** - ES modules require explicit extensions:

```javascript
import { loadConfig } from "../utils/config.js"; // Required
import { loadConfig } from "../utils/config"; // Will fail
```

## CLI Command Shortcuts

- **Fastest**: `timr generate --default` (current week, all sources, no prompts)
- **Interactive**: `timr generate` (prompts for date range and sources)
- **Verbose debug**: `timr generate --default -v`

The `--default` flag skips all prompts including first-run config setup.

## Configuration Priority (highest to lowest)

1. Environment variables (`SLACK_USER_ID`, `GITHUB_ORG`, `NYLAS_API_KEY`, `NYLAS_GRANT_ID`, `SLACK_HUDDLES_PATH`)
2. `~/.timrrc` (JSON file created by `timr config --init`)
3. Built-in defaults (`GITHUB_ORG='vatfree'`, `SLACK_HUDDLES_PATH='~/Downloads'`)

Use `.envrc` for local development (already in `.gitignore`).

## Architecture

```
bin/timr.js           → CLI entry (Commander.js)
src/cli/commands.js   → generateCommand(), configCommand()
src/sources/          → Data fetchers (github.js, slack.js, calendar.js)
src/formatters/       → YAML output
src/utils/            → Shared utilities
python-scripts/       → Archived originals (reference only, not executable)
```

## Data Source Quirks

### GitHub (via `gh` CLI)

- Uses `execa` to shell out to GitHub CLI
- **SLOW**: Fetches ALL repos in org (~126), then filters PRs by date - takes 30-60s
- Each commit = 30-min session, merged if overlapping
- Extracts eng tags from PR titles: `eng707` → `#eng707`

### Slack Huddles

- **FAST**: Local JSON file read, instant
- **Not an API** - requires manual bookmarklet download
- User must run `bookmarklet.js` in browser to save `slack_huddles.json` to `~/Downloads`
- Script creates `.bak` backup, deletes main file after use
- In interactive mode: prompts to use `.bak` if main file missing
- In non-interactive or `--default`: auto-uses `.bak` without prompt

### Calendar (Nylas API)

- **FAST**: Single API call
- Optional - gracefully skips if credentials not set
- Uses native `fetch()` (Node 18+)
- Only fetches "busy" events, excludes cancelled

## Code Conventions

- **Logging**: Use `src/utils/logger.js` (info, warn, error, verbose, success) - NOT console.log
- **Dates**: Use date-fns library, not Date methods
- **Shell commands**: Use execa, not child_process
- **TTY detection**: Use `shouldPrompt()` from `src/utils/tty.js` to decide interactive vs scripted behavior

## Common Gotchas

- **GitHub fetch is slow** - queries all repos in org (~126 for vatfree), may take 30-60s
- **Slack/Calendar are fast** - local file read and single API call, both instant
- **`--default` flag** sets `--current-week`, `--all`, and `--use-backup` internally in `commands.js`
- **First-run config wizard** is skipped if `--default` flag used or stdout is not a TTY
- **Slack backup prompt** only shows in interactive (TTY) mode unless `--use-backup` flag set
