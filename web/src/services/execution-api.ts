export type ExecutionResult = {
  output: string
  error: string
  status: string
}

const FALLBACK_ERROR = "Execution service is unavailable. Try again."

// Execution goes through the DevSync server, which holds the Judge0 credential and maps
// the language name to a runtime. The browser never talks to the execution vendor.
export async function executeCode(sourceCode: string, language: string): Promise<ExecutionResult> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  if (!backendUrl) {
    return { output: "", error: FALLBACK_ERROR, status: "Error" }
  }

  try {
    const response = await fetch(`${backendUrl.replace(/\/+$/, "")}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceCode, language }),
    })

    const data = (await response.json().catch(() => null)) as Partial<ExecutionResult> | null

    // The server sends a message meant for the user; show it as-is rather than wrapping it.
    if (!response.ok) {
      return {
        output: "",
        error: typeof data?.error === "string" ? data.error : FALLBACK_ERROR,
        status: "Error",
      }
    }

    return {
      output: typeof data?.output === "string" ? data.output : "",
      error: typeof data?.error === "string" ? data.error : "",
      status: typeof data?.status === "string" ? data.status : "",
    }
  } catch {
    return { output: "", error: FALLBACK_ERROR, status: "Error" }
  }
}
