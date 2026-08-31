"use client"

import { useEffect, useState } from "react"
import { getRoomSession } from "@/lib/room-session"
import { JoinRoomGate } from "@/components/room/join-room-gate"
import { Workspace } from "@/components/workspace/workspace"

// The URL names the room; sessionStorage only says whether this tab has already
// entered it. Storage is read after mount, and the workspace — which is what opens
// the socket — is not rendered until the tab is known to belong to this room.
export function RoomPage({ roomId }: { roomId: string }) {
  const [name, setName] = useState<string | null>(null)
  const [suggestedName, setSuggestedName] = useState("")
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const session = getRoomSession()
    if (session?.roomId === roomId) {
      setName(session.name)
    } else if (session) {
      // A session for a different room: offer the name back, but make the user submit.
      setSuggestedName(session.name)
    }
    setChecked(true)
  }, [roomId])

  if (!checked) {
    return (
      <div className="flex h-svh items-center justify-center">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          OPENING ROOM…
        </p>
      </div>
    )
  }

  if (name === null) {
    return <JoinRoomGate roomId={roomId} suggestedName={suggestedName} onJoin={setName} />
  }

  return <Workspace roomId={roomId} name={name} />
}
