"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { initSocket, type RoomSocket } from "@/socket"
import type { ConnectionState, RoomMember, TypingUser } from "@/types/realtime"

// How long a keystroke keeps you "typing", and how long an indicator survives
// without a refresh in case the stop event never arrives.
const TYPING_IDLE_MS = 1500
const TYPING_EXPIRY_MS = 3000

type RoomConnection = {
  roomId: string
  name: string
  onCodeUpdate: (code: string) => void
  onRoomUpdate: (members: RoomMember[]) => void
}

// Owns the room connection for the editor: one socket, one join per connection, one
// teardown. The room and name are given by the caller, which has already matched them
// against the URL, so this hook never discovers a room of its own.
export function useRoom({ roomId, name, onCodeUpdate, onRoomUpdate }: RoomConnection) {
  const router = useRouter()
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting")

  const socketRef = useRef<RoomSocket | null>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const joinedSocketIdRef = useRef<string | null>(null)
  const handlersRef = useRef({ onCodeUpdate, onRoomUpdate })

  // Kept current so a re-render of the caller never re-runs the connection effect.
  useEffect(() => {
    handlersRef.current = { onCodeUpdate, onRoomUpdate }
  })

  useEffect(() => {
    let socket: RoomSocket
    try {
      socket = initSocket()
    } catch {
      toast.error("Cannot connect to the DevSync server.", { duration: 4000 })
      router.push("/")
      return
    }

    joinedSocketIdRef.current = null

    // Socket.IO can reconnect the transport without React remounting, and the new
    // server socket has joined nothing. Keying on the socket id means every real
    // connection joins exactly once, whether it is the first or the fifth.
    const joinRoom = () => {
      if (!socket.id || joinedSocketIdRef.current === socket.id) return
      joinedSocketIdRef.current = socket.id
      socket.emit("joinRoom", { roomId, name })
    }

    const handleConnect = () => {
      setConnectionState("connected")
      joinRoom()
    }

    const handleDisconnect = (reason: string) => {
      setConnectionState("reconnecting")
      joinedSocketIdRef.current = null
      // Everything known about who is typing came from a roster this tab no longer has.
      setTypingUsers([])
      // The one reason Socket.IO will not retry on its own.
      if (reason === "io server disconnect") socket.connect()
    }

    const handleConnectError = () => {
      setConnectionState("reconnecting")
    }

    const handleCodeUpdate = (code: string) => {
      handlersRef.current.onCodeUpdate(code)
    }

    const handleRoomUpdate = (members: RoomMember[]) => {
      handlersRef.current.onRoomUpdate(members)
      const present = new Set(members.map((member) => member.id))
      setTypingUsers((prev) => prev.filter((user) => present.has(user.id)))
    }

    const handleUserTyping = ({ id, name }: { id: string; name: string }) => {
      setTypingUsers((prev) => [
        ...prev.filter((user) => user.id !== id),
        { id, name, timestamp: Date.now() },
      ])
    }

    const handleUserStoppedTyping = ({ id }: { id: string }) => {
      setTypingUsers((prev) => prev.filter((user) => user.id !== id))
    }

    socket.on("connect", handleConnect)
    socket.on("disconnect", handleDisconnect)
    socket.on("connect_error", handleConnectError)
    socket.on("codeUpdate", handleCodeUpdate)
    socket.on("updateRoom", handleRoomUpdate)
    socket.on("userTyping", handleUserTyping)
    socket.on("userStoppedTyping", handleUserStoppedTyping)

    socketRef.current = socket

    if (socket.connected) handleConnect()

    return () => {
      socket.off("connect", handleConnect)
      socket.off("disconnect", handleDisconnect)
      socket.off("connect_error", handleConnectError)
      socket.off("codeUpdate", handleCodeUpdate)
      socket.off("updateRoom", handleRoomUpdate)
      socket.off("userTyping", handleUserTyping)
      socket.off("userStoppedTyping", handleUserStoppedTyping)

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = null
      }

      // The server reads the room from the socket, so leaveRoom needs no argument.
      socket.emit("leaveRoom")
      socket.disconnect()
      socketRef.current = null
      joinedSocketIdRef.current = null
    }
  }, [roomId, name, router])

  useEffect(() => {
    const interval = setInterval(() => {
      setTypingUsers((prev) => prev.filter((user) => Date.now() - user.timestamp < TYPING_EXPIRY_MS))
    }, TYPING_EXPIRY_MS)

    return () => clearInterval(interval)
  }, [])

  // DevSync syncs whole documents last-write-wins, so an edit made while offline has
  // nothing safe to merge into. Nothing is queued; the editor is read-only meanwhile.
  const sendCodeChange = (code: string) => {
    const socket = socketRef.current
    if (!socket?.connected) return

    socket.emit("codeChange", { roomId, code })
    socket.emit("userTyping", { roomId, name })

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (socket.connected) socket.emit("userStoppedTyping", { roomId, name })
      typingTimeoutRef.current = null
    }, TYPING_IDLE_MS)
  }

  return { typingUsers, sendCodeChange, connectionState }
}
