"use strict";

// Integration tests for the DevSync server. Every case runs against a real child
// process speaking real HTTP and real Socket.IO; nothing outside this machine is
// contacted, and code execution is pointed at a fake judge started here.

const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { after, before, describe, it } = require("node:test");
const { io: connect } = require("socket.io-client");

const SERVER_DIR = path.join(__dirname, "..");
const SERVER_ENTRY = path.join(SERVER_DIR, "src", "server.cjs");

const EVENT_TIMEOUT_MS = 5000;
const START_TIMEOUT_MS = 15000;
const SILENCE_WINDOW_MS = 500;

// Mirrors ROOM_EMPTY_GRACE_MS in src/server.cjs. The tests deliberately wait out the
// real production value rather than shortening it for CI.
const ROOM_EMPTY_GRACE_MS = 15 * 1000;
const GRACE_MARGIN_MS = 2000;

// Not a credential: the fake judge below is the only thing that ever sees it.
const FAKE_JUDGE_KEY = "fake-judge-key-for-tests";
const FAKE_JUDGE_HOST = "fake-judge.invalid";

const openSockets = new Set();
let roomCounter = 0;

function uniqueRoomId(label) {
  roomCounter += 1;
  return `test-${label}-${process.pid}-${roomCounter}`;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Starts `node src/server.cjs` on a free port and resolves once it says it is listening.
async function startServer(env = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: SERVER_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      FRONTEND_URL: "http://localhost:3000",
      // Blanked so a developer's own Judge0 settings can never leak into a test run.
      // The address is unroutable, so a test that forgets to configure the fake judge
      // fails locally rather than reaching a real service.
      JUDGE0_API_KEY: "",
      JUDGE0_API_HOST: FAKE_JUDGE_HOST,
      JUDGE0_API_URL: "http://127.0.0.1:1",
      ...env,
    },
  });

  child.stderr.resume();
  child.stdout.setEncoding("utf8");

  await new Promise((resolve, reject) => {
    let log = "";
    const timer = setTimeout(
      () => reject(new Error(`server did not start within ${START_TIMEOUT_MS} ms:\n${log}`)),
      START_TIMEOUT_MS,
    );

    const onExit = (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with code ${code} before listening:\n${log}`));
    };
    const onData = (chunk) => {
      log += chunk;
      if (!log.includes(`Server is running on port ${port}`)) return;
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
      child.stdout.resume();
      resolve();
    };

    child.stdout.on("data", onData);
    child.once("error", reject);
    child.once("exit", onExit);
  });

  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    },
  };
}

async function connectClient(url) {
  const socket = connect(url, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  openSockets.add(socket);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`socket did not connect to ${url} within ${EVENT_TIMEOUT_MS} ms`)),
      EVENT_TIMEOUT_MS,
    );
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  return socket;
}

function closeClients() {
  for (const socket of openSockets) socket.disconnect();
  openSockets.clear();
}

function nextEvent(socket, event, timeoutMs = EVENT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`timed out after ${timeoutMs} ms waiting for "${event}"`));
    }, timeoutMs);

    function onEvent(payload) {
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    }

    socket.on(event, onEvent);
  });
}

function expectNoEvent(socket, event, windowMs = SILENCE_WINDOW_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve();
    }, windowMs);

    function onEvent(payload) {
      clearTimeout(timer);
      socket.off(event, onEvent);
      reject(new Error(`unexpected "${event}" carrying ${JSON.stringify(payload)}`));
    }

    socket.on(event, onEvent);
  });
}

// The server handles one socket's events in order and answers every join with the room's
// document, so re-joining is a cheap round trip that both confirms earlier events have
// been applied and reports the document back.
function joinAndReadDocument(socket, roomId, name) {
  const document = nextEvent(socket, "codeUpdate");
  socket.emit("joinRoom", { roomId, name });
  return document;
}

function waitUntil(deadline) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now())));
}

async function postExecution(url, body, headers = {}) {
  const response = await fetch(`${url}/api/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.json().catch(() => null),
  };
}

function judgeAccepted(stdout) {
  return {
    stdout: Buffer.from(stdout, "utf8").toString("base64"),
    stderr: null,
    compile_output: null,
    message: null,
    status: { id: 3, description: "Accepted" },
  };
}

// Stands in for Judge0 so the proxy can be exercised without a credential or a network.
async function startFakeJudge() {
  const received = [];
  let reply = () => ({ status: 200, body: judgeAccepted("") });

  const server = http.createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      received.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: JSON.parse(raw),
      });
      const { status, body } = reply(received.length);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    received,
    respondWith(next) {
      reply = next;
    },
    async stop() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

