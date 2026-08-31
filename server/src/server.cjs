const express = require("express");
const http = require("http");
const net = require("net");
const { Server } = require("socket.io");
const cors = require("cors");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  methods: ["GET", "POST"],
  credentials: true
};

const MAX_ROOM_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 40;
const MAX_CODE_BYTES = 1024 * 1024; // 1 MiB of UTF-8, not characters

// How long an empty room keeps its document before being discarded. Long enough to
// survive a refresh or a brief network drop; short enough that DevSync stays ephemeral.
const ROOM_EMPTY_GRACE_MS = 15 * 1000;

// Code execution is proxied here so the Judge0 credential stays on the server and
// never reaches the browser. Everything below is the server side of that boundary.
const MAX_EXECUTION_CODE_BYTES = 64 * 1024;
const EXECUTION_WINDOW_MS = 60 * 1000;
const EXECUTION_MAX_REQUESTS = 10;
const JUDGE0_TIMEOUT_MS = 15 * 1000;

// The browser sends a language name; the Judge0 ids live only on the server.
const EXECUTION_LANGUAGES = {
  javascript: 102,
  typescript: 101,
  python: 109,
  cpp: 105,
  java: 91
};

const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY;
const JUDGE0_API_HOST = process.env.JUDGE0_API_HOST || "judge0-ce.p.rapidapi.com";
const JUDGE0_API_URL = process.env.JUDGE0_API_URL || "https://judge0-ce.p.rapidapi.com";
const JUDGE0_SUBMISSION_URL = `${JUDGE0_API_URL.replace(/\/+$/, "")}/submissions?base64_encoded=true&wait=true`;

const app = express();
app.use(cors(corsOptions));

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  // Socket.IO's own ceiling defaults to 1e6, just under our limit. Leave a little room
  // above MAX_CODE_BYTES so the application check is the one that rejects oversized code.
  maxHttpBufferSize: MAX_CODE_BYTES + 64 * 1024
});

app.get("/", (req, res) => {
  res.send("DevSync v1 server is running");
});

// Render runs its services behind Cloudflare and its own router, so req.ip there is the
// edge's address and every caller would land in one bucket. Cloudflare overwrites
// CF-Connecting-IP with the real client on the way in, and Render sets RENDER=true itself,
// so that header can be believed there and only there. Off Render the header is whatever a
// caller chose to send, so it is ignored outright. There is deliberately no
// app.set("trust proxy", ...): that would make Express honour a forwarded-for chain on
// every deployment, including local ones, which is exactly the header a caller can forge.
const ON_RENDER = process.env.RENDER === "true";

function executionClientKey(req) {
  const edgeClient = req.headers["cf-connecting-ip"];
  const trusted = ON_RENDER && typeof edgeClient === "string" && net.isIP(edgeClient);
  // ipKeyGenerator is the library's own normaliser: it unwraps IPv4-mapped addresses and
  // collapses IPv6 to a /56, so one caller cannot walk a subnet for a fresh bucket.
  return ipKeyGenerator(trusted ? edgeClient : req.ip);
}

// Applied to the execution route alone, so the health check, room joining and code
// sync are never throttled. In-memory counters are enough for a single-process backend.
const executionLimiter = rateLimit({
  windowMs: EXECUTION_WINDOW_MS,
  limit: EXECUTION_MAX_REQUESTS,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: executionClientKey,
  message: { error: "Too many runs. Try again in a minute." }
});

// Judge0 returns its text fields base64-encoded, and any of them may be null.
function decodeBase64(value) {
  if (typeof value !== "string" || value === "") return "";
  return Buffer.from(value, "base64").toString("utf8");
}

