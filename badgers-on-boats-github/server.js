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
    title: "Bolt Kayak Trip",
    date: "July 25-26, 2026",
    location: "To be decided",
    meetingPoint: "Bolt HQ or pickup points",
    dateOptions: [],
    placeOptions: [],
    adminPin: process.env.ADMIN_PIN || "kayak2026",
    intro:
      "Time for our yearly kayaking adventure. Register your availability, rides, kayak plans, food, gear, and extras."
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
  return String(req.headers["x-admin-pin"] || "").trim() === state.trip.adminPin;
}

function cleanOptions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim().slice(0, 100)).filter(Boolean).slice(0, 12);
}

function normalizeState(state) {
  const oldDefaultTitle = !state.trip?.title || state.trip.title === "Badgers on Boats";
  const normalized = {
    ...defaultState,
    ...state,
    trip: {
      ...defaultState.trip,
      ...state.trip,
      title: oldDefaultTitle ? defaultState.trip.title : state.trip.title,
      date: ["Date options coming soon", "2026 weekend vote"].includes(state.trip?.date) ? defaultState.trip.date : state.trip?.date || defaultState.trip.date,
      location: state.trip?.location || defaultState.trip.location,
      meetingPoint: state.trip?.meetingPoint || defaultState.trip.meetingPoint,
      intro: oldDefaultTitle ? defaultState.trip.intro : state.trip?.intro || defaultState.trip.intro,
      adminPin: state.trip?.adminPin === "change-this-pin" ? defaultState.trip.adminPin : state.trip?.adminPin || defaultState.trip.adminPin,
      dateOptions: cleanOptions(state.trip?.dateOptions),
      placeOptions: cleanOptions(state.trip?.placeOptions)
    },
    guests: Array.isArray(state.guests) ? state.guests.map(normalizeGuest) : []
  };
  delete normalized.costs;
  if (process.env.ADMIN_PIN) normalized.trip.adminPin = process.env.ADMIN_PIN;
  return normalized;
}

function boolValue(value) {
  return value === true || value === "yes" || value === "on";
}

function normalizeGuest(guest) {
  const plusOnes = Array.isArray(guest.plusOnes)
    ? guest.plusOnes
    : String(guest.plusOneName || "")
        .split(",")
        .map((name) => ({ name: name.trim(), phone: "" }))
        .filter((item) => item.name);
  const canDrive = guest.canDrive || (guest.transportThere === "driving" ? "yes" : "no");
  const stay = guest.stayingOvernight || (guest.stayOvernight ? "yes" : "no");
  const dateAvailability = guest.dateAvailability && typeof guest.dateAvailability === "object" ? guest.dateAvailability : {};
  return {
    name: "",
    email: "",
    phone: "",
    placePreference: "decide-later",
    dateAvailability,
    plusOnes,
    plusOne: plusOnes.length > 0 || Boolean(guest.plusOne),
    plusOneName: plusOnes.map((item) => item.name).join(", ") || guest.plusOneName || "",
    canDrive,
    totalSeats: Number(guest.totalSeats || guest.carSeats || guest.seatsThere || 0),
    startingFrom: guest.startingFrom || guest.departureArea || "",
    preferredCarBuddy: guest.preferredCarBuddy || guest.rideWith || "",
    kayakPartnerPref: guest.kayakPartnerPref || guest.boatPartnerName || guest.boatSharePreference || "",
    kayakTypePref: guest.kayakTypePref || "any",
    kayakTypeNotes: guest.kayakTypeNotes || "",
    kayakExperience: guest.kayakExperience || guest.experienceLevel || "beginner",
    stayingOvernight: stay,
    stayOvernight: stay === "yes",
    hasTent: guest.hasTent || "",
    tentShareSpots: Number(guest.tentShareSpots || 0),
    tentNotes: guest.tentNotes || "",
    hasSleepingBag: guest.hasSleepingBag || "",
    eatingGroupFood: guest.eatingGroupFood ?? Boolean(guest.food || guest.allergies),
    dietaryPref: guest.dietaryPref || "meat",
    wantsDrinks: guest.wantsDrinks || "no",
    wantsSauna: Boolean(guest.wantsSauna),
    tshirtSize: guest.tshirtSize || "",
    canHelpWith: Array.isArray(guest.canHelpWith) ? guest.canHelpWith : [],
    emergencyContactName: guest.emergencyContactName || "",
    emergencyContactPhone: guest.emergencyContactPhone || "",
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
    plusOneName: String(input.plusOneName || "").trim().slice(0, 160),
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
    notes: String(input.notes || "").trim().slice(0, 500),
    ...cleanReferenceGuest(input, transportThere, transportBack)
  };
}

