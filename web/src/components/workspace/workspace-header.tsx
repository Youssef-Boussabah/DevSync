"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DevSyncLogo, DevSyncMark } from "@/components/brand/devsync-logo";
import { RoomMembers } from "@/components/workspace/room-members";
import { clearRoomSession, shortenRoomId } from "@/lib/room-session";
import { cn } from "@/lib/utils";
import type { ConnectionState, RoomMember } from "@/types/realtime";

// Quiet by design: a dot on its own once connected, and a word only while it is not.
function ConnectionIndicator({ state }: { state: ConnectionState }) {
  const connected = state === "connected";
  const label = connected
    ? "Connected"
    : state === "connecting"
      ? "Connecting…"
      : "Reconnecting…";

  return (
    <span className="flex shrink-0 items-center gap-1.5" title={label}>
      <span
        className={cn("size-1.5 rounded-full", connected ? "bg-success" : "bg-muted-foreground")}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
      {!connected && (
        <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">
          {label}
        </span>
      )}
    </span>
  );
}

export function WorkspaceHeader({
  roomId,
  members,
  connectionState,
}: {
  roomId: string;
  members: RoomMember[];
  connectionState: ConnectionState;
}) {
  const router = useRouter();

  // The whole room URL, so the recipient lands in this room and only has to pick a name.
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/room/${encodeURIComponent(roomId)}`
      );
      toast("Invite link copied.");
    } catch {
      toast.error("Could not copy the invite link.");
    }
  };

  // Navigating away unmounts the editor, which emits leaveRoom and disconnects.
  const handleLeave = () => {
    clearRoomSession();
    router.push("/");
    toast("You left the room.");
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3 sm:gap-4 sm:px-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <Link href="/" aria-label="DevSync home" className="shrink-0">
          <DevSyncMark className="sm:hidden" />
          <DevSyncLogo className="hidden sm:inline-flex" />
        </Link>
        <span className="hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden />
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          ROOM · {shortenRoomId(roomId)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground hover:text-foreground sm:size-7"
          onClick={handleCopy}
          aria-label="Copy invite link"
          title="Copy invite link"
        >
          <Copy className="size-3.5" />
        </Button>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <ConnectionIndicator state={connectionState} />
        <RoomMembers members={members} />
        <Button
          variant="ghost"
          size="icon"
          className="size-9 sm:hidden"
          onClick={handleLeave}
          aria-label="Leave room"
          title="Leave room"
        >
          <LogOut />
        </Button>
        <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={handleLeave}>
          <LogOut aria-hidden />
          Leave
        </Button>
      </div>
    </header>
  );
}
