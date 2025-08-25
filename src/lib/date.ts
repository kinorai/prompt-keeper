/**
 * Locale-aware, WhatsApp-like date formatting for conversation list timestamps.
 * Rules:
 * - Same day: time only (locale-based, e.g., 17:30 or 5:30 PM)
 * - Yesterday: literal "Yesterday"
 * - Within last 7 days: weekday name (e.g., Monday)
 * - Beyond 7 days: DD/MM/YYYY
 */

export interface FormatOptions {
  now?: Date;
  locale?: string | string[];
}

function toDate(input: string | number | Date): Date {
  if (input instanceof Date) return input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date() : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isYesterday(date: Date, now: Date): boolean {
  const sodNow = startOfDay(now);
  const sodDate = startOfDay(date);
  const diffDays = Math.round((sodNow.getTime() - sodDate.getTime()) / 86400000);
  return diffDays === 1;
}

function isWithinLast7Days(date: Date, now: Date): boolean {
  const sodNow = startOfDay(now).getTime();
  const sodDate = startOfDay(date).getTime();
  const diffDays = Math.round((sodNow - sodDate) / 86400000);
  return diffDays > 1 && diffDays < 7;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatDDMMYYYY(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * Format a date value according to WhatsApp-like rules.
 * @param input date or timestamp or ISO string
 * @param options now and locale overrides
 */
export function formatConversationDate(input: string | number | Date, options: FormatOptions = {}): string {
  const date = toDate(input);
  const now = options.now ?? new Date();
  const locale = options.locale;

  if (isSameDay(date, now)) {
    // Time-only, locale-aware 24h/12h
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  if (isYesterday(date, now)) {
    // Simple English label; can be localized by caller if needed
    return "Yesterday";
  }

  if (isWithinLast7Days(date, now)) {
    // Weekday name
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
    }).format(date);
  }

  // Fallback: DD/MM/YYYY
  return formatDDMMYYYY(date);
}

/**
 * Convenience to safely format possibly undefined/invalid inputs.
 */
export function safeFormatConversationDate(
  input: string | number | Date | null | undefined,
  options?: FormatOptions,
): string {
  if (input == null) return "";
  return formatConversationDate(input, options);
}

// Re-export helpers for tests or advanced usage
export const dateHelpers = {
  toDate,
  startOfDay,
  isSameDay,
  isYesterday,
  isWithinLast7Days,
  formatDDMMYYYY,
};
