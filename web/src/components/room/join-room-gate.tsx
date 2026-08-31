"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DevSyncLogo } from "@/components/brand/devsync-logo"
import { setRoomSession, shortenRoomId } from "@/lib/room-session"

// Shown when a tab opens a room link it has not entered yet. The room comes from the
// URL, so the only thing left to ask for is a display name.
export function JoinRoomGate({
  roomId,
  suggestedName,
  onJoin,
}: {
  roomId: string
  suggestedName: string
  onJoin: (name: string) => void
}) {
  const [name, setName] = useState(suggestedName)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("Enter your name.")
      return
    }

    const session = setRoomSession({ roomId, name })
    if (!session) {
      toast.error("Could not save this room session.")
      return
    }
    onJoin(session.name)
  }

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
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center px-6 py-14">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          ROOM INVITE
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Join this room.</h1>
        <p className="mt-3 text-muted-foreground">
          Choose a name to enter the shared session.
        </p>
        <section className="mt-8 rounded-xl border bg-card p-6">
          <p className="whitespace-nowrap font-mono text-xs text-muted-foreground">
            ROOM · {shortenRoomId(roomId)}
          </p>
          <form onSubmit={handleSubmit} className="mt-6 grid gap-2">
            <Label
              htmlFor="join-name"
              className="font-mono text-xs tracking-[0.15em] text-muted-foreground"
            >
              YOUR NAME
            </Label>
            <Input
              id="join-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bob"
              maxLength={40}
              autoComplete="off"
              autoFocus
            />
            <Button type="submit" className="mt-4 w-full max-sm:h-10">
              Join room
            </Button>
          </form>
        </section>
      </main>
    </div>
  )
}
