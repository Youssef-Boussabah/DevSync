"use client"

import { useState } from "react"
import { WorkspaceHeader } from "@/components/workspace/workspace-header"
import { CodeEditor } from "@/components/editor/code-editor"
import type { ConnectionState, RoomMember } from "@/types/realtime"

export function Workspace({ roomId, name }: { roomId: string; name: string }) {
  const [members, setMembers] = useState<RoomMember[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting")

  return (
    <div className="flex h-svh flex-col">
      <WorkspaceHeader roomId={roomId} members={members} connectionState={connectionState} />
      <CodeEditor
        roomId={roomId}
        name={name}
        onRoomUpdate={setMembers}
        onConnectionChange={setConnectionState}
      />
    </div>
  )
}
