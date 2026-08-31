import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useCodeExecution } from "@/hooks/use-code-execution"
import { executeCode } from "@/services/execution-api"
import { toast } from "sonner"

vi.mock("@/services/execution-api", () => ({ executeCode: vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const runs = vi.mocked(executeCode)
const success = vi.mocked(toast.success)
const failure = vi.mocked(toast.error)

function renderHookWith(code: string, language: string) {
  return renderHook(({ code, language }) => useCodeExecution(code, language), {
    initialProps: { code, language },
  })
}

function pressRunShortcut(init: KeyboardEventInit) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }))
  })
}

beforeEach(() => {
  runs.mockResolvedValue({ output: "", error: "", status: "Success" })
})

afterEach(cleanup)

describe("running the editor's current document", () => {
  it("runs the code and language the editor is showing", async () => {
    const { result } = renderHookWith("console.log(1)", "javascript")

    await act(async () => {
      await result.current.runCode()
    })

    expect(runs).toHaveBeenCalledWith("console.log(1)", "javascript")
  })

  it("runs the latest code and language after the editor changes", async () => {
    const { result, rerender } = renderHookWith("console.log(1)", "javascript")

    rerender({ code: "print('hi')", language: "python" })
    await act(async () => {
      await result.current.runCode()
    })

    expect(runs).toHaveBeenCalledTimes(1)
    expect(runs).toHaveBeenCalledWith("print('hi')", "python")
  })

  it("ignores a second run while one is still in flight", async () => {
    let finish: (result: { output: string; error: string; status: string }) => void = () => {}
    runs.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )

    const { result } = renderHookWith("console.log(1)", "javascript")

    let pending!: Promise<void>
    act(() => {
      pending = result.current.runCode()
      result.current.runCode()
    })
    expect(runs).toHaveBeenCalledTimes(1)
    expect(result.current.isRunning).toBe(true)

    await act(async () => {
      finish({ output: "1\n", error: "", status: "Success" })
      await pending
    })
    expect(result.current.isRunning).toBe(false)
  })
})

describe("reporting the result", () => {
  it("shows the output and a success toast when the run succeeds", async () => {
    runs.mockResolvedValue({ output: "café 👋\n", error: "", status: "Success" })
    const { result } = renderHookWith("console.log('café 👋')", "javascript")

    await act(async () => {
      await result.current.runCode()
    })

    expect(result.current.output).toBe("café 👋\n")
    expect(success).toHaveBeenCalledWith("Code executed successfully!")
    expect(failure).not.toHaveBeenCalled()
  })

  it("shows the diagnostic and a failure toast when the run reports an error", async () => {
    runs.mockResolvedValue({
      output: "",
      error: "SyntaxError: unexpected token",
      status: "Compilation Error",
    })
    const { result } = renderHookWith("const =", "javascript")

    await act(async () => {
      await result.current.runCode()
    })

    expect(result.current.output).toBe("SyntaxError: unexpected token")
    expect(failure).toHaveBeenCalledWith("Execution failed")
    expect(success).not.toHaveBeenCalled()
  })
})

describe("the run keyboard shortcut", () => {
  it("runs the same code Ctrl+Alt+N is pressed over", async () => {
    runs.mockResolvedValue({ output: "hi\n", error: "", status: "Success" })
    const { result } = renderHookWith("print('hi')", "python")

    pressRunShortcut({ ctrlKey: true, altKey: true, key: "N" })

    await waitFor(() => expect(result.current.output).toBe("hi\n"))
    expect(runs).toHaveBeenCalledExactlyOnceWith("print('hi')", "python")
  })

  it("ignores keystrokes that are not the run shortcut", () => {
    renderHookWith("print('hi')", "python")

    pressRunShortcut({ key: "n" })
    pressRunShortcut({ ctrlKey: true, key: "n" })
    pressRunShortcut({ altKey: true, key: "n" })
    pressRunShortcut({ ctrlKey: true, altKey: true, key: "s" })

    expect(runs).not.toHaveBeenCalled()
  })
})
