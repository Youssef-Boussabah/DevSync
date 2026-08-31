import { Pencil, Play, Users } from "lucide-react";

export function FeatureStrip() {
  return (
    <section className="border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <Pencil className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="font-mono text-xs tracking-[0.15em] text-foreground">
              REAL-TIME EDITING
            </h2>
          </div>
          <p className="mt-2.5 text-sm text-muted-foreground">
            Edits appear across the room as you type.
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="font-mono text-xs tracking-[0.15em] text-foreground">
              ROOM PRESENCE
            </h2>
          </div>
          <p className="mt-2.5 text-sm text-muted-foreground">
            See who is coding with you right now.
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Play className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="font-mono text-xs tracking-[0.15em] text-foreground">
              RUN CODE
            </h2>
          </div>
          <p className="mt-2.5 text-sm text-muted-foreground">
            Execute the shared snippet and inspect its output.
          </p>
        </div>
      </div>
    </section>
  );
}
