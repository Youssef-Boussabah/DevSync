import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DevSyncLogo } from "@/components/brand/devsync-logo";

export function LandingHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="DevSync home">
          <DevSyncLogo />
        </Link>
        <Button asChild size="sm" className="max-sm:h-9">
          <Link href="/collaborate">Start a room</Link>
        </Button>
      </div>
    </header>
  );
}
