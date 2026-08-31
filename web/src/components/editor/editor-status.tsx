import { cn } from "@/lib/utils"
import type { ConnectionState, TypingUser } from "@/types/realtime"

// Two participants may share a display name, so identity stays the socket id
// upstream in use-room; this row only renders the label.
function typingLabel(users: TypingUser[]) {
  if (users.length === 1) return `${users[0].name} is typing…`
  if (users.length === 2) return `${users[0].name} and ${users[1].name} are typing…`
  return `${users.length} people are typing…`
}

// Editing pauses rather than queuing, so the row says so instead of promising a sync.
function pausedLabel(state: ConnectionState) {
  if (state === "connecting") return "Connecting… editing is paused."
  if (state === "reconnecting") return "Reconnecting… editing is paused."
  return null
}

export function EditorStatus({
  connectionState,
  typingUsers,
}: {
  connectionState: ConnectionState
  typingUsers: TypingUser[]
}) {
  const paused = pausedLabel(connectionState)
  const message = paused ?? (typingUsers.length > 0 ? typingLabel(typingUsers) : null)

  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-t px-4 text-xs text-muted-foreground">
      {message && (
        <>
          <span
            className={cn("size-1.5 rounded-full", paused ? "bg-muted-foreground" : "bg-primary")}
            aria-hidden
          />
          <span>{message}</span>
        </>
      )}
    </div>
  )
}
