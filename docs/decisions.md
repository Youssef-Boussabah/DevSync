# Design decisions

Why DevSync v1 is built the way it is, and what each choice cost.

The recurring theme: this is a small, ephemeral, single-instance collaborative editor.
Most of the decisions below are about *not* building the infrastructure a persistent
multi-tenant product would need.

## Next.js and React for the frontend

The frontend is a handful of routes — a landing page, a room-access page, and the room
workspace — around one heavily stateful component. React fits the workspace; Next.js
supplies the routing, the build, and a deployment target that needs no configuration.

The App Router is used for file-based routing and for one piece of real server-side
work: `/room/[id]` decodes and validates the path segment before any client component
mounts, so a malformed room URL is a 404 rather than a join attempt. Everything below
that is a client component, because it all depends on a socket and on browser storage.

There is no server-side data fetching, no server action and no API route in the Next.js
app. All dynamic behaviour goes to the Express backend.

## A separate Express backend rather than Next.js API routes

Two reasons, and the first is decisive.

**Socket.IO needs a long-lived server.** It holds open WebSocket connections and
in-memory room state. Next.js API routes and Vercel's platform are serverless and
request-scoped: instances are ephemeral and there is no shared memory between them.
Rooms as this product defines them cannot live there.

**The execution proxy needs a trusted process.** Something has to hold the JDoodle
credentials and not be the browser. A backend that already exists for the socket is the
natural place for it.

The cost is two deploy targets and a CORS boundary between them.

## Socket.IO rather than raw WebSocket

Socket.IO supplies, out of the box, the things this product would otherwise hand-roll:

- **Rooms** — server-side grouping with `socket.join` and `socket.to(room).emit`, which
  is exactly the broadcast primitive DevSync needs.
- **Reconnection** — automatic retry with backoff. The client only has to handle the one
  case Socket.IO will not retry (`io server disconnect`).
- **An event model** — named events with structured payloads, rather than a hand-written
  message envelope and a switch statement.

Its cost is a heavier client and a protocol that is not plain WebSocket. The client is
pinned to the `websocket` transport rather than allowing HTTP long-polling to start,
which keeps the connection behaviour predictable.

## `sessionStorage` for the room session

A tab that opens a room link needs to know whether it has already joined and under what
name, and that has to survive a refresh.

`sessionStorage` is scoped to a tab; `localStorage` is scoped to the browser. The
difference is the point: **two tabs in the same browser are two different participants**.
That matches the identity model — one socket per tab, identity keyed on the socket — and
it makes the product trivially testable by one person with two tabs.

The cost is that opening the same room in a new tab requires entering a name again. That
is the correct behaviour, not a limitation: the new tab genuinely is a new participant.

Every read is defensive. Blocked storage, malformed JSON and wrong-shaped objects all
resolve to "no session" rather than throwing, so a hardened browser degrades to "you
will be asked for a name" instead of a broken page.

## Participant identity is `socket.id`

The alternative would be a generated participant ID carried by the client. That was
rejected: an identifier the client owns is an identifier the client can forge or
duplicate, and it needs its own lifecycle handling on reconnect.

`socket.id` is assigned by the server, unique per connection, and already the key for
everything Socket.IO does. Using it means:

- membership checks, typing broadcasts and roster updates all key on the same thing;
- a client cannot claim to be another participant, because it never supplies its
  identity;
- there is one lifecycle to reason about — the connection's.

The consequence is that **a reconnect is a new identity**. The returning tab is a new
roster entry with a new id. For a presence list in an ephemeral room that is acceptable;
for anything that needed continuity of a person across connections, it would not be.

## Display names may duplicate

Names are labels. Two people called "Sam" stay distinct everywhere, because nothing that
matters uses the name.

Enforcing uniqueness would mean rejecting a join, or silently renaming someone, over a
cosmetic field — in a room people enter by pasting a link and typing whatever they like.
Neither is worth it.

The server does defend the label's integrity: typing events are broadcast with the name
the socket **joined under**, not the one the payload claims, so a client cannot make the
indicator display someone else's name. There is no rename feature, so the first name a
socket joins with is the one that sticks.

## No database, and ephemeral rooms

There is nothing to persist. A DevSync room is a scratch space for a conversation that
is happening now — pairing, an interview, explaining a bug. When everyone leaves, the
reason for the document leaves with them.

Adding a database would mean adding, at minimum: a schema and migrations, a retention
policy, a deletion story, an ownership model to decide who may read a stored room, and a
hosted database in the deployment. That is most of the work of a different product, and
all of it before the first useful feature.

The honest cost is stated plainly rather than hidden: a restart or redeploy drops every
active room, and nothing is recoverable. The README and the UI both say so.

## The 15-second grace window

Deleting a room the instant it empties would be correct and unusable. Refreshing the
page, losing WiFi for a moment, or closing a tab to reopen the link would all destroy
the document.

Fifteen seconds is long enough to cover a refresh and a brief drop, short enough that
rooms remain genuinely ephemeral and memory is not held for abandoned work.

The subtle part is the **occupancy re-check when the timer fires**. Without it, a timer
started by an earlier emptying could delete a room somebody has since rejoined. With it,
the timer is advisory: it deletes only what is still empty at the moment it runs.

## The editor is read-only while disconnected

This falls directly out of whole-document sync. An edit made while offline has nothing
safe to merge into — sending it on reconnect would overwrite whatever the room did in
the meantime with a document that never saw those changes.

The alternatives were: queue offline edits and overwrite on reconnect (silent data loss
for everyone else), or attempt a merge (which requires the CRDT this version does not
have). Pausing is the only option that cannot destroy someone else's work.

