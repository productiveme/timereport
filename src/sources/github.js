import { execa } from "execa";
import { verbose, warn } from "../utils/logger.js";
import { parseDate, dateToTimestamp } from "../utils/dates.js";
import { createCommitSessions } from "../utils/sessions.js";
import { formatTaskName } from "../utils/github-helpers.js";
import { DEFAULTS } from "../constants.js";

export async function fetchGitHubData(
  startDate,
  endDate,
  org = DEFAULTS.GITHUB_ORG,
) {
  // Get user info
  const username = await getGitHubUsername();
  const userEmail = await getGitUserEmail();

  verbose(`Fetching GitHub data for ${username} (${userEmail}) in ${org}`);
  verbose(`Date range: ${startDate} to ${endDate}`);

  // Get repositories
  const repos = await getRepositories(org);
  verbose(`Found ${repos.length} repositories`);

  // Collect PR data
  const prData = new Map();

  for (const repo of repos) {
    const prs = await getMergedPRs(org, repo, startDate, endDate);

    if (prs.length > 0) {
      verbose(`  Checking ${prs.length} PRs in ${repo}...`);
    }

    for (const pr of prs) {
      const commits = await getPRCommits(
        org,
        repo,
        pr.number,
        userEmail,
        startDate,
        endDate,
      );

      if (commits.length > 0) {
        const prKey = `${repo}#${pr.number}`;
        prData.set(prKey, {
          title: pr.title,
          repo,
          number: pr.number,
          commits,
        });
      }
    }
  }

  verbose(`Found ${prData.size} PRs with your commits`);

  // Convert to task format
  const tasks = [];
  for (const [prKey, prInfo] of prData) {
    const taskName = formatTaskName(prInfo.title, prInfo.repo);
    const sessions = createCommitSessions(prInfo.commits);
    const sortTimestamp = Math.min(...prInfo.commits.map((c) => c.timestamp));

    tasks.push({
      name: taskName,
      sessions,
      sort_timestamp: sortTimestamp,
    });
  }

  // Merge tasks with the same name
  const mergedTasks = mergeDuplicateTasks(tasks);

  return mergedTasks;
}

/**
 * Merge tasks that have the same name
 */
function mergeDuplicateTasks(tasks) {
  const taskMap = new Map();

  for (const task of tasks) {
    if (taskMap.has(task.name)) {
      // Task with this name already exists, merge sessions
      const existing = taskMap.get(task.name);
      existing.sessions.push(...task.sessions);
      // Update sort timestamp to earliest
      existing.sort_timestamp = Math.min(
        existing.sort_timestamp,
        task.sort_timestamp,
      );
    } else {
      // New task, make a copy to avoid mutations
      taskMap.set(task.name, {
        name: task.name,
        sessions: [...task.sessions],
        sort_timestamp: task.sort_timestamp,
      });
    }
  }

  return Array.from(taskMap.values());
}

async function getGitHubUsername() {
  const { stdout } = await execa("gh", ["api", "/user", "--jq", ".login"]);
  return stdout.trim();
}

async function getGitUserEmail() {
  const { stdout } = await execa("git", ["config", "user.email"]);
  return stdout.trim();
}

async function getRepositories(org) {
  const { stdout } = await execa("gh", [
    "repo",
    "list",
    org,
    "--limit",
    "1000",
    "--json",
    "name",
  ]);
  const repos = JSON.parse(stdout);
  return repos.map((r) => r.name);
}

async function getMergedPRs(org, repo, startDate, endDate) {
  try {
    const { stdout } = await execa("gh", [
      "pr",
      "list",
      "--repo",
      `${org}/${repo}`,
      "--state",
      "merged",
      "--search",
      `merged:${startDate}..${endDate}`,
      "--json",
      "number,title",
      "--limit",
      "100",
    ]);
    return JSON.parse(stdout);
  } catch {
    return [];
  }
}

async function getPRCommits(
  org,
  repo,
  prNumber,
  userEmail,
  startDate,
  endDate,
) {
  try {
    const { stdout } = await execa("gh", [
      "api",
      `repos/${org}/${repo}/pulls/${prNumber}/commits`,
      "--jq",
      `.[] | select(.commit.author.email == "${userEmail}") | {sha: .sha, message: .commit.message, date: .commit.author.date}`,
    ]);

    if (!stdout.trim()) return [];

    const startDt = parseDate(startDate);
    const endDt = parseDate(endDate);
    endDt.setHours(23, 59, 59, 999);

    const commits = [];
    for (const line of stdout.trim().split("\n")) {
      if (!line.trim()) continue;

      try {
        const commit = JSON.parse(line);
        const commitDate = new Date(commit.date);

        if (commitDate >= startDt && commitDate <= endDt) {
          commits.push({
            sha: commit.sha,
            message: commit.message,
            date: commitDate,
            timestamp: dateToTimestamp(commitDate),
          });
        }
      } catch (err) {
        // Skip malformed JSON lines
        continue;
      }
    }

    return commits;
  } catch {
    return [];
  }
}
