export function mergeOverlappingSessions(sessions) {
  if (!sessions || sessions.length === 0) return [];

  // Sort by start time
  const sorted = [...sessions].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const lastMerged = merged[merged.length - 1];

    // Check if sessions overlap
    if (current.start <= lastMerged.end) {
      // Extend the last merged session
      lastMerged.end = Math.max(lastMerged.end, current.end);
    } else {
      // No overlap, add as new session
      merged.push(current);
    }
  }

  return merged;
}

export function createCommitSessions(commits, durationMinutes = 30) {
  const sessions = commits.map((commit) => ({
    start: commit.timestamp - durationMinutes * 60,
    end: commit.timestamp,
  }));

  return mergeOverlappingSessions(sessions);
}
