"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export function OutputPanel({
  output,
  isRunning,
}: {
  output: string
  isRunning: boolean
}) {
  // Collapse state only applies below lg; desktop output is always visible.
  const [open, setOpen] = useState(false)
  const prevOutputRef = useRef(output)

  useEffect(() => {
    if (isRunning) setOpen(true)
  }, [isRunning])

  useEffect(() => {
    if (output && output !== prevOutputRef.current) setOpen(true)
    prevOutputRef.current = output
  }, [output])

  return (
    <section
      aria-label="Output"
      className="flex min-h-0 flex-col border-t lg:w-[320px] lg:shrink-0 lg:border-l lg:border-t-0"
    >
      <h2 className="hidden shrink-0 px-4 pb-2 pt-3 font-mono text-[10px] tracking-[0.2em] text-muted-foreground lg:block">
        OUTPUT
      </h2>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Collapse output" : "Expand output"}
        className="flex h-10 shrink-0 items-center justify-between px-4 font-mono text-[10px] tracking-[0.2em] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset lg:hidden"
      >
        OUTPUT
        <ChevronDown
          className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto px-4 pb-4 font-mono text-sm max-lg:max-h-56",
          !open && "max-lg:hidden"
        )}
      >
        {isRunning ? (
          <p className="text-muted-foreground">Running…</p>
        ) : output ? (
          <pre className="whitespace-pre-wrap break-words">{output}</pre>
        ) : (
          <p className="text-muted-foreground">Run the code to see output.</p>
        )}
      </div>
    </section>
  )
}
