import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DevSyncLogo } from "@/components/brand/devsync-logo";
import { LandingHeader } from "@/components/landing/landing-header";
import { WorkspacePreview } from "@/components/landing/workspace-preview";
import { FeatureStrip } from "@/components/landing/feature-strip";

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <LandingHeader />
      <main className="flex flex-1 flex-col">
        <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-14 lg:grid-cols-[5fr_6fr] lg:gap-16">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
              REAL-TIME COLLABORATIVE EDITOR
            </p>
            <h1 className="mt-4 text-balance text-5xl font-semibold leading-[1.08] tracking-tight lg:text-[56px]">
              Code together, instantly.
            </h1>
            <p className="mt-5 max-w-[540px] text-lg text-muted-foreground">
              Start a room, share the link, and edit code together in real time —
              no account required.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <Link href="/collaborate">
                  Start a room
                  <ArrowRight />
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Share the room link with anyone
              </span>
            </div>
          </div>
          <WorkspacePreview />
        </section>
        <FeatureStrip />
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
          <DevSyncLogo />
          <span className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} DevSync
          </span>
        </div>
      </footer>
    </div>
  );
}