function cleanReferenceGuest(input, transportThere, transportBack) {
  const plusOnes = Array.isArray(input.plus_ones || input.plusOnes)
    ? (input.plus_ones || input.plusOnes)
        .map((item) => ({
          name: String(item.name || "").trim().slice(0, 80),
          phone: String(item.phone || "").trim().slice(0, 40)
        }))
        .filter((item) => item.name)
        .slice(0, 8)
    : [];
  const canDrive = String(input.can_drive || input.canDrive || "no").slice(0, 40);
  const totalSeats = Math.max(0, Number(input.total_seats || input.totalSeats || 0));
  const startingFrom = String(input.starting_from || input.startingFrom || input.departureArea || "").trim().slice(0, 160);
  const stayingOvernight = String(input.staying_overnight || input.stayingOvernight || (boolValue(input.stayOvernight) ? "yes" : "no")).slice(0, 40);
  const dateAvailability = input.date_availability || input.dateAvailability || {};
  return {
    dateAvailability: cleanAvailability(dateAvailability),
    plusOnes,
    plusOne: plusOnes.length > 0 || boolValue(input.plusOne),
    plusOneName: plusOnes.map((item) => item.name).join(", ") || String(input.plusOneName || "").trim().slice(0, 160),
    canDrive,
    totalSeats,
    startingFrom,
    preferredCarBuddy: String(input.preferred_car_buddy || input.preferredCarBuddy || "").trim().slice(0, 160),
    kayakPartnerPref: String(input.kayak_partner_pref || input.kayakPartnerPref || "").trim().slice(0, 160),
    kayakTypePref: String(input.kayak_type_pref || input.kayakTypePref || "any").slice(0, 40),
    kayakTypeNotes: String(input.kayak_type_notes || input.kayakTypeNotes || "").trim().slice(0, 240),
    kayakExperience: String(input.kayak_experience || input.kayakExperience || input.experienceLevel || "").slice(0, 40),
    stayingOvernight,
    stayOvernight: stayingOvernight === "yes",
    hasTent: String(input.has_tent || input.hasTent || "").slice(0, 40),
    tentShareSpots: Math.max(0, Number(input.tent_share_spots || input.tentShareSpots || 0)),
    tentNotes: String(input.tent_notes || input.tentNotes || "").trim().slice(0, 240),
    hasSleepingBag: String(input.has_sleeping_bag || input.hasSleepingBag || "").slice(0, 40),
    eatingGroupFood: input.eating_group_food ?? input.eatingGroupFood ?? true,
    dietaryPref: String(input.dietary_pref || input.dietaryPref || "meat").slice(0, 40),
    allergies: String(input.allergies || "").trim().slice(0, 500),
    wantsDrinks: String(input.wants_drinks || input.wantsDrinks || "no").slice(0, 40),
    wantsSauna: boolValue(input.wants_sauna ?? input.wantsSauna),
    tshirtSize: String(input.tshirt_size || input.tshirtSize || "").slice(0, 12),
    canHelpWith: Array.isArray(input.can_help_with || input.canHelpWith) ? (input.can_help_with || input.canHelpWith).map(String).slice(0, 12) : [],
    comments: String(input.comments || input.notes || "").trim().slice(0, 800),
    notes: String(input.comments || input.notes || "").trim().slice(0, 800),
    emergencyContactName: String(input.emergency_contact_name || input.emergencyContactName || "").trim().slice(0, 120),
    emergencyContactPhone: String(input.emergency_contact_phone || input.emergencyContactPhone || "").trim().slice(0, 80),
    transportThere: canDrive === "yes" || canDrive === "bolt_drive" ? "driving" : transportThere,
    transportBack: canDrive === "yes" || canDrive === "bolt_drive" ? "driving" : transportBack,
    seatsThere: totalSeats,
    seatsBack: totalSeats,
    departureArea: startingFrom,
    carSeats: totalSeats,
    comingByCar: canDrive === "yes" || canDrive === "bolt_drive"
  };
}

function cleanAvailability(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([date, availability]) => [String(date).slice(0, 100), String(availability).slice(0, 20)])
      .filter(([, availability]) => ["yes", "maybe", "no"].includes(availability))
  );
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
    plusOnes: guest.plusOnes,
    dateAvailability: guest.dateAvailability,
    canDrive: guest.canDrive,
    totalSeats: guest.totalSeats,
    startingFrom: guest.startingFrom,
    kayakPartnerPref: guest.kayakPartnerPref,
    kayakTypePref: guest.kayakTypePref,
    kayakTypeNotes: guest.kayakTypeNotes,
    kayakExperience: guest.kayakExperience,
    stayingOvernight: guest.stayingOvernight,
    tentShareSpots: guest.tentShareSpots,
    tentNotes: guest.tentNotes,
    dietaryPref: guest.dietaryPref,
    wantsDrinks: guest.wantsDrinks,
    wantsSauna: guest.wantsSauna,
    tshirtSize: guest.tshirtSize,
    canHelpWith: guest.canHelpWith,
    food: guest.food,
    boat: guest.boat
  }));
  return { trip, guests };
}

function adminState(state) {
  const { adminPin, ...trip } = state.trip;
  return { trip, guests: state.guests };
}

async function handleApi(req, res) {
  const state = await readState();

  if (req.method === "GET" && req.url === "/api/state") {
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && req.url === "/api/guests") {
    const guest = cleanGuest(await readBody(req));
    if (!guest.name || !guest.email || !guest.phone) {
      sendJson(res, 400, { error: "Name, email, and phone are required." });
      return;
    }
    const existing = state.guests.find((item) => item.email?.toLowerCase() === guest.email.toLowerCase());
    if (existing) {
      Object.assign(existing, guest, { updatedAt: new Date().toISOString() });
    } else {
      state.guests.push({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...guest
      });
    }
    await writeState(state);
    sendJson(res, existing ? 200 : 201, publicState(state));
    return;
  }

  if (req.method === "POST" && req.url === "/api/admin/login") {
    const body = await readBody(req);
    const pin = String(body.pin || "").trim();
    sendJson(res, pin === state.trip.adminPin ? 200 : 401, {
      ok: pin === state.trip.adminPin
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
  const pathname = req.url.split("?")[0];
  const requested = pathname === "/" ? "/index.html" : pathname;
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
