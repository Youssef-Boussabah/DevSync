import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { JoinRoomGate } from "@/components/room/join-room-gate"
import { getRoomSession } from "@/lib/room-session"
import { toast } from "sonner"

// next/link needs an App Router mounted above it; the gate only uses it for the two
// "back home" links, so a plain anchor stands in.
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const ROOM_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

function renderGate(suggestedName = "Alice") {
  const onJoin = vi.fn()
  render(<JoinRoomGate roomId={ROOM_ID} suggestedName={suggestedName} onJoin={onJoin} />)
  return { onJoin, form: screen.getByRole("button", { name: "Join room" }).closest("form")! }
}

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

describe("the room invite gate", () => {
  it("shows the room it is guarding without offering to change it", () => {
    renderGate()

    expect(screen.getByText(/ROOM ·/).textContent).toContain("A1B2…7890")
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    expect(screen.getByRole("textbox")).toHaveProperty("id", "join-name")
  })

  it("offers the name the tab last used", () => {
    renderGate("Alice")

    expect(screen.getByRole("textbox")).toHaveProperty("value", "Alice")
  })

  it("stores the trimmed session and joins when the form is submitted", () => {
    const { onJoin, form } = renderGate("")

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Bob  " } })
    fireEvent.submit(form)

    expect(getRoomSession()).toEqual({ roomId: ROOM_ID, name: "Bob" })
    expect(onJoin).toHaveBeenCalledExactlyOnceWith("Bob")
  })

  it("joins when the Join room button is clicked", () => {
    const { onJoin } = renderGate("Alice")

    fireEvent.click(screen.getByRole("button", { name: "Join room" }))

    expect(onJoin).toHaveBeenCalledExactlyOnceWith("Alice")
  })

  it("refuses an empty name and stores nothing", () => {
    const { onJoin, form } = renderGate("Alice")

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } })
    fireEvent.submit(form)

    expect(onJoin).not.toHaveBeenCalled()
    expect(getRoomSession()).toBeNull()
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Enter your name.")
  })
})