describe("collaboration", () => {
  let server;

  before(async () => {
    server = await startServer();
  }, { timeout: START_TIMEOUT_MS + 5000 });

  after(async () => {
    closeClients();
    await server.stop();
  });

  it("answers the health check with the DevSync banner", async () => {
    const response = await fetch(`${server.url}/`);

    assert.equal(response.status, 200);
    assert.match(await response.text(), /DevSync v1 server is running/);
  });

  it("puts both participants in one roster and relays edits in both directions", async () => {
    const roomId = uniqueRoomId("pair");
    const alice = await connectClient(server.url);
    const bob = await connectClient(server.url);

    const aliceAlone = nextEvent(alice, "updateRoom");
    alice.emit("joinRoom", { roomId, name: "Alice" });
    assert.deepEqual(await aliceAlone, [{ id: alice.id, name: "Alice" }]);

    const bothPresent = nextEvent(alice, "updateRoom");
    const bobsFirstView = joinAndReadDocument(bob, roomId, "Bob");
    const roster = await bothPresent;
    assert.equal(await bobsFirstView, "");

    assert.deepEqual(
      roster.map((member) => member.name).sort(),
      ["Alice", "Bob"],
    );
    assert.notEqual(alice.id, bob.id);
    assert.deepEqual(new Set(roster.map((member) => member.id)), new Set([alice.id, bob.id]));

    const bobSees = nextEvent(bob, "codeUpdate");
    alice.emit("codeChange", { roomId, code: "// written by Alice" });
    assert.equal(await bobSees, "// written by Alice");

    const aliceSees = nextEvent(alice, "codeUpdate");
    bob.emit("codeChange", { roomId, code: "// written by Bob" });
    assert.equal(await aliceSees, "// written by Bob");
  });

  it("hands a joining client the document the room already holds", async () => {
    const roomId = uniqueRoomId("document");
    const author = await connectClient(server.url);

    await joinAndReadDocument(author, roomId, "Author");
    author.emit("codeChange", { roomId, code: "const answer = 42" });
    assert.equal(await joinAndReadDocument(author, roomId, "Author"), "const answer = 42");

    const latecomer = await connectClient(server.url);
    assert.equal(await joinAndReadDocument(latecomer, roomId, "Latecomer"), "const answer = 42");
  });

  it("drops a participant from the roster when they leave", async () => {
    const roomId = uniqueRoomId("leaving");
    const alice = await connectClient(server.url);
    const bob = await connectClient(server.url);

    alice.emit("joinRoom", { roomId, name: "Alice" });
    await nextEvent(alice, "updateRoom");
    const bothPresent = nextEvent(alice, "updateRoom");
    bob.emit("joinRoom", { roomId, name: "Bob" });
    assert.equal((await bothPresent).length, 2);

    const afterLeaving = nextEvent(alice, "updateRoom");
    bob.emit("leaveRoom");
    assert.deepEqual(await afterLeaving, [{ id: alice.id, name: "Alice" }]);
  });

  it("keeps same-name participants distinct", async () => {
    const roomId = uniqueRoomId("same-name");
    const first = await connectClient(server.url);
    const second = await connectClient(server.url);

    first.emit("joinRoom", { roomId, name: "Alex" });
    await nextEvent(first, "updateRoom");
    const bothPresent = nextEvent(first, "updateRoom");
    second.emit("joinRoom", { roomId, name: "Alex" });
    const roster = await bothPresent;

    assert.deepEqual(roster.map((member) => member.name), ["Alex", "Alex"]);
    assert.equal(new Set(roster.map((member) => member.id)).size, 2);
  });

  it("adds nobody when one socket joins the same room again", async () => {
    const roomId = uniqueRoomId("idempotent");
    const socket = await connectClient(server.url);

    socket.emit("joinRoom", { roomId, name: "Alex" });
    await nextEvent(socket, "updateRoom");

    // The second join also carries a different name; there is no rename feature, so the
    // name the socket first joined under is the one that stands.
    const afterRejoin = nextEvent(socket, "updateRoom");
    socket.emit("joinRoom", { roomId, name: "Someone else" });
    assert.deepEqual(await afterRejoin, [{ id: socket.id, name: "Alex" }]);
  });

  it("ignores a code change from a socket that never joined the room", async () => {
    const roomId = uniqueRoomId("membership");
    const member = await connectClient(server.url);

    await joinAndReadDocument(member, roomId, "Member");
    member.emit("codeChange", { roomId, code: "// the room's own document" });
    await joinAndReadDocument(member, roomId, "Member");

    const outsider = await connectClient(server.url);
    const silence = expectNoEvent(member, "codeUpdate");
    outsider.emit("codeChange", { roomId, code: "// injected by an outsider" });
    await silence;

    const observer = await connectClient(server.url);
    assert.equal(
      await joinAndReadDocument(observer, roomId, "Observer"),
      "// the room's own document",
    );
  });

  it("labels typing with the name the socket joined under, not the one it claims", async () => {
    const roomId = uniqueRoomId("typing");
    const alice = await connectClient(server.url);
    const bob = await connectClient(server.url);

    alice.emit("joinRoom", { roomId, name: "Alice" });
    await nextEvent(alice, "updateRoom");
    const bothPresent = nextEvent(alice, "updateRoom");
    bob.emit("joinRoom", { roomId, name: "Bob" });
    await bothPresent;

    const typing = nextEvent(alice, "userTyping");
    bob.emit("userTyping", { roomId, name: "Mallory" });
    assert.deepEqual(await typing, { id: bob.id, name: "Bob" });
  });

  describe("the empty-room grace window", () => {
    let documentOnReturn;
    let documentPastOriginalExpiry;
    let documentInAbandonedRoom;

    // Both rooms are emptied at the same moment so that one real wait covers the rejoin
    // scenario and the expiry scenario together.
    before(async () => {
      const revisited = uniqueRoomId("grace-revisited");
      const abandoned = uniqueRoomId("grace-abandoned");

      const leaving = await connectClient(server.url);
      await joinAndReadDocument(leaving, revisited, "Returning");
      leaving.emit("codeChange", { roomId: revisited, code: "// waiting to be reclaimed" });
      await joinAndReadDocument(leaving, revisited, "Returning");

      const abandoning = await connectClient(server.url);
      await joinAndReadDocument(abandoning, abandoned, "Leaving");
      abandoning.emit("codeChange", { roomId: abandoned, code: "// nobody comes back" });
      await joinAndReadDocument(abandoning, abandoned, "Leaving");

      leaving.disconnect();
      abandoning.disconnect();
      const emptiedAt = Date.now();

      const returning = await connectClient(server.url);
      documentOnReturn = await joinAndReadDocument(returning, revisited, "Returning");

      // `returning` stays connected across the moment the original timer would have fired.
      await waitUntil(emptiedAt + ROOM_EMPTY_GRACE_MS + GRACE_MARGIN_MS);

      const intoRevisited = await connectClient(server.url);
      documentPastOriginalExpiry = await joinAndReadDocument(intoRevisited, revisited, "Late");

      const intoAbandoned = await connectClient(server.url);
      documentInAbandonedRoom = await joinAndReadDocument(intoAbandoned, abandoned, "Late");
    }, { timeout: ROOM_EMPTY_GRACE_MS + 30000 });

    it("hands the document back to someone who returns inside the window", () => {
      assert.equal(documentOnReturn, "// waiting to be reclaimed");
    });

    it("keeps the room alive once someone has returned, past the original expiry", () => {
      assert.equal(documentPastOriginalExpiry, "// waiting to be reclaimed");
    });

    it("discards the document of a room nobody returns to", () => {
      assert.equal(documentInAbandonedRoom, "");
    });
  });
});