// The body parser is mounted on this route only, so Socket.IO's traffic is untouched
// and a rate-limited caller is turned away before its body is read.
app.post("/api/execute", executionLimiter, express.json({ limit: "256kb" }), async (req, res) => {
  const { sourceCode, language } = req.body || {};

  if (typeof sourceCode !== "string" || typeof language !== "string") {
    console.warn("Rejected execution: malformed request");
    return res.status(400).json({ error: "Invalid execution request." });
  }

  if (!Object.hasOwn(EXECUTION_LANGUAGES, language)) {
    console.warn("Rejected execution: unsupported language");
    return res.status(400).json({ error: "Unsupported language." });
  }

  const bytes = Buffer.byteLength(sourceCode, "utf8");
  if (bytes > MAX_EXECUTION_CODE_BYTES) {
    console.warn(`Rejected execution: ${bytes} bytes exceeds the ${MAX_EXECUTION_CODE_BYTES} byte limit`);
    return res.status(413).json({ error: "Code is too large to run." });
  }

  if (!JUDGE0_API_KEY) {
    console.warn("Rejected execution: JUDGE0_API_KEY is not configured");
    return res.status(503).json({ error: "Code execution is unavailable." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JUDGE0_TIMEOUT_MS);

  let result;
  try {
    const upstream = await fetch(JUDGE0_SUBMISSION_URL, {
      method: "POST",
      headers: {
        "x-rapidapi-key": JUDGE0_API_KEY,
        "x-rapidapi-host": JUDGE0_API_HOST,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        // Buffer encodes the full UTF-8 string; the browser's btoa threw on anything non-Latin-1.
        source_code: Buffer.from(sourceCode, "utf8").toString("base64"),
        language_id: EXECUTION_LANGUAGES[language],
        stdin: "",
        expected_output: null,
        cpu_time_limit: 5,
        memory_limit: 256000,
        compiler_options: ""
      }),
      signal: controller.signal
    });

    if (!upstream.ok) {
      console.warn(`Judge0 request failed with status ${upstream.status}`);
      return res.status(502).json({ error: "Execution service is unavailable. Try again." });
    }

    result = await upstream.json();
  } catch (error) {
    if (error.name === "AbortError") {
      console.warn(`Judge0 request timed out after ${JUDGE0_TIMEOUT_MS} ms`);
      return res.status(504).json({ error: "Execution service timed out. Try again." });
    }
    console.warn("Judge0 request failed before a usable response arrived");
    return res.status(502).json({ error: "Execution service is unavailable. Try again." });
  } finally {
    clearTimeout(timeout);
  }

  if (!result || typeof result.status !== "object" || result.status === null) {
    console.warn("Judge0 returned an unrecognised response shape");
    return res.status(502).json({ error: "Execution service is unavailable. Try again." });
  }

  // Judge0 status 3 is "Accepted". Every other status is the submitted code failing, not
  // an infrastructure problem, so it comes back as a normal result carrying a diagnostic.
  if (result.status.id === 3) {
    return res.json({ output: decodeBase64(result.stdout), error: "", status: "Success" });
  }

  const description = typeof result.status.description === "string" ? result.status.description : "Error";
  const diagnostic = [result.stderr, result.compile_output, result.message]
    .map(decodeBase64)
    .find((text) => text.trim() !== "");

  return res.json({ output: "", error: diagnostic || description, status: description });
});

// express.json rejects oversized or malformed bodies before the route runs; answer those
// in the same shape, without leaking parser internals.
app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Code is too large to run." });
  }
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid execution request." });
  }
  return next(err);
});

// DevSync rooms live in memory only: a restart drops every one of them.
const rooms = {};    // roomId -> [{ id, name }]
const roomCode = {}; // roomId -> current document
const roomCleanupTimers = new Map(); // roomId -> pending deletion timer

function readText(value, maxLength) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function isMember(roomId, socketId) {
  const members = rooms[roomId];
  return Boolean(members && members.some((member) => member.id === socketId));
}

function cancelRoomCleanup(roomId) {
  const timer = roomCleanupTimers.get(roomId);
  if (!timer) return;
  clearTimeout(timer);
  roomCleanupTimers.delete(roomId);
}

// An empty room keeps its document for the grace window. The occupancy re-check at
// expiry is what stops a timer left over from an earlier emptying from deleting a
// room somebody has since rejoined.
function scheduleRoomCleanup(roomId) {
  cancelRoomCleanup(roomId);

  const timer = setTimeout(() => {
    roomCleanupTimers.delete(roomId);
    if ((rooms[roomId] || []).length > 0) return;

    delete rooms[roomId];
    delete roomCode[roomId];
    console.log(`Room ${roomId} stayed empty and was discarded`);
  }, ROOM_EMPTY_GRACE_MS);

  roomCleanupTimers.set(roomId, timer);
  console.log(`Room ${roomId} is empty; discarding in ${ROOM_EMPTY_GRACE_MS} ms unless someone rejoins`);
}

