import { DevSyncMark } from "@/components/brand/devsync-logo";

/*
 * Static mock of a DevSync room. Purely presentational — the real workspace
 * lives on /room/[id] and is wired up in the room hooks, not here.
 */
export function WorkspacePreview() {
  return (
    <div
      role="img"
      aria-label="Preview of a DevSync room: three people editing a JavaScript snippet together"
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <div className="flex h-11 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <DevSyncMark className="size-4" />
          <span className="truncate font-mono text-xs text-muted-foreground">
            ROOM · 7F2A…91C3
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-md border px-2 py-0.5 font-mono text-xs text-muted-foreground">
            JavaScript
          </span>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1">
              <span className="grid size-6 place-items-center rounded-full bg-secondary ring-2 ring-card text-[10px] font-medium">
                MK
              </span>
              <span className="grid size-6 place-items-center rounded-full bg-secondary ring-2 ring-card text-[10px] font-medium">
                AS
              </span>
              <span className="grid size-6 place-items-center rounded-full bg-secondary ring-2 ring-card text-[10px] font-medium">
                JL
              </span>
            </div>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              3 connected
            </span>
          </div>
        </div>
      </div>

      <div className="flex bg-background/50 font-mono text-[13px] leading-6">
        <div className="select-none border-r px-3 py-4 text-right text-muted-foreground/50">
          <div>1</div>
          <div>2</div>
          <div>3</div>
          <div>4</div>
          <div>5</div>
          <div>6</div>
          <div>7</div>
        </div>
        <div className="overflow-x-auto py-4 pl-4 pr-6 whitespace-pre">
          <div>
            <span className="text-sky-300/90">const</span> room ={" "}
            <span className="text-emerald-300/90">&quot;devsync&quot;</span>
          </div>
          <div>&nbsp;</div>
          <div>
            <span className="text-sky-300/90">function</span> greet(name) {"{"}
          </div>
          <div>
            {"  "}
            <span className="text-sky-300/90">return</span>{" "}
            <span className="text-emerald-300/90">{"`Hello, ${"}</span>
            name
            <span className="text-emerald-300/90">{"}!`"}</span>
          </div>
          <div>{"}"}</div>
          <div>&nbsp;</div>
          <div>
            console.<span className="text-sky-300/90">log</span>(greet(
            <span className="text-emerald-300/90">&quot;team&quot;</span>))
          </div>
        </div>
      </div>

      <div className="border-t px-4 py-3">
        <div className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
          OUTPUT
        </div>
        <div className="mt-1 font-mono text-[13px]">Hello, team!</div>
      </div>

      <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary" />
        Maya is typing…
      </div>
    </div>
  );
}