describe("code execution", () => {
  let judge;
  let server;

  before(async () => {
    judge = await startFakeJudge();
    server = await startServer({
      JUDGE0_API_KEY: FAKE_JUDGE_KEY,
      JUDGE0_API_HOST: FAKE_JUDGE_HOST,
      JUDGE0_API_URL: judge.url,
    });
  }, { timeout: START_TIMEOUT_MS + 5000 });

  after(async () => {
    await server.stop();
    await judge.stop();
  });

  it("runs UTF-8 source through the judge and returns its output", async () => {
    const source = 'console.log("café 👋")';
    judge.respondWith(() => ({ status: 200, body: judgeAccepted("café 👋\n") }));

    const response = await postExecution(server.url, { sourceCode: source, language: "javascript" });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { output: "café 👋\n", error: "", status: "Success" });

    const submission = judge.received.at(-1);
    assert.equal(submission.method, "POST");
    assert.equal(submission.url, "/submissions?base64_encoded=true&wait=true");
    assert.equal(submission.body.language_id, 102);
    assert.equal(submission.body.cpu_time_limit, 5);
    assert.equal(submission.body.memory_limit, 256000);
    assert.equal(Buffer.from(submission.body.source_code, "base64").toString("utf8"), source);
  });

  it("sends the judge credential upstream and never back to the caller", async () => {
    judge.respondWith(() => ({ status: 200, body: judgeAccepted("ok\n") }));

    const response = await postExecution(server.url, {
      sourceCode: "console.log('ok')",
      language: "javascript",
    });

    const submission = judge.received.at(-1);
    assert.equal(submission.headers["x-rapidapi-key"], FAKE_JUDGE_KEY);
    assert.equal(submission.headers["x-rapidapi-host"], FAKE_JUDGE_HOST);

    const returned = JSON.stringify(response.headers) + JSON.stringify(response.body);
    assert.ok(!returned.includes(FAKE_JUDGE_KEY), "the judge key must not reach the caller");
  });

  it("rejects a language it does not know", async () => {
    const before = judge.received.length;

    const response = await postExecution(server.url, {
      sourceCode: "fn main() {}",
      language: "rust",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: "Unsupported language." });
    assert.equal(judge.received.length, before);
  });

  it("rejects source above the UTF-8 byte limit", async () => {
    // 33792 two-byte characters: well under the limit counted as characters, over it
    // counted as the bytes the limit is actually written in.
    const source = "é".repeat(33 * 1024);
    assert.ok(source.length < 64 * 1024 && Buffer.byteLength(source, "utf8") > 64 * 1024);
    const before = judge.received.length;

    const response = await postExecution(server.url, { sourceCode: source, language: "javascript" });

    assert.equal(response.status, 413);
    assert.deepEqual(response.body, { error: "Code is too large to run." });
    assert.equal(judge.received.length, before);
  });

  it("returns a failing run as a normal result rather than an infrastructure error", async () => {
    judge.respondWith(() => ({
      status: 200,
      body: {
        stdout: null,
        stderr: Buffer.from("ReferenceError: nope is not defined\n").toString("base64"),
        compile_output: null,
        message: null,
        status: { id: 11, description: "Runtime Error (NZEC)" },
      },
    }));

    const response = await postExecution(server.url, {
      sourceCode: "nope()",
      language: "javascript",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      output: "",
      error: "ReferenceError: nope is not defined\n",
      status: "Runtime Error (NZEC)",
    });
  });

  it("answers with a safe message when the judge itself fails", async () => {
    judge.respondWith(() => ({ status: 503, body: { message: "judge unavailable" } }));

    const response = await postExecution(server.url, {
      sourceCode: "console.log(1)",
      language: "javascript",
    });

    assert.equal(response.status, 502);
    assert.deepEqual(response.body, { error: "Execution service is unavailable. Try again." });
  });
});

