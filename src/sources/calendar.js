import { verbose, warn, info } from "../utils/logger.js";
import { parseDate, dateToTimestamp } from "../utils/dates.js";

export async function fetchCalendarEvents(startDate, endDate, config) {
  if (!config.nylasApiKey || !config.nylasGrantId) {
    info("Nylas credentials not configured. Skipping calendar events.");
    return [];
  }

  verbose("Fetching calendar events from Nylas API");

  // Get primary calendar
  const calendars = await fetchCalendars(
    config.nylasApiKey,
    config.nylasGrantId,
  );
  if (calendars.length === 0) {
    warn("No calendars found");
    return [];
  }

  const primaryCalendar = calendars.find((c) => c.is_primary) || calendars[0];
  verbose(`Using calendar: ${primaryCalendar.name}`);

  // Fetch events
  const events = await fetchEvents(
    config.nylasApiKey,
    config.nylasGrantId,
    primaryCalendar.id,
    startDate,
    endDate,
  );

  verbose(`Fetched ${events.length} raw events from Nylas`);

  // Parse and filter
  const parsed = parseEvents(events);

  verbose(`Parsed ${parsed.length} valid events`);

  // Convert to task format
  const tasks = parsed.map((event) => ({
    name: `${event.title} #meetings`,
    sessions: [
      {
        start: event.start_time,
        end: event.end_time,
      },
    ],
    sort_timestamp: event.start_time,
  }));

  return tasks;
}

async function fetchCalendars(apiKey, grantId) {
  const url = `https://api.us.nylas.com/v3/grants/${grantId}/calendars`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Nylas API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}

async function fetchEvents(apiKey, grantId, calendarId, startDate, endDate) {
  const startDt = parseDate(startDate);
  const endDt = parseDate(endDate);
  endDt.setHours(23, 59, 59, 999);

  const startTimestamp = dateToTimestamp(startDt);
  const endTimestamp = dateToTimestamp(endDt);

  const params = new URLSearchParams({
    calendar_id: calendarId,
    start: startTimestamp,
    end: endTimestamp,
    busy: "true",
    limit: "200",
  });

  const url = `https://api.us.nylas.com/v3/grants/${grantId}/events?${params}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Nylas API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}

function parseEvents(events) {
  const parsed = [];

  for (const event of events) {
    const when = event.when || {};
    const startTime = when.start_time;
    const endTime = when.end_time;

    if (!startTime || !endTime) continue;
    if (!event.busy) continue;
    if (event.status === "cancelled") continue;

    const durationMinutes = Math.floor((endTime - startTime) / 60);
    if (durationMinutes < 1) continue;

    parsed.push({
      id: event.id,
      title: event.title || "Calendar Appointment",
      start_time: startTime,
      end_time: endTime,
      duration_minutes: durationMinutes,
    });
  }

  return parsed;
}
