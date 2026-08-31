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

// Code execution is proxied here so the JDoodle credentials stay on the server and
// never reach the browser. Everything below is the server side of that boundary.
const MAX_EXECUTION_CODE_BYTES = 64 * 1024;
const EXECUTION_WINDOW_MS = 60 * 1000;
const EXECUTION_MAX_REQUESTS = 10;
const EXECUTION_TIMEOUT_MS = 15 * 1000;

// The browser sends a language name; the JDoodle runtime and the version index behind it
// live only on the server, so no caller can ask for a runtime DevSync does not offer.
const EXECUTION_LANGUAGES = {
  javascript: { language: "nodejs", versionIndex: "5" },     // Node.js 20.9.0
  typescript: { language: "typescript", versionIndex: "1" }, // TypeScript 5.9.3
  python: { language: "python3", versionIndex: "6" },        // Python 3.14.3
  cpp: { language: "cpp17", versionIndex: "3" },             // C++17, GCC 15.2.1
  java: { language: "java", versionIndex: "5" }              // JDK 21.0.0
};

const JDOODLE_CLIENT_ID = process.env.JDOODLE_CLIENT_ID;
const JDOODLE_CLIENT_SECRET = process.env.JDOODLE_CLIENT_SECRET;
const JDOODLE_API_URL = process.env.JDOODLE_API_URL || "https://api.jdoodle.com/v1/execute";

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

  // Both halves of the credential are needed and neither has a usable default, so a
  // half-configured server stays safely unavailable rather than calling upstream.
  if (!JDOODLE_CLIENT_ID || !JDOODLE_CLIENT_SECRET) {
    console.warn("Rejected execution: the JDoodle credentials are not configured");
    return res.status(503).json({ error: "Code execution is unavailable." });
  }

  const runtime = EXECUTION_LANGUAGES[language];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXECUTION_TIMEOUT_MS);

  let result;
  try {
    // JDoodle authenticates in the body rather than in a header, and takes the source as
    // plain UTF-8 text — no base64 hop, and no per-request CPU or memory limits to send.
    const upstream = await fetch(JDOODLE_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: JDOODLE_CLIENT_ID,
        clientSecret: JDOODLE_CLIENT_SECRET,
        script: sourceCode,
        stdin: "",
        language: runtime.language,
        versionIndex: runtime.versionIndex
      }),
      signal: controller.signal
    });

    // A spent daily allowance is the one upstream refusal worth naming: it is not a fault
    // and waiting will not clear it today, so it is reported plainly and never retried —
    // a retry would only spend another credit against the same exhausted quota.
    if (upstream.status === 429) {
      console.warn("JDoodle refused the run: the daily credit allowance is spent");
      return res.status(429).json({ error: "Daily code-execution limit reached. Try again tomorrow." });
    }

    // Everything else — a rejected credential included — is infrastructure as far as the
    // caller is concerned, and the answer says nothing about which of the two it was.
    if (!upstream.ok) {
      console.warn(`JDoodle request failed with status ${upstream.status}`);
      return res.status(502).json({ error: "Execution service is unavailable. Try again." });
    }

    result = await upstream.json();
  } catch (error) {
    if (error.name === "AbortError") {
      console.warn(`JDoodle request timed out after ${EXECUTION_TIMEOUT_MS} ms`);
      return res.status(504).json({ error: "Execution service timed out. Try again." });
    }
    // Also the landing place for a 200 whose body is not JSON: upstream.json() rejects.
    console.warn("JDoodle request failed before a usable response arrived");
    return res.status(502).json({ error: "Execution service is unavailable. Try again." });
  } finally {
    clearTimeout(timeout);
  }

  if (!result || typeof result !== "object" || typeof result.output !== "string") {
    console.warn("JDoodle returned an unrecognised response shape");
    return res.status(502).json({ error: "Execution service is unavailable. Try again." });
  }

  // JDoodle folds compiler diagnostics and program output into the one `output` field;
  // the two booleans are what say which kind of result arrived. Neither a compile error
  // nor a failed run is an infrastructure problem, so both come back as a normal 200
  // carrying the diagnostic, and only a flag that is explicitly false counts as failure.
  if (result.isCompiled === false) {
    const compilation = typeof result.compilationStatus === "string" ? result.compilationStatus : "";
    const diagnostic = [result.output, compilation].find((text) => text.trim() !== "");
    return res.json({ output: "", error: diagnostic || "Compilation failed.", status: "Compilation Error" });
  }

  if (result.isExecutionSuccess === false) {
    const diagnostic = result.output.trim() !== "" ? result.output : "The program did not finish successfully.";
    return res.json({ output: "", error: diagnostic, status: "Runtime Error" });
  }

  return res.json({ output: result.output, error: "", status: "Success" });
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