describe("code execution without a configured judge", () => {
  let server;

  before(async () => {
    server = await startServer();
  }, { timeout: START_TIMEOUT_MS + 5000 });

  after(async () => {
    await server.stop();
  });

  it("reports the feature as unavailable instead of failing open", async () => {
    const response = await postExecution(server.url, {
      sourceCode: "console.log(1)",
      language: "javascript",
    });

    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: "Code execution is unavailable." });
  });
});

// Its own server process: the limiter counts per minute, so no other execution test may
// share this counter.
describe("the execution rate limit", () => {
  let judge;
  let server;
  let statuses;
  let spoofed;
  let submissionsReceived;

  before(async () => {
    judge = await startFakeJudge();
    server = await startServer({
      JUDGE0_API_KEY: FAKE_JUDGE_KEY,
      JUDGE0_API_HOST: FAKE_JUDGE_HOST,
      JUDGE0_API_URL: judge.url,
    });
    judge.respondWith(() => ({ status: 200, body: judgeAccepted("ok\n") }));

    const run = (headers) =>
      postExecution(server.url, { sourceCode: "console.log(1)", language: "javascript" }, headers);

    statuses = [];
    for (let attempt = 0; attempt < 11; attempt += 1) statuses.push((await run()).status);

    // This server is not on Render, so the header below is just something a caller sent.
    spoofed = await run({ "CF-Connecting-IP": "203.0.113.55" });
    submissionsReceived = judge.received.length;
  }, { timeout: START_TIMEOUT_MS + 15000 });

  after(async () => {
    await server.stop();
    await judge.stop();
  });

  it("lets ten runs through and turns the eleventh away", () => {
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 429]);
  });

  it("never reaches the judge for a run it turned away", () => {
    assert.equal(submissionsReceived, 10);
  });

  it("ignores a caller-supplied CF-Connecting-IP when the server is not on Render", () => {
    assert.equal(spoofed.status, 429);
    assert.deepEqual(spoofed.body, { error: "Too many runs. Try again in a minute." });
  });
});

