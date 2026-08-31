// Shapes shared by the collaboration code: the socket, the room hook and the
// components that render room state.

export type RoomMember = {
  id: string
  name: string
}

// Socket.IO reconnects on its own; this is what the workspace shows while it does.
export type ConnectionState = "connecting" | "connected" | "reconnecting"

export type TypingUser = {
  id: string
  name: string
  timestamp: number
}

// Identity on the wire is always the socket id; the name is whatever the server
// recorded when that socket joined.
type TypingEvent = {
  id: string
  name: string
}

export type ServerToClientEvents = {
  codeUpdate: (code: string) => void
  updateRoom: (members: RoomMember[]) => void
  userTyping: (event: TypingEvent) => void
  userStoppedTyping: (event: TypingEvent) => void
}

// The server takes its room and name from the socket, so it ignores the roomId and
// name sent here. They are kept because the current client still sends them.
export type ClientToServerEvents = {
  joinRoom: (payload: { roomId: string; name: string }) => void
  leaveRoom: () => void
  codeChange: (payload: { roomId: string; code: string }) => void
  userTyping: (payload: { roomId: string; name: string }) => void
  userStoppedTyping: (payload: { roomId: string; name: string }) => void
}
