import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const dataDir = join(root, "data");
const stateFile = join(dataDir, "state.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const defaultState = {
  trip: {
    title: "Badgers on Boats",
    date: "Date options coming soon",
    location: "",
    meetingPoint: "",
    dateOptions: [],
    placeOptions: [],
    adminPin: process.env.ADMIN_PIN || "change-this-pin",
    intro:
      "Add your details so we can coordinate boats, food, rides, and the final shared cost."
  },
  costs: {
    fixedCosts: 260,
    perPersonCost: 38,
    perCarCost: 18,
    depositPerPerson: 25,
    currency: "EUR"
  },
  guests: []
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

async function ensureState() {
  await mkdir(dataDir, { recursive: true });
  try {
    await stat(stateFile);
  } catch {
    await writeState(defaultState);
  }
}

async function readState() {
  await ensureState();
  return normalizeState(JSON.parse(await readFile(stateFile, "utf8")));
}

async function writeState(state) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function isAdmin(req, state) {
  return req.headers["x-admin-pin"] === state.trip.adminPin;
}

function cleanOptions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim().slice(0, 100)).filter(Boolean).slice(0, 12);
}

function normalizeState(state) {
  const normalized = {
    ...defaultState,
    ...state,
    trip: {
      ...defaultState.trip,
      ...state.trip,
      dateOptions: cleanOptions(state.trip?.dateOptions),
      placeOptions: cleanOptions(state.trip?.placeOptions)
    },
    costs: { ...defaultState.costs, ...state.costs },
    guests: Array.isArray(state.guests) ? state.guests.map(normalizeGuest) : []
  };
  if (process.env.ADMIN_PIN) normalized.trip.adminPin = process.env.ADMIN_PIN;
  return normalized;
}

function boolValue(value) {
  return value === true || value === "yes" || value === "on";
}

function normalizeGuest(guest) {
  return {
    placePreference: "decide-later",
    stayOvernight: false,
    transportThere: guest.comingByCar ? "driving" : "need-ride",
    transportBack: guest.comingByCar ? "driving" : "need-ride",
    seatsThere: guest.comingByCar ? Number(guest.carSeats || 0) : 0,
    seatsBack: guest.comingByCar ? Number(guest.carSeats || 0) : 0,
    departureArea: "",
    departureTime: "",
    returnTime: "",
    rideWith: "",
    experienceLevel: "okay",
    boatPartnerStatus: "match-me",
    boatPartnerName: "",
    boatSharePreference: "",
    okayToMatch: true,
    allergies: "",
    gearHave: "",
    gearNeed: "",
    ...guest
  };
}

function cleanGuest(input) {
  const transportThere = String(input.transportThere || (input.comingByCar === "yes" ? "driving" : "need-ride")).slice(0, 40);
  const transportBack = String(input.transportBack || (input.comingByCar === "yes" ? "driving" : "need-ride")).slice(0, 40);
  return {
    name: String(input.name || "").trim().slice(0, 80),
    phone: String(input.phone || "").trim().slice(0, 40),
    email: String(input.email || "").trim().slice(0, 100),
    datePreference: String(input.datePreference || "decide-later").slice(0, 60),
    placePreference: String(input.placePreference || "decide-later").slice(0, 100),
    stayOvernight: boolValue(input.stayOvernight),
    transportThere,
    transportBack,
    seatsThere: Math.max(0, Number(input.seatsThere || input.carSeats || 0)),
    seatsBack: Math.max(0, Number(input.seatsBack || input.carSeats || 0)),
    departureArea: String(input.departureArea || "").trim().slice(0, 120),
    departureTime: String(input.departureTime || "").trim().slice(0, 80),
    returnTime: String(input.returnTime || "").trim().slice(0, 80),
    rideWith: String(input.rideWith || "").trim().slice(0, 120),
    comingByCar: transportThere === "driving" || transportBack === "driving" || input.comingByCar === "yes",
    carSeats: Math.max(0, Math.max(Number(input.seatsThere || 0), Number(input.seatsBack || 0), Number(input.carSeats || 0))),
    plusOne: boolValue(input.plusOne),
    plusOneName: String(input.plusOneName || "").trim().slice(0, 80),
    food: String(input.food || "").trim().slice(0, 500),
    allergies: String(input.allergies || "").trim().slice(0, 500),
    boat: String(input.boat || "no-preference").slice(0, 40),
    experienceLevel: String(input.experienceLevel || "okay").slice(0, 40),
    boatPartnerStatus: String(input.boatPartnerStatus || "match-me").slice(0, 40),
    boatPartnerName: String(input.boatPartnerName || "").trim().slice(0, 120),
    boatSharePreference: String(input.boatSharePreference || "").trim().slice(0, 200),
    okayToMatch: !["no", "false", false].includes(input.okayToMatch),
    gearHave: String(input.gearHave || "").trim().slice(0, 500),
    gearNeed: String(input.gearNeed || "").trim().slice(0, 500),
    notes: String(input.notes || "").trim().slice(0, 500)
  };
}

