// The room a tab is currently in. sessionStorage rather than localStorage so two tabs
// in the same browser can be two different participants.

const STORAGE_KEY = "devsync-room-session"

export type RoomSession = {
  roomId: string
  name: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function getRoomSession(): RoomSession | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed || !isNonEmptyString(parsed.roomId) || !isNonEmptyString(parsed.name)) {
      return null
    }
    return { roomId: parsed.roomId, name: parsed.name }
  } catch {
    // Malformed JSON or storage blocked entirely — treat it as no session.
    return null
  }
}

export function setRoomSession(session: RoomSession): RoomSession | null {
  const roomId = session.roomId.trim()
  const name = session.name.trim()
  if (!roomId || !name) return null

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ roomId, name }))
  } catch {
    return null
  }
  return { roomId, name }
}

export function clearRoomSession() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do if storage is unavailable.
  }
}

// Display only — the URL, storage and the clipboard always carry the full ID.
export function shortenRoomId(id: string) {
  if (id.length <= 12) return id
  return `${id.slice(0, 4)}…${id.slice(-4)}`.toUpperCase()
}
