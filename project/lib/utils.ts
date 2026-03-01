import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type TimestampInput = string | number | Date | null | undefined;

function toDate(input: TimestampInput): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

// Consistent, exact timestamp format used across the app.
// Local time: YYYY-MM-DD HH:mm
export function formatExactDateTime(input: TimestampInput): string {
  const d = toDate(input);
  if (!d) return '—';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// For tooltips / accessibility when we want higher precision.
export function formatExactDateTimeWithSeconds(input: TimestampInput): string {
  const d = toDate(input);
  if (!d) return '—';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