function publicState(state) {
  const { adminPin, ...trip } = state.trip;
  const guests = state.guests.map((guest) => ({
    id: guest.id,
    createdAt: guest.createdAt,
    name: guest.name,
    datePreference: guest.datePreference,
    placePreference: guest.placePreference,
    stayOvernight: Boolean(guest.stayOvernight),
    transportThere: guest.transportThere,
    transportBack: guest.transportBack,
    seatsThere: guest.seatsThere,
    seatsBack: guest.seatsBack,
    boatPartnerStatus: guest.boatPartnerStatus,
    boatPartnerName: guest.boatPartnerName,
    comingByCar: guest.comingByCar,
    carSeats: guest.carSeats,
    plusOne: guest.plusOne,
    plusOneName: guest.plusOneName,
    food: guest.food,
    boat: guest.boat
  }));
  return { trip, costs: state.costs, guests };
}

function adminState(state) {
  const { adminPin, ...trip } = state.trip;
  return { trip, costs: state.costs, guests: state.guests };
}

async function handleApi(req, res) {
  const state = await readState();

  if (req.method === "GET" && req.url === "/api/state") {
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && req.url === "/api/guests") {
    const guest = cleanGuest(await readBody(req));
    if (!guest.name || !guest.phone) {
      sendJson(res, 400, { error: "Name and phone are required." });
      return;
    }
    state.guests.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...guest
    });
    await writeState(state);
    sendJson(res, 201, publicState(state));
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/login") {
    const body = await readBody(req);
    sendJson(res, body.pin === state.trip.adminPin ? 200 : 401, {
      ok: body.pin === state.trip.adminPin
    });
    return;
  }

  if (!isAdmin(req, state)) {
    sendJson(res, 401, { error: "Admin pin required." });
    return;
  }

  if (req.method === "GET" && req.url === "/api/admin/state") {
    sendJson(res, 200, adminState(state));
    return;
  }

  if (req.method === "PUT" && req.url === "/api/admin/settings") {
    const body = await readBody(req);
    state.trip = {
      ...state.trip,
      ...body.trip,
      dateOptions: cleanOptions(body.trip?.dateOptions),
      placeOptions: cleanOptions(body.trip?.placeOptions),
      adminPin: state.trip.adminPin
    };
    state.costs = { ...state.costs, ...body.costs };
    await writeState(state);
    sendJson(res, 200, adminState(state));
    return;
  }

  const guestMatch = req.url.match(/^\/api\/admin\/guests\/([^/]+)$/);
  if (guestMatch && req.method === "PATCH") {
    const guest = state.guests.find((item) => item.id === guestMatch[1]);
    if (!guest) {
      sendJson(res, 404, { error: "Guest not found." });
      return;
    }
    Object.assign(guest, cleanGuest(await readBody(req)));
    await writeState(state);
    sendJson(res, 200, adminState(state));
    return;
  }

  if (guestMatch && req.method === "DELETE") {
    state.guests = state.guests.filter((item) => item.id !== guestMatch[1]);
    await writeState(state);
    sendJson(res, 200, adminState(state));
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

async function serveStatic(req, res) {
  const requested = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const safePath = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    await stat(filePath);
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) await handleApi(req, res);
    else await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}).listen(port, host, () => {
  console.log(`Kayak trip planner running at http://${host}:${port}`);
});
