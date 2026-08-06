'use client';

/**
 * A UTC instant, shown in the reader's own time zone.
 *
 * Formatted in the browser and only there: the machine rendering the page and the
 * machine reading it are in different places, and a server-rendered local time
 * would either be wrong or would disagree with the client's and fail hydration.
 * Nothing on either page renders one before its data has been fetched, so this
 * never runs during a server render.
 *
 * The `datetime` attribute keeps the exact instant available to anything that
 * wants the machine-readable form.
 */
export function Timestamp({ value }: { value: string }) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return (
    <time dateTime={value} className="text-sm text-zinc-500">
      {parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
    </time>
  );
}
