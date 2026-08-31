"use client"

import { useEffect, useState } from "react"
import Editor from "react-simple-code-editor"
import Prism from "prismjs"
import { Download, Play } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRoom } from "@/hooks/use-room"
import { useCodeExecution } from "@/hooks/use-code-execution"
import { downloadCode } from "@/lib/download-code"
import { EditorStatus } from "@/components/editor/editor-status"
import { OutputPanel } from "@/components/editor/output-panel"
import type { ConnectionState, RoomMember } from "@/types/realtime"

import "prismjs/components/prism-javascript"
import "prismjs/components/prism-typescript"
import "prismjs/components/prism-c"
import "prismjs/components/prism-cpp"
import "prismjs/components/prism-java"
import "prismjs/components/prism-python"
import "prismjs/themes/prism-tomorrow.css"

export function CodeEditor({
  roomId,
  name,
  onRoomUpdate,
  onConnectionChange,
}: {
  roomId: string
  name: string
  onRoomUpdate: (members: RoomMember[]) => void
  onConnectionChange: (state: ConnectionState) => void
}) {
  const [code, setCode] = useState("")
  const [language, setLanguage] = useState("javascript")
  const { typingUsers, sendCodeChange, connectionState } = useRoom({
    roomId,
    name,
    onCodeUpdate: setCode,
    onRoomUpdate,
  })
  const { output, runCode, isRunning } = useCodeExecution(code, language)

  useEffect(() => {
    onConnectionChange(connectionState)
  }, [connectionState, onConnectionChange])

  const handleDownload = () => {
    try {
      const filename = downloadCode(code, language)
      toast(`Downloaded ${filename}.`)
    } catch {
      toast.error("Could not download the code.")
    }
  }

  const handleValueChange = (newCode: string) => {
    setCode(newCode)
    sendCodeChange(newCode)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-3 sm:h-11 sm:px-4">
        <span className="font-mono text-xs tracking-[0.15em] text-muted-foreground">
          SHARED CODE
        </span>
        <div className="flex items-center gap-2 sm:gap-3">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger size="sm" className="w-[120px] max-sm:h-9 sm:w-[130px]" aria-label="Language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="javascript">JavaScript</SelectItem>
              <SelectItem value="typescript">TypeScript</SelectItem>
              <SelectItem value="python">Python</SelectItem>
              <SelectItem value="cpp">C++</SelectItem>
              <SelectItem value="java">Java</SelectItem>
            </SelectContent>
          </Select>
          <span className="hidden font-mono text-xs text-muted-foreground md:inline">
            Ctrl+Alt+N
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground hover:text-foreground sm:size-8"
            onClick={handleDownload}
            disabled={!code.trim()}
            aria-label="Download code"
            title="Download code"
          >
            <Download />
          </Button>
          <Button size="sm" className="max-sm:h-9" onClick={runCode} disabled={isRunning}>
            <Play aria-hidden />
            {isRunning ? "Running…" : "Run"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 overflow-auto">
          <Editor
            value={code}
            onValueChange={handleValueChange}
            highlight={(value) => Prism.highlight(value, Prism.languages[language], language)}
            padding={16}
            readOnly={connectionState !== "connected"}
            placeholder="Start typing…"
            textareaClassName="focus:outline-none placeholder:text-muted-foreground placeholder:[-webkit-text-fill-color:var(--muted-foreground)]"
            className="min-h-full w-full font-mono text-sm leading-6"
          />
        </div>
        <OutputPanel output={output} isRunning={isRunning} />
      </div>

      <EditorStatus connectionState={connectionState} typingUsers={typingUsers} />
    </div>
  )
}
