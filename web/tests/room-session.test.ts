import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearRoomSession,
  getRoomSession,
  setRoomSession,
  shortenRoomId,
} from "@/lib/room-session"

const STORAGE_KEY = "devsync-room-session"

afterEach(() => {
  window.sessionStorage.clear()
})

describe("storing a room session", () => {
  it("trims the room id and the name before storing them", () => {
    const stored = setRoomSession({ roomId: "  room-42  ", name: "  Alice  " })

    expect(stored).toEqual({ roomId: "room-42", name: "Alice" })
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)!)).toEqual({
      roomId: "room-42",
      name: "Alice",
    })
  })

  it("reads back a session it has just written", () => {
    setRoomSession({ roomId: "room-42", name: "Alice" })

    expect(getRoomSession()).toEqual({ roomId: "room-42", name: "Alice" })
  })

  it("rejects a whitespace-only room id or name without writing anything", () => {
    expect(setRoomSession({ roomId: "   ", name: "Alice" })).toBeNull()
    expect(setRoomSession({ roomId: "room-42", name: "   " })).toBeNull()
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("reports failure instead of throwing when storage refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError")
    })

    expect(setRoomSession({ roomId: "room-42", name: "Alice" })).toBeNull()
  })
})

describe("reading a room session", () => {
  it("returns null when no session has been stored", () => {
    expect(getRoomSession()).toBeNull()
  })

  it("returns null for malformed JSON rather than throwing", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{ not json")

    expect(getRoomSession()).toBeNull()
  })

  it("returns null when the stored object is the wrong shape", () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ roomId: "room-42" }))
    expect(getRoomSession()).toBeNull()

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ roomId: 42, name: "Alice" }))
    expect(getRoomSession()).toBeNull()

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ roomId: " ", name: "Alice" }))
    expect(getRoomSession()).toBeNull()
  })

  it("returns null instead of throwing when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("storage is disabled", "SecurityError")
    })

    expect(getRoomSession()).toBeNull()
  })
})

describe("clearing a room session", () => {
  it("removes the stored session", () => {
    setRoomSession({ roomId: "room-42", name: "Alice" })
    clearRoomSession()

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(getRoomSession()).toBeNull()
  })

  it("swallows a storage failure", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("storage is disabled", "SecurityError")
    })

    expect(() => clearRoomSession()).not.toThrow()
  })
})

describe("shortening a room id for display", () => {
  it("leaves a short room id untouched", () => {
    expect(shortenRoomId("room-42")).toBe("room-42")
    expect(shortenRoomId("123456789012")).toBe("123456789012")
  })

  it("renders a long room id as FIRST4…LAST4 in upper case", () => {
    expect(shortenRoomId("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe("A1B2…7890")
  })
})