// Render sets RENDER=true itself and puts Cloudflare in front of the service, so there the
// caller's address arrives in CF-Connecting-IP rather than on the socket.
describe("the execution rate limit behind the Render edge", () => {
  const FIRST_CLIENT = "203.0.113.10";
  const SECOND_CLIENT = "198.51.100.20";

  let judge;
  let server;
  let firstClientStatuses;
  let secondClientStatus;
  let submissionsReceived;

  before(async () => {
    judge = await startFakeJudge();
    server = await startServer({
      RENDER: "true",
      JUDGE0_API_KEY: FAKE_JUDGE_KEY,
      JUDGE0_API_HOST: FAKE_JUDGE_HOST,
      JUDGE0_API_URL: judge.url,
    });
    judge.respondWith(() => ({ status: 200, body: judgeAccepted("ok\n") }));

    const runAs = (client) =>
      postExecution(
        server.url,
        { sourceCode: "console.log(1)", language: "javascript" },
        { "CF-Connecting-IP": client },
      );

    firstClientStatuses = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      firstClientStatuses.push((await runAs(FIRST_CLIENT)).status);
    }

    // Same socket, same edge, different client. Every request in this suite arrives from
    // 127.0.0.1, so a limiter keyed on the connection alone would have exhausted this too.
    secondClientStatus = (await runAs(SECOND_CLIENT)).status;
    submissionsReceived = judge.received.length;
  }, { timeout: START_TIMEOUT_MS + 15000 });

  after(async () => {
    await server.stop();
    await judge.stop();
  });

  it("stops one Render client's eleventh run", () => {
    assert.deepEqual(firstClientStatuses, [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 429]);
  });

  it("gives a second Render client its own allowance", () => {
    assert.equal(secondClientStatus, 200);
  });

  it("forwards every allowed run to the judge and no rejected one", () => {
    assert.equal(submissionsReceived, 11);
  });
});
