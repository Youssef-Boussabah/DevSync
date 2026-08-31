"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { executeCode } from "@/services/execution-api"

// One execution path shared by the Run button and Ctrl+Alt+N. The keyboard
// listener is registered once and reads the latest code/language through a ref,
// so it does not churn on every keystroke.
export function useCodeExecution(code: string, language: string) {
  const [output, setOutput] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const latestRef = useRef({ code, language })
  const runningRef = useRef(false)

  useEffect(() => {
    latestRef.current = { code, language }
  })

  const runCode = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    setIsRunning(true)

    // The language picked in the toolbar is what runs; the server maps it to a runtime.
    const { code, language } = latestRef.current

    try {
      const result = await executeCode(code, language)
      if (result.error) {
        toast.error("Execution failed")
        setOutput(result.error)
      } else {
        setOutput(result.output)
        toast.success("Code executed successfully!")
      }
    } finally {
      runningRef.current = false
      setIsRunning(false)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.altKey || e.key.toLowerCase() !== "n") return
      e.preventDefault()
      runCode()
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [runCode])

  return { output, runCode, isRunning }
}
