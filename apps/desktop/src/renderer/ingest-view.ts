import type { SourceRange } from '@ai-video-assembly/domain';
import type { RationalV1 } from '@ai-video-assembly/media';

const MICROSECONDS_PER_SECOND = 1_000_000;
const MICROSECONDS_PER_MINUTE = 60 * MICROSECONDS_PER_SECOND;
const MICROSECONDS_PER_HOUR = 60 * MICROSECONDS_PER_MINUTE;

function padded(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function formatDurationUs(value: number): string {
  const hours = Math.floor(value / MICROSECONDS_PER_HOUR);
  const afterHours = value % MICROSECONDS_PER_HOUR;
  const minutes = Math.floor(afterHours / MICROSECONDS_PER_MINUTE);
  const afterMinutes = afterHours % MICROSECONDS_PER_MINUTE;
  const seconds = Math.floor(afterMinutes / MICROSECONDS_PER_SECOND);
  const microseconds = afterMinutes % MICROSECONDS_PER_SECOND;
  return `${padded(hours, 2)}:${padded(minutes, 2)}:${padded(seconds, 2)}.${padded(microseconds, 6)}`;
}

export function formatRational(value: RationalV1): string {
  return `${value.numerator}/${value.denominator}`;
}

export function formatRangeUs(range: SourceRange): string {
  return `${formatDurationUs(range.startUs)} – ${formatDurationUs(range.endUs)}`;
}

export function formatByteSize(byteSize: number): string {
  return `${byteSize.toLocaleString('en-US')} bytes`;
}
