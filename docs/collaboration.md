# Collaboration model

How a room works, what is synchronised, and what this version deliberately does not do.

## Rooms and room IDs

A room ID is a UUID v4, generated in the browser when someone starts a room from
`/collaborate`. It is only ever an opaque string to the backend: a room exists because a
socket joined it, not because anything created it in advance.

The room URL is `/room/<id>`, built with `encodeURIComponent`. The route decodes the
segment, trims it, and calls `notFound()` if the result is empty or longer than 64
characters — the same ceiling the server enforces — so a path that could never name a
real room is a 404 rather than a join attempt.

For display, `shortenRoomId` renders anything longer than 12 characters as
`FIRST4…LAST4` in upper case. The URL, `sessionStorage` and the clipboard always carry
the full ID.

## Tab identity: the room session

Opening a room link does not join it. `RoomPage` reads `sessionStorage` after mount and
decides between two states:

- The stored session names *this* room → the tab is already a participant, and the
  workspace renders with the stored display name.
- There is no session, or it names a different room → the join gate renders. If a
  session for another room exists, its name is offered back as a suggestion, but the
  user still has to submit.

The record lives under the key `devsync-room-session` and holds `{ roomId, name }`.
`sessionStorage` rather than `localStorage` is deliberate: two tabs in the same browser
are two different participants, which is also the easiest way to try the product alone.

Every read is defensive. Malformed JSON, a wrong-shaped object, or storage blocked
outright all resolve to "no session" instead of throwing.

The socket is not opened until the tab is known to belong to the room. The workspace —
the component that opens it — is not rendered before that.

## Participant identity

**Identity on the wire is `socket.id`.** The server keys membership on it:

```js
rooms[roomId] = [{ id: socket.id, name }, ...]
```

Display names are labels only, and two participants may share one. They stay distinct in
the roster, in the typing indicator, and in every membership check, because none of that
uses the name.

Two consequences follow:

- A repeated `joinRoom` from the same socket adds nobody. The server finds the existing
  entry and keeps the name that socket first joined under. There is no rename feature.
- A reconnect is a *new* identity. Socket.IO's reconnect produces a new server-side
  socket with a new id, so the returning tab is a new roster entry.

## Join flow

1. The tab submits a name in the join gate. `setRoomSession` stores the trimmed
   `{ roomId, name }`; if storage refuses, the join is abandoned with an error toast
   rather than proceeding into a room the tab cannot remember.
2. The workspace mounts and `useRoom` calls `initSocket()`, which opens one socket per
   browser tab over the `websocket` transport with a 10-second connect timeout. If
   `NEXT_PUBLIC_BACKEND_URL` is unset, `initSocket` throws, the user is told, and they
   are sent back to the landing page.
3. On `connect`, the client emits `joinRoom` with `{ roomId, name }`. The emit is keyed
   on `socket.id`, so every real connection joins exactly once whether it is the first
   or the fifth.
4. The server validates the payload: both fields must be non-empty strings after
   trimming, the room ID at most 64 characters and the name at most 40. An invalid
   payload is logged and dropped.
5. If the socket was in another room, it is removed from it first — a socket belongs to
   one room at a time.
6. Any pending cleanup timer for the room is cancelled.
7. The room is created if absent, the socket is added to the roster, and the server
   emits `updateRoom` (the full roster) to everyone and `codeUpdate` (the room's current
   document) to the joining socket alone.

## Leave flow

`leaveRoom` takes no argument — the server reads the room from the socket's own record
rather than trusting a payload. Leaving happens in three ways, all through the same
path:

- The workspace unmounts (navigating away), which emits `leaveRoom` and disconnects.
- The socket disconnects for any reason.
- The socket joins a different room.

The server clears the socket's recorded room and name, filters it out of the roster, and
emits the new roster to the remaining members. If the roster is now empty, the grace
timer starts.

## The document: `codeChange` and `codeUpdate`

Two events carry the shared text.

**`codeChange`** — client to server, `{ roomId, code }`. The server rejects it unless:

- `code` is a string;
- the socket has a recorded room and is actually in that room's roster;
- any `roomId` in the payload matches the socket's own room;
- the code is at most 1 MiB of UTF-8 (measured in bytes, not characters).

Socket.IO's own `maxHttpBufferSize` is set slightly above that limit so the application
check is the one that rejects oversized documents.

**`codeUpdate`** — server to client, the document as a plain string. It is sent to a
joining socket (the room's current text) and relayed to everyone *except* the sender
after an accepted `codeChange`.

### Whole-document synchronisation

Every keystroke sends the entire document, and every recipient replaces its editor
contents with what arrived. `roomCode[roomId]` is simply the last accepted string.

**This is not a CRDT and not operational transform.** There is no merge, no rebase and
no intent preservation. The rule is last write wins, and it applies to the whole
document, not to a region of it.

In practice:

- Two people editing different parts of the file at the same moment will still fight,
  because each is sending a full document that does not contain the other's change. The
  later message overwrites the earlier one wholesale.
- The loser gets no warning and no conflict marker. Their text is simply replaced on the
  next `codeUpdate`.
- It works well for the case it was built for: people taking turns, pairing, or
  reviewing together, with one person driving at a time.

Do not treat DevSync v1 as safe for simultaneous editing of the same document by several
people. Making that safe requires a CRDT or OT layer, which is a different product.

## Typing indicators

`codeChange` is accompanied by `userTyping`. After 1.5 seconds without a keystroke, the
client emits `userStoppedTyping`.

The server ignores the name in the payload and broadcasts `{ id: socket.id, name }`
using the name it recorded at join time. A client cannot make the indicator claim
someone else's name, and same-name participants remain separately tracked by id.

The client also expires indicators after 3 seconds without a refresh, in case a stop
event never arrives, and clears them entirely on disconnect — everything it knew about
who was typing came from a roster the tab no longer has.

## Reconnect and rejoin

Socket.IO retries on its own. `useRoom` listens for `disconnect` and `connect_error` and
puts the UI into a `reconnecting` state; when the transport comes back, `connect` fires,
`joinRoom` is emitted with the new socket id, and the server answers with the room's
current document.

The one case Socket.IO will not retry is `io server disconnect`, so the hook calls
`socket.connect()` explicitly for that reason.

### The editor is read-only while disconnected

```jsx
readOnly={connectionState !== "connected"}
```

This is a deliberate consequence of whole-document sync. An edit made while offline has
nothing safe to merge into: sending it on reconnect would overwrite whatever the room
did in the meantime with a document that never saw those changes. Nothing is queued, and
the status row says editing has paused rather than promising a sync.

## The empty-room grace window

When the last participant leaves, the room is not deleted. A 15-second timer starts:

```js
const ROOM_EMPTY_GRACE_MS = 15 * 1000;
```

- During the window the room still exists, with an empty member list and its document
  intact. Anyone who joins in that time cancels the timer and receives the document
  back — a refresh, a brief network drop, or a reconnect costs nothing.
- When the timer fires it **re-checks occupancy**. If someone has rejoined, it does
  nothing. This is what stops a timer left over from an earlier emptying from deleting a
  room that has since been repopulated.
- If the room is still empty, `rooms[roomId]` and `roomCode[roomId]` are deleted.

## Opening a room URL after its state is gone

The URL keeps working. There is no tombstone and no error page.

Joining a room ID the server does not know creates it: an empty roster and an empty
document. So reopening `/room/<id>` after the grace window has expired puts you in a
room with that ID and a blank editor — a fresh room that happens to share a name with a
discarded one.

An expired room is therefore **not** a 404. The 404 page is only for URLs that could
never name a room at all.
