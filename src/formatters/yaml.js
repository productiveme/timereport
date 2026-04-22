import { formatDate, timestampToDate } from "../utils/dates.js";
import { mergeOverlappingSessions } from "../utils/sessions.js";

export function formatTimeReport(tasks) {
  if (!tasks || tasks.length === 0) {
    return "No tasks to report";
  }

  // Sort by timestamp
  const sorted = [...tasks].sort((a, b) => a.sort_timestamp - b.sort_timestamp);

  const lines = [];
  lines.push("# Time Entry Submission");
  lines.push("# Review and confirm the sessions below:");
  lines.push(
    "# Save and close this file to submit, or delete all content to cancel",
  );
  lines.push("");
  lines.push("tasks:");

  for (const task of sorted) {
    lines.push(`  - taskName: "${task.name}"`);
    lines.push(`    focus:`);

    // Merge overlapping sessions
    const merged = mergeOverlappingSessions(task.sessions);

    for (const session of merged) {
      const startDate = timestampToDate(session.start);
      const durationMinutes = Math.floor((session.end - session.start) / 60);
      const formatted = formatDate(startDate);

      lines.push(`      - ${formatted}, ${durationMinutes} min`);
    }
  }

  return lines.join("\n");
}
