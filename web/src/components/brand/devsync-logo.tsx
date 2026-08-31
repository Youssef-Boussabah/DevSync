import { cn } from "@/lib/utils";

/*
 * DevSync mark: paired angle brackets around two offset sync bars.
 * The bars pick up the accent; the brackets follow the text color.
 */
export function DevSyncMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-5 shrink-0", className)}
    >
      <path d="M7.5 5.5 2.5 12l5 6.5" />
      <path d="m16.5 5.5 5 6.5-5 6.5" />
      <path className="stroke-primary" d="M10.5 9.75h4.5" />
      <path className="stroke-primary" d="M9 14.25h4.5" />
    </svg>
  );
}

export function DevSyncLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)}>
      <DevSyncMark />
      <span className="text-[15px] font-semibold leading-none tracking-tight">
        DevSync
      </span>
    </span>
  );
}
