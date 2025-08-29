import { endOfDay, format, startOfDay, startOfYear, subMonths } from "date-fns";
import type { DateRange } from "react-day-picker";

export type CustomRange = { start: string; end: string };

export const labelForTimeRange = (timeRange: string | CustomRange): string => {
  if (typeof timeRange === "string") {
    switch (timeRange) {
      case "1h":
        return "Last hour";
      case "1d":
        return "Last 24 hours";
      case "1m":
        return "Last month";
      case "1y":
        return "Last year";
      default:
        return "All time";
    }
  }
  try {
    const start = new Date(timeRange.start);
    const end = new Date(timeRange.end);
    const sameDay = start.toDateString() === end.toDateString();
    return sameDay
      ? `${format(start, "dd MMM yyyy")}`
      : `${format(start, "dd MMM yyyy")} → ${format(end, "dd MMM yyyy")}`;
  } catch {
    return "Custom range";
  }
};

export const toDateRange = (value: string | CustomRange): DateRange | undefined => {
  const today = new Date();
  if (typeof value !== "string") {
    const from = new Date(value.start);
    const to = new Date(value.end);
    return { from, to };
  }
  switch (value) {
    case "1h":
    case "1d":
      return { from: today, to: today };
    case "1m": {
      const from = subMonths(today, 1);
      return { from, to: today };
    }
    case "1y": {
      const from = startOfYear(today);
      return { from, to: today };
    }
    case "all":
    default:
      return undefined;
  }
};

export const toCustomRangeFromDateRange = (range?: DateRange): string | CustomRange => {
  if (range?.from && range?.to) {
    return { start: startOfDay(range.from).toISOString(), end: endOfDay(range.to).toISOString() };
  }
  return "all";
};
