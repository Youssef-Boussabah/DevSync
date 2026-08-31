import { beforeEach, describe, expect, it, vi } from "vitest"
import { executeCode } from "@/services/execution-api"

const FALLBACK_ERROR = "Execution service is unavailable. Try again."

let fetchMock: ReturnType<typeof vi.fn>

function respondWith(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  fetchMock.mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  })
}

function lastRequest() {
  const [url, options] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return { url, options, body: JSON.parse(String(options.body)) }
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "http://localhost:5000")
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

describe("addressing the DevSync server", () => {
  it("posts the run to the server's execute endpoint", async () => {
    respondWith({ output: "", error: "", status: "Success" })

    await executeCode("console.log(1)", "javascript")

    expect(lastRequest().url).toBe("http://localhost:5000/api/execute")
    expect(lastRequest().options.method).toBe("POST")
  })

  it("does not double the slash when the backend URL has a trailing one", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://devsync.example.com///")
    respondWith({ output: "", error: "", status: "Success" })

    await executeCode("console.log(1)", "javascript")

    expect(lastRequest().url).toBe("https://devsync.example.com/api/execute")
  })

  it("sends only the source and the language name", async () => {
    respondWith({ output: "", error: "", status: "Success" })

    await executeCode("print('café 👋')", "python")

    expect(lastRequest().body).toEqual({
      sourceCode: "print('café 👋')",
      language: "python",
    })
  })
})

describe("interpreting the server's answer", () => {
  it("returns the output, error and status of a successful run", async () => {
    respondWith({ output: "hello\n", error: "", status: "Success" })

    expect(await executeCode("console.log('hello')", "javascript")).toEqual({
      output: "hello\n",
      error: "",
      status: "Success",
    })
  })

  it("passes a failed run's diagnostic through unchanged", async () => {
    respondWith({ output: "", error: "SyntaxError: unexpected token", status: "Compilation Error" })

    expect(await executeCode("const =", "javascript")).toEqual({
      output: "",
      error: "SyntaxError: unexpected token",
      status: "Compilation Error",
    })
  })

  it("shows the server's own message for a non-2xx response", async () => {
    respondWith({ error: "Too many runs. Try again in a minute." }, { ok: false, status: 429 })

    expect(await executeCode("console.log(1)", "javascript")).toEqual({
      output: "",
      error: "Too many runs. Try again in a minute.",
      status: "Error",
    })
  })
})

describe("failing safely", () => {
  it("falls back to a generic message when a failure carries no JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON")
      },
    })

    expect(await executeCode("console.log(1)", "javascript")).toEqual({
      output: "",
      error: FALLBACK_ERROR,
      status: "Error",
    })
  })

  it("uses the same message when the request never reaches the server", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))

    expect(await executeCode("console.log(1)", "javascript")).toEqual({
      output: "",
      error: FALLBACK_ERROR,
      status: "Error",
    })
  })

  it("reports the failure without a request when no backend URL is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "")

    expect(await executeCode("console.log(1)", "javascript")).toEqual({
      output: "",
      error: FALLBACK_ERROR,
      status: "Error",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
