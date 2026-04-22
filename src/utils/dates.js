import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  format,
  parse,
  isValid,
} from "date-fns";

export function getCurrentWeek() {
  const today = new Date();
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  return {
    startDate: format(monday, "yyyy-MM-dd"),
    endDate: format(today, "yyyy-MM-dd"),
  };
}

export function getLastWeek() {
  const today = new Date();
  const lastWeek = subWeeks(today, 1);
  const monday = startOfWeek(lastWeek, { weekStartsOn: 1 });
  const sunday = endOfWeek(lastWeek, { weekStartsOn: 1 });
  return {
    startDate: format(monday, "yyyy-MM-dd"),
    endDate: format(sunday, "yyyy-MM-dd"),
  };
}

export function parseDate(dateString) {
  const parsed = parse(dateString, "yyyy-MM-dd", new Date());
  if (!isValid(parsed)) {
    throw new Error(`Invalid date: ${dateString}`);
  }
  return parsed;
}

export function formatDate(date, formatString = "dd MMM yyyy, HH:mm") {
  return format(date, formatString);
}

export function dateToTimestamp(date) {
  return Math.floor(date.getTime() / 1000);
}

export function timestampToDate(timestamp) {
  return new Date(timestamp * 1000);
}
