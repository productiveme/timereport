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

  const startDt = parseDate(startDate);
  const endDt = parseDate(endDate);
  endDt.setHours(23, 59, 59, 999);

  // Create a wider window for repo filtering (2 weeks before to current)
  // This catches commits that were made during the target week but pushed later
  const repoFilterStart = new Date(startDt);
  repoFilterStart.setDate(repoFilterStart.getDate() - 14); // 2 weeks before

  // Get repositories filtered by pushedAt date (wider window)
  const repos = await getActiveRepositories(org, repoFilterStart, new Date());
  verbose(`Found ${repos.length} active repositories in extended date range`);

  // Map to store commits by SHA to avoid duplicates
  const allCommits = new Map();

  // Map to store PR info by commit SHA
  const commitToPR = new Map();

  for (const repo of repos) {
    // Fetch all commits in date range for this repo
    const commits = await getRepoCommits(
      org,
      repo,
      userEmail,
      startDate,
      endDate,
    );

    if (commits.length > 0) {
      verbose(`  Found ${commits.length} commits in ${repo}`);

      // Store commits
      for (const commit of commits) {
        const key = `${repo}:${commit.sha}`;
        allCommits.set(key, {
          ...commit,
          repo,
        });
      }

      // Fetch PRs for this repo to get PR titles
      const prs = await getAllPRs(org, repo, startDate, endDate);

      // Map commits to their PRs
      for (const pr of prs) {
        const prCommits = await getPRCommits(
          org,
          repo,
          pr.number,
          userEmail,
          startDate,
          endDate,
        );

        for (const commit of prCommits) {
          const key = `${repo}:${commit.sha}`;
          commitToPR.set(key, {
            title: pr.title,
            number: pr.number,
          });
        }
      }
    }
  }

  verbose(`Found ${allCommits.size} total commits`);

  // Group commits by task (PR or commit message)
  // First pass: create task entries with their original names
  const taskEntries = [];

  for (const [key, commit] of allCommits) {
    const prInfo = commitToPR.get(key);

    let taskName;
    if (prInfo) {
      // Use PR title
      taskName = formatTaskName(prInfo.title, commit.repo);
    } else {
      // Use commit message (first line only)
      const firstLine = commit.message.split("\n")[0];
      taskName = formatTaskName(firstLine, commit.repo);
    }

    taskEntries.push({
      taskName,
      commit,
    });
  }

  // Second pass: group by hashtag and merge descriptions
  const hashtagMap = new Map();

  for (const entry of taskEntries) {
    // Extract hashtag from task name (e.g., "#techspec" or "#eng123")
    const hashtagMatch = entry.taskName.match(/#(\S+)$/);
    const hashtag = hashtagMatch ? hashtagMatch[1] : entry.taskName;

    // Extract description (everything before the hashtag)
    const description = entry.taskName.replace(/#\S+$/, "").trim();

    if (!hashtagMap.has(hashtag)) {
      hashtagMap.set(hashtag, {
        descriptions: new Set(),
        commits: [],
      });
    }

    const group = hashtagMap.get(hashtag);
    if (description) {
      group.descriptions.add(description);
    }
    group.commits.push(entry.commit);
  }

  // Convert to task format with merged descriptions
  const tasks = [];
  for (const [hashtag, group] of hashtagMap) {
    const sessions = createCommitSessions(group.commits);
    const sortTimestamp = Math.min(...group.commits.map((c) => c.timestamp));

    // Combine descriptions into comma-separated list
    const descriptionList = Array.from(group.descriptions);
    const taskName =
      descriptionList.length > 0
        ? `${descriptionList.join(", ")} #${hashtag}`
        : `#${hashtag}`;

    tasks.push({
      name: taskName,
      sessions,
      sort_timestamp: sortTimestamp,
    });
  }

  return tasks;
}

async function getGitHubUsername() {
  const { stdout } = await execa("gh", ["api", "/user", "--jq", ".login"]);
  return stdout.trim();
}

async function getGitUserEmail() {
  const { stdout } = await execa("git", ["config", "user.email"]);
  return stdout.trim();
}

async function getActiveRepositories(org, startDate, endDate) {
  const { stdout } = await execa("gh", [
    "repo",
    "list",
    org,
    "--limit",
    "1000",
    "--json",
    "name,pushedAt",
  ]);
  const repos = JSON.parse(stdout);

  // Filter repos that were pushed to during the date range
  const activeRepos = repos.filter((repo) => {
    const pushedAt = new Date(repo.pushedAt);
    return pushedAt >= startDate && pushedAt <= endDate;
  });

  return activeRepos.map((r) => r.name);
}

async function getAllPRs(org, repo, startDate, endDate) {
  try {
    const { stdout } = await execa("gh", [
      "pr",
      "list",
      "--repo",
      `${org}/${repo}`,
      "--state",
      "all",
      "--search",
      `created:${startDate}..${endDate}`,
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

async function getRepoCommits(org, repo, userEmail, startDate, endDate) {
  try {
    const startDt = parseDate(startDate);
    const endDt = parseDate(endDate);
    endDt.setHours(23, 59, 59, 999);

    // Get all branches with their last commit dates
    const branches = await getActiveBranches(org, repo, startDt, endDt);

    if (branches.length === 0) {
      return [];
    }

    verbose(`    Checking ${branches.length} active branches in ${repo}`);

    const allCommits = new Map(); // Use Map to dedupe by SHA

    // Fetch commits from each active branch using GraphQL
    for (const branch of branches) {
      try {
        const { stdout } = await execa("gh", [
          "api",
          "graphql",
          "-f",
          `query=
{
  repository(owner: "${org}", name: "${repo}") {
    ref(qualifiedName: "refs/heads/${branch}") {
      target {
        ... on Commit {
          history(first: 100, author: {emails: ["${userEmail}"]}) {
            edges {
              node {
                oid
                message
                committedDate
              }
            }
          }
        }
      }
    }
  }
}`,
          "--jq",
          ".data.repository.ref.target.history.edges[] | .node | {sha: .oid, message: .message, date: .committedDate}",
        ]);

        if (!stdout.trim()) continue;

        for (const line of stdout.trim().split("\n")) {
          if (!line.trim()) continue;

          try {
            const commit = JSON.parse(line);
            const commitDate = new Date(commit.date);

            // Filter by date range
            if (commitDate >= startDt && commitDate <= endDt) {
              // Use SHA as key to avoid duplicates across branches
              if (!allCommits.has(commit.sha)) {
                allCommits.set(commit.sha, {
                  sha: commit.sha,
                  message: commit.message,
                  date: commitDate,
                  timestamp: dateToTimestamp(commitDate),
                });
              }
            }
          } catch (err) {
            // Skip malformed JSON lines
            continue;
          }
        }
      } catch {
        // Skip branches that error
        continue;
      }
    }

    return Array.from(allCommits.values());
  } catch {
    return [];
  }
}

async function getActiveBranches(org, repo, startDate, endDate) {
  try {
    const { stdout } = await execa("gh", [
      "api",
      `repos/${org}/${repo}/branches`,
      "--jq",
      ".[].name",
    ]);

    const branchNames = stdout
      .trim()
      .split("\n")
      .filter((b) => b.trim());

    // For each branch, check if it has commits in our date range
    const activeBranches = [];

    for (const branch of branchNames) {
      try {
        // Get the latest commit date on this branch
        const { stdout: commitInfo } = await execa("gh", [
          "api",
          `repos/${org}/${repo}/commits/${branch}`,
          "--jq",
          ".commit.author.date",
        ]);

        const lastCommitDate = new Date(commitInfo.trim());

        // Only include branch if its last commit is within or after our date range
        // (commits could be older on the branch, but if the last commit is before startDate,
        // we can skip this branch entirely)
        if (lastCommitDate >= startDate) {
          activeBranches.push(branch);
        }
      } catch {
        // If we can't get commit info, skip this branch
        continue;
      }
    }

    return activeBranches;
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
