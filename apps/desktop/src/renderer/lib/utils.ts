import { t, getLocale } from "../../shared/i18n";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function richTextToPlainText(input: string | null | undefined): string {
  if (!input) return "";

  let output = input;

  for (let i = 0; i < 2; i++) {
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(output, "text/html");
      output = doc.body.textContent || output;
    } else {
      output = output.replace(/<[^>]+>/g, " ");
    }
  }

  return output.replace(/\s+/g, " ").trim();
}

export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes
      .toString()
      .padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
}

// Alias for formatTime to be more explicit for duration formatting
export const formatDuration = formatTime;

function isSameCalendarDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  return result;
}

export function formatEpisodeDate(date: Date | string, now = new Date()): string {
  const dateValue = typeof date === "string" ? new Date(date) : date;

  if (Number.isNaN(dateValue.getTime())) {
    return t("Unknown date");
  }

  if (isSameCalendarDay(dateValue, now)) {
    return t("Today");
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isSameCalendarDay(dateValue, yesterday)) {
    return t("Yesterday");
  }

  const thisWeek = startOfWeek(now);
  const lastWeek = new Date(thisWeek);
  lastWeek.setDate(lastWeek.getDate() - 7);
  if (dateValue >= lastWeek && dateValue < thisWeek) {
    return t("Last week");
  }

  return new Intl.DateTimeFormat(getLocale(), {
    day: "numeric",
    month: "short",
    year: dateValue.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(dateValue);
}

export function formatEpisodeDateGroup(date: Date | string, now = new Date()): string {
  const dateValue = typeof date === "string" ? new Date(date) : date;

  if (Number.isNaN(dateValue.getTime())) {
    return t("Earlier");
  }

  if (isSameCalendarDay(dateValue, now)) {
    return t("Today");
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isSameCalendarDay(dateValue, yesterday)) {
    return t("Yesterday");
  }

  const thisWeek = startOfWeek(now);
  if (dateValue >= thisWeek) {
    return t("This week");
  }

  const lastWeek = new Date(thisWeek);
  lastWeek.setDate(lastWeek.getDate() - 7);
  if (dateValue >= lastWeek) {
    return t("Last week");
  }

  return new Intl.DateTimeFormat(getLocale(), {
    month: "long",
    year: dateValue.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(dateValue);
}

export function formatLastPlayedDate(date: Date | string, now = new Date()): string {
  const dateValue = typeof date === "string" ? new Date(date) : date;

  if (Number.isNaN(dateValue.getTime())) {
    return t("Played recently");
  }

  if (isSameCalendarDay(dateValue, now)) {
    return t("Played today");
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isSameCalendarDay(dateValue, yesterday)) {
    return t("Played yesterday");
  }

  const formattedDate = formatEpisodeDate(dateValue, now);
  return formattedDate === t("Last week") ? t("Played last week") : t("Last played {date}", { date: formattedDate });
}

// Format date to a readable string
export function formatDate(date: Date | string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return t("Invalid date");

  const now = new Date();
  const diffInMs = now.getTime() - dateObj.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  const relative = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" });
  if (Math.abs(diffInDays) < 7) return relative.format(-diffInDays, "day");
  if (Math.abs(diffInDays) < 30) return relative.format(-Math.floor(diffInDays / 7), "week");
  if (Math.abs(diffInDays) < 365) return relative.format(-Math.floor(diffInDays / 30), "month");
  return relative.format(-Math.floor(diffInDays / 365), "year");
}

// Parse timestamp string (like "36:01" or "1:23:45") to seconds
export function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(":").map(Number);

  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  } else if (parts.length === 3) {
    // HH:MM:SS format
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return 0;
}

// Check if a string is a valid timestamp
export function isValidTimestamp(timestamp: string): boolean {
  const timestampRegex = /^(\d{1,2}:)?([0-5]?\d):([0-5]\d)$/;
  return timestampRegex.test(timestamp);
}

// Replace timestamps in text with clickable elements
export function processTimestamps(text: string): string {
  // Match timestamp patterns: MM:SS or H:MM:SS or HH:MM:SS
  // Updated regex to be more precise and avoid false positives
  const timestampRegex = /\b(\d{1,2}:[0-5]\d:[0-5]\d|\d{1,3}:[0-5]\d)\b/g;

  return text.replace(timestampRegex, (match) => {
    if (isValidTimestamp(match)) {
      const seconds = parseTimestamp(match);
      return `<button class="timestamp-link" data-seconds="${seconds}">${match}</button>`;
    }
    return match;
  });
}
