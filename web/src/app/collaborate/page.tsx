import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DevSyncLogo } from "@/components/brand/devsync-logo";
import { RoomAccess } from "@/components/collaborate/room-access";

export default function CollaboratePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="DevSync home">
            <DevSyncLogo />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back home
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          ROOM ACCESS
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Start or join a room.
        </h1>
        <p className="mt-3 max-w-[540px] text-muted-foreground">
          Create a new shared session, or enter a room ID someone sent you. A room
          link opens its room directly.
        </p>
        <div className="mt-10">
          <RoomAccess />
        </div>
      </main>
    </div>
  );
}
