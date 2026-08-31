import { beforeEach, describe, expect, it, vi } from "vitest"
import { downloadCode, downloadFilename } from "@/lib/download-code"

// jsdom implements neither object-URL method, and neither a real navigation nor a real
// file write belongs in a test run, so the Blob and the clicked anchor are captured here.
let lastBlob: Blob | null = null
let revoked: string[] = []
let clicked: { download: string; href: string; wasAttached: boolean }[] = []

beforeEach(() => {
  lastBlob = null
  revoked = []
  clicked = []

  URL.createObjectURL = vi.fn((blob: Blob) => {
    lastBlob = blob
    return "blob:devsync/test"
  })
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url)
  })

  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({
      download: this.download,
      href: this.href,
      wasAttached: document.body.contains(this),
    })
  })
})

async function blobText(blob: Blob) {
  return Buffer.from(await blob.arrayBuffer()).toString("utf8")
}

describe("choosing a filename for a language", () => {
  it("maps every language the editor offers to its conventional filename", () => {
    expect(downloadFilename("javascript")).toBe("main.js")
    expect(downloadFilename("typescript")).toBe("main.ts")
    expect(downloadFilename("python")).toBe("main.py")
    expect(downloadFilename("cpp")).toBe("main.cpp")
    expect(downloadFilename("java")).toBe("Main.java")
  })
})

describe("downloading the editor contents", () => {
  it("names the file after the selected language", () => {
    expect(downloadCode("print('hi')", "python")).toBe("main.py")
    expect(downloadCode("public class Main {}", "java")).toBe("Main.java")

    expect(clicked.map((a) => a.download)).toEqual(["main.py", "Main.java"])
    expect(clicked[0].href).toBe("blob:devsync/test")
  })

  it("writes the source exactly as typed, with no added banner or trailing newline", async () => {
    const source = 'const greeting = "hello"\nconsole.log(greeting)'

    downloadCode(source, "javascript")

    expect(await blobText(lastBlob!)).toBe(source)
  })

  it("preserves non-ASCII source as UTF-8", async () => {
    const source = '// café 你好 👋\nconsole.log("café 你好 👋")'

    downloadCode(source, "typescript")

    expect(await blobText(lastBlob!)).toBe(source)
    expect(lastBlob!.type).toBe("text/plain;charset=utf-8")
  })

  it("clicks the anchor while it is in the document, then removes it", () => {
    downloadCode("int main() {}", "cpp")

    expect(clicked[0].wasAttached).toBe(true)
    expect(document.querySelectorAll("a")).toHaveLength(0)
  })

  it("revokes the object URL it created", () => {
    downloadCode("int main() {}", "cpp")

    expect(revoked).toEqual(["blob:devsync/test"])
  })
})
