// One file per language, matching the five values the editor's language select offers.
const FILENAMES: Record<string, string> = {
  javascript: "main.js",
  typescript: "main.ts",
  python: "main.py",
  cpp: "main.cpp",
  java: "Main.java",
}

export function downloadFilename(language: string) {
  return FILENAMES[language]
}

// Saves the editor's current text as-is and returns the filename it used.
export function downloadCode(code: string, language: string) {
  const filename = downloadFilename(language)
  const url = URL.createObjectURL(new Blob([code], { type: "text/plain;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename

  // Some browsers ignore the click unless the anchor is in the document.
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)

  return filename
}