The status row says editing has paused rather than promising a sync, so the behaviour is
visible instead of mysterious.

## Whole-document synchronisation for v1

Every keystroke sends the entire document; the receiver replaces its contents. Last write
wins.

This is the simplest thing that works, and it is genuinely correct for the primary use
case — people taking turns, with one person driving. It has no merge logic to get wrong,
no hidden state, and no failure mode more complex than "the later message won".

The cost is real and is not hidden anywhere in the product: **two people typing at the
same moment will overwrite each other**, even in different parts of the file, because
each is sending a full document that does not contain the other's change. The loser gets
no warning.

Documents are capped at 1 MiB of UTF-8 per message, which bounds what a single event can
cost.

## No CRDT or OT

A CRDT (Yjs, Automerge) or an OT engine is what makes simultaneous editing safe. It was
deliberately left out of v1.

Adopting one is not a library swap. It changes the data model from "a string" to "a
shared document type", changes the wire protocol from "the text" to "updates and state
vectors", requires an editor binding rather than a plain controlled textarea, and brings
its own persistence and awareness questions. It would also make the backend's state
non-trivial to reason about — which is precisely what keeps this version small.

For an ephemeral turn-taking editor, the added complexity buys a guarantee the product
does not currently promise. The right time to adopt it is when simultaneous editing
becomes a requirement, and at that point it should be designed for, not retrofitted.

## The execution provider is proxied through the backend

The browser could call the execution provider directly. It must not.

The JDoodle Compiler API is authenticated with a Client ID and Client Secret and is
metered. A credential in the browser is a credential anyone can read from the bundle and
spend — and in a Next.js app, anything the client can read is public by definition.
Proxying is the only way to keep a metered third-party credential private while still
letting a browser trigger runs.

Proxying also puts DevSync in control of the submission: the browser sends a language
*name*, and the server owns the mapping to a runtime and version index, the size limit,
the rate limit and the timeout. A client cannot request a runtime the product does not
offer, pin a version index of its own, or ask for looser limits.

The cost is a hop and a service that must be up for execution to work. Collaboration is
unaffected: with no credentials configured, `/api/execute` answers 503 and everything
else keeps working.

## JDoodle rather than Judge0 on RapidAPI

DevSync originally proxied Judge0 CE through RapidAPI. That listing became pay-per-use,
and DevSync is meant to cost nothing to run and to show.

JDoodle's free Compiler API plan gives 20 API credits a day at no cost, covers all five
languages the editor offers, and answers a single POST with the finished result — no
token to poll for. The trade is a much smaller daily allowance and the loss of Judge0's
per-request `cpu_time_limit` and `memory_limit`: JDoodle's execute call accepts neither,
so DevSync no longer states any CPU or memory guarantee for a run. What it still owns is
the source-size cap, the per-client rate limit and the 15-second upstream timeout.

The switch cost one backend module, its tests, and the documentation naming the vendor.
Nothing in the frontend changed: it posts to `POST /api/execute` and reads
`{ output, error, status }`, exactly as before. That the migration was invisible to the
browser is the proxy earning its keep.

## Execution is rate- and size-limited

The proxy spends a metered quota on behalf of anonymous callers, which is exactly the
shape of thing that gets abused.

- **10 requests per minute per client** bounds how much of the daily quota one caller can
  burn — and with only 20 credits a day, that matters more than it did on a metered plan.
- **64 KiB of UTF-8** bounds the payload, checked in bytes because that is the unit the
  limit is written in.
- **A 15-second upstream timeout** bounds how long a single run may hold a connection, so
  a deliberate infinite loop returns a normal diagnostic rather than hanging the request.

DevSync sends JDoodle no per-request CPU or memory limit, because the execute call does
not accept one. Whatever ceilings the sandbox applies are JDoodle's, and this project
does not claim them as its own.

When the day's 20 credits are gone JDoodle answers 429 and DevSync says so plainly rather
than retrying — a retry would spend another credit against the same exhausted quota.

The limiter is mounted on the execution route alone — the health check, room joins and
document sync are never throttled — and runs before the body parser, so a throttled
caller is turned away before its body is read.

On Render the limiter identifies callers by the validated `CF-Connecting-IP` header, and
**only** there. Off Render that header is whatever a caller chose to send, so it is
ignored. There is deliberately no global `app.set("trust proxy", ...)`, which would make
Express honour a forgeable forwarded-for chain on every deployment including local ones.

## The backend is a single instance

Not an oversight — a consequence of everything above. Rooms, documents, cleanup timers
and rate-limit counters are all in process memory, and each of them is wrong across two
processes.

Keeping it single-instance is what allows the state to be three plain data structures
with no coordination, no serialisation and no cache-invalidation story.

## What production scale would require

In rough order of necessity:

1. **A Socket.IO adapter** (Redis or equivalent) so a broadcast on one instance reaches
   sockets on every other.
2. **Shared room state** — roster and document — in that store, which immediately raises
   the question the single-instance version avoids: what happens when two instances
   write the same document at once. Answering it properly is the CRDT conversation.
3. **A shared rate-limit store**, so ten per minute stays ten per minute rather than ten
   per instance.
4. **Coordinated cleanup**, so exactly one instance discards a room and a rejoin on any
   instance cancels it.
5. **Persistence**, if rooms are ever meant to outlive a restart — which then requires
   ownership, retention and deletion policies.
6. **Authentication**, once anything is persisted and any room is worth protecting.

Each of those is a real subsystem. Naming them here is the point: this version is
deliberately the one before them, and it says so rather than implying it scales.
