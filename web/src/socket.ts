import { io, type Socket } from "socket.io-client"
import type { ClientToServerEvents, ServerToClientEvents } from "@/types/realtime"

export type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: RoomSocket | undefined

// One socket per browser tab. A disconnected instance is reconnected rather than
// replaced, so listeners attached to it survive; the server-side socket id does not,
// and a reconnect is a new connection that has to join its room again.
export const initSocket = (): RoomSocket => {
  const url = process.env.NEXT_PUBLIC_BACKEND_URL
  if (!url) {
    throw new Error("NEXT_PUBLIC_BACKEND_URL is not set")
  }

  if (!socket) {
    socket = io(url, { transports: ["websocket"], timeout: 10000 })
  } else if (!socket.connected) {
    socket.connect()
  }

  return socket
}
