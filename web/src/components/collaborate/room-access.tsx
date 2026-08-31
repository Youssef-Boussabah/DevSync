"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidV4 } from "uuid";
import { Hash, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setRoomSession } from "@/lib/room-session";

const labelStyle = "font-mono text-xs tracking-[0.15em] text-muted-foreground";

export function RoomAccess() {
  const router = useRouter();
  const [startName, setStartName] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joinName, setJoinName] = useState("");

  const enterRoom = (roomId: string, name: string) => {
    const session = setRoomSession({ roomId, name });
    if (!session) {
      toast.error("Could not save this room session.");
      return;
    }
    router.push(`/room/${encodeURIComponent(session.roomId)}`);
  };

  const handleStart = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!startName.trim()) {
      toast.error("Enter your name.");
      return;
    }
    enterRoom(uuidV4(), startName.trim());
  };

  const handleJoin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!joinRoomId.trim()) {
      toast.error("Enter a room ID.");
      return;
    }
    if (!joinName.trim()) {
      toast.error("Enter your name.");
      return;
    }
    enterRoom(joinRoomId.trim(), joinName.trim());
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="flex flex-col rounded-xl border bg-card p-6">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="font-semibold">Start a new room</h2>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          A room is created for you and you go straight into it.
        </p>
        <form onSubmit={handleStart} className="mt-6 flex flex-1 flex-col gap-2">
          <Label htmlFor="start-name" className={labelStyle}>
            YOUR NAME
          </Label>
          <Input
            id="start-name"
            value={startName}
            onChange={(e) => setStartName(e.target.value)}
            placeholder="Maya"
            maxLength={40}
            autoComplete="off"
          />
          <div className="mt-auto pt-4">
            <Button type="submit" className="w-full max-sm:h-10">
              Start room
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <div className="flex items-center gap-2">
          <Hash className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="font-semibold">Join an existing room</h2>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter the room ID exactly as it was shared with you.
        </p>
        <form onSubmit={handleJoin} className="mt-6 grid gap-2">
          <Label htmlFor="join-room-id" className={labelStyle}>
            ROOM ID
          </Label>
          <Input
            id="join-room-id"
            value={joinRoomId}
            onChange={(e) => setJoinRoomId(e.target.value)}
            placeholder="Paste the full room ID"
            maxLength={64}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
          <Label htmlFor="join-name" className={`${labelStyle} mt-3`}>
            YOUR NAME
          </Label>
          <Input
            id="join-name"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="Bob"
            maxLength={40}
            autoComplete="off"
          />
          <Button type="submit" variant="secondary" className="mt-4 w-full max-sm:h-10">
            Join room
          </Button>
        </form>
      </section>
    </div>
  );
}