// Removes a socket from the room the server recorded for it. Safe to call more than
// once; returns the room id, or null.
function removeFromCurrentRoom(socket) {
  const { roomId, name } = socket.data;
  if (!roomId) return null;

  socket.data.roomId = null;
  socket.data.name = null;

  const remaining = (rooms[roomId] || []).filter((member) => member.id !== socket.id);
  rooms[roomId] = remaining;
  console.log(`${name} left room ${roomId}`);

  // The departing socket has no use for the roster it just fell out of.
  socket.to(roomId).emit("updateRoom", remaining);

  if (remaining.length === 0) {
    scheduleRoomCleanup(roomId);
  }

  return roomId;
}

// The client sends its own name with typing events; the server ignores it and
// broadcasts the socket id plus the name recorded when the socket joined, so that
// two participants sharing a display name stay distinct.
function broadcastTyping(socket, event, payload) {
  const roomId = socket.data.roomId;
  if (!roomId || !isMember(roomId, socket.id)) return;
  if (payload && payload.roomId && payload.roomId !== roomId) return;

  socket.to(roomId).emit(event, { id: socket.id, name: socket.data.name });
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("joinRoom", (payload) => {
    const roomId = payload && typeof payload === "object" ? readText(payload.roomId, MAX_ROOM_ID_LENGTH) : null;
    const name = payload && typeof payload === "object" ? readText(payload.name, MAX_NAME_LENGTH) : null;
    if (!roomId || !name) {
      console.warn(`Rejected joinRoom from ${socket.id}: invalid payload`);
      return;
    }

    // A socket belongs to one DevSync room at a time, so switching drops the old one.
    if (socket.data.roomId && socket.data.roomId !== roomId) {
      socket.leave(removeFromCurrentRoom(socket));
    }

    // A room in its grace window still exists as an empty member list, so this both
    // stops the pending deletion and leaves the document it was holding alone.
    cancelRoomCleanup(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = [];
      roomCode[roomId] = "";
      console.log(`Created room ${roomId}`);
    }

    socket.join(roomId);
    socket.data.roomId = roomId;

    // Membership is keyed by socket id, so two people may share a display name and a
    // repeated joinRoom from the same socket adds nobody. There is no rename feature,
    // so the name a socket first joined the room with is the one that sticks.
    const members = rooms[roomId];
    const existing = members.find((member) => member.id === socket.id);
    if (existing) {
      socket.data.name = existing.name;
    } else {
      members.push({ id: socket.id, name });
      socket.data.name = name;
      console.log(`${name} joined room ${roomId} (${members.length} present)`);
    }

    io.to(roomId).emit("updateRoom", members);
    socket.emit("codeUpdate", roomCode[roomId]);
  });

  // The client passes a room id here, but the server trusts its own record instead.
  socket.on("leaveRoom", () => {
    const roomId = removeFromCurrentRoom(socket);
    if (roomId) socket.leave(roomId);
  });

  socket.on("codeChange", (payload) => {
    if (!payload || typeof payload !== "object" || typeof payload.code !== "string") {
      console.warn(`Rejected codeChange from ${socket.id}: invalid payload`);
      return;
    }

    const roomId = socket.data.roomId;
    if (!roomId || !isMember(roomId, socket.id) || (payload.roomId && payload.roomId !== roomId)) {
      console.warn(`Rejected codeChange from ${socket.id}: not a member of that room`);
      return;
    }

    const bytes = Buffer.byteLength(payload.code, "utf8");
    if (bytes > MAX_CODE_BYTES) {
      console.warn(`Rejected codeChange from ${socket.id}: ${bytes} bytes exceeds the ${MAX_CODE_BYTES} byte limit`);
      return;
    }

    roomCode[roomId] = payload.code;
    socket.to(roomId).emit("codeUpdate", payload.code);
  });

  socket.on("userTyping", (payload) => broadcastTyping(socket, "userTyping", payload));
  socket.on("userStoppedTyping", (payload) => broadcastTyping(socket, "userStoppedTyping", payload));

  // Socket.IO drops the transport rooms itself; only the application state needs clearing.
  socket.on("disconnect", () => {
    removeFromCurrentRoom(socket);
    console.log("Disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
