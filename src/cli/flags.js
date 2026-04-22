import { getCurrentWeek, getLastWeek } from "../utils/dates.js";

export function resolveDateRange(options) {
  if (options.currentWeek) {
    return getCurrentWeek();
  }

  if (options.lastWeek) {
    return getLastWeek();
  }

  if (options.from && options.to) {
    return {
      startDate: options.from,
      endDate: options.to,
    };
  }

  // Default to current week
  return getCurrentWeek();
}
