import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { marked } from "https://esm.sh/marked@12";

const SUPABASE_URL = "https://ejeymkhfhtrwuqowkioq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-XiFykzmn0WdqAIvzeNnkQ_gCJOEb_n";
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let state = null;
let tripId = "";
let adminUnlocked = false;
let currentStep = 0;
let plusOneCount = 0;
let editingGuestId = "";
let editingAsAdmin = false;
let selectedPerson = null;
let transportData = null;
let openPickerCarId = null;
let fleetData = null;
let selectedFleetPerson = null;
let openPickerBoatId = null;

const totalSteps = 8;
const formState = {
  options: {
    has_plus_ones: "no",
    submitter_status: "bolt",
    can_drive: "no",
    kayak_experience: "intermediate",
    staying_overnight: "no",
    eating_group_food: "yes",
    dietary_pref: "meat",
    wants_drinks: "no",
    wants_sauna: "no"
  },
  helpWith: []
};

let profileGuest = null;
let profilePlusOneCount = 0;
const profileState = {
  options: {},
  helpWith: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

const GUEST_FULL = "*, plus_ones(*)";
const GUEST_PUBLIC =
  "id, created_at, updated_at, name, submitter_status, can_drive, starting_from, preferred_car_buddy, kayak_partner_pref, kayak_type_pref, kayak_type_notes, kayak_experience, staying_overnight, has_tent, tent_share_spots, tent_notes, has_sleeping_bag, need_sleeping_bag, tent_preference, eating_group_food, dietary_pref, wants_drinks, wants_sauna, can_help_with, plus_ones(id, name, status, has_tent, tent_share_spots, tent_notes, has_sleeping_bag, need_sleeping_bag, tent_preference)";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function mapTrip(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    location: row.location,
    meetingPoint: row.meeting_point,
    intro: row.intro,
    dateOptions: [],
    placeOptions: [],
    lockedFields: row.locked_fields || [],
    registrationOpen: row.registration_open !== false
  };
}

function mapPlusOne(item) {
  return {
    id: item.id,
    name: item.name,
    phone: item.phone || "",
    status: item.status || "not_bolt",
    hasTent: item.has_tent || "",
    tentShareSpots: item.tent_share_spots || 0,
    tentNotes: item.tent_notes || "",
    hasSleepingBag: item.has_sleeping_bag || "",
    needSleepingBag: item.need_sleeping_bag || "",
    tentPreference: item.tent_preference || ""
  };
}

function mapGuest(row) {
  const plusOnes = (row.plus_ones || []).map(mapPlusOne);
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    email: row.email,
    phone: row.phone,
    submitterStatus: row.submitter_status,
    canDrive: row.can_drive,
    totalSeats: 0,
    startingFrom: row.starting_from,
    preferredCarBuddy: row.preferred_car_buddy,
    kayakPartnerPref: row.kayak_partner_pref,
    kayakTypePref: row.kayak_type_pref,
    kayakTypeNotes: row.kayak_type_notes,
    kayakExperience: row.kayak_experience,
    stayingOvernight: row.staying_overnight,
    stayOvernight: row.staying_overnight === "yes",
    hasTent: row.has_tent,
    tentShareSpots: row.tent_share_spots || 0,
    tentNotes: row.tent_notes,
    hasSleepingBag: row.has_sleeping_bag,
    needSleepingBag: row.need_sleeping_bag || "",
    tentPreference: row.tent_preference || "",
    eatingGroupFood: row.eating_group_food,
    dietaryPref: row.dietary_pref,
    allergies: row.allergies,
    wantsDrinks: row.wants_drinks,
    wantsSauna: row.wants_sauna,
    canHelpWith: row.can_help_with || [],
    comments: row.comments,
    notes: row.comments,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    plusOnes,
    plusOne: plusOnes.length > 0,
    plusOneName: plusOnes.map((item) => item.name).join(", ")
  };
}

async function fetchTrip() {
  const { data, error } = await sb
    .from("trips")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No active trip configured.");
  return data;
}

async function loadState(select) {
  const tripRow = await fetchTrip();
  tripId = tripRow.id;
  const { data, error } = await sb
    .from("guests")
    .select(select)
    .eq("trip_id", tripRow.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const { data: cars, error: carsError } = await sb
    .from("cars")
    .select("driver_guest_id, total_seats")
    .eq("trip_id", tripRow.id);
  if (carsError) throw new Error(carsError.message);
  const seatsByDriver = new Map((cars || []).map((car) => [car.driver_guest_id, car.total_seats || 0]));
  const guests = (data || []).map((row) => {
    const guest = mapGuest(row);
    guest.totalSeats = seatsByDriver.get(guest.id) || 0;
    return guest;
  });
  return { trip: mapTrip(tripRow), guests };
}

function loadPublicState() {
  return loadState(GUEST_PUBLIC);
}

function loadAdminState() {
  return loadState(GUEST_FULL);
}

function preservedTentFields(guest) {
  if (!guest) {
    return {
      has_tent: "",
      tent_share_spots: null,
      tent_notes: "",
      has_sleeping_bag: "",
      need_sleeping_bag: "",
      tent_preference: ""
    };
  }
  return {
    has_tent: guest.hasTent || "",
    tent_share_spots: guest.tentShareSpots ? Number(guest.tentShareSpots) : null,
    tent_notes: guest.tentNotes || "",
    has_sleeping_bag: guest.hasSleepingBag || "",
    need_sleeping_bag: guest.needSleepingBag || "",
    tent_preference: guest.tentPreference || ""
  };
}

function guestColumns(data) {
  return {
    name: String(data.name || "").trim(),
    email: String(data.email || "").trim(),
    phone: String(data.phone || "").trim(),
    submitter_status: data.submitter_status || "bolt",
    can_drive: data.can_drive || "no",
    starting_from: data.starting_from || "",
    preferred_car_buddy: data.preferred_car_buddy || "",
    kayak_partner_pref: data.kayak_partner_pref || "",
    kayak_type_pref: data.kayak_type_pref || "any",
    kayak_type_notes: data.kayak_type_notes || "",
    kayak_experience: data.kayak_experience || "",
    staying_overnight: data.staying_overnight || "no",
    has_tent: data.has_tent || "",
    tent_share_spots: data.tent_share_spots ? Number(data.tent_share_spots) : null,
    tent_notes: data.tent_notes || "",
    has_sleeping_bag: data.has_sleeping_bag || "",
    need_sleeping_bag: data.need_sleeping_bag || "",
    tent_preference: data.tent_preference || "",
    eating_group_food: data.eating_group_food !== false,
    dietary_pref: data.dietary_pref || "meat",
    allergies: data.allergies || "",
    wants_drinks: data.wants_drinks || "no",
    wants_sauna: Boolean(data.wants_sauna),
    can_help_with: Array.isArray(data.can_help_with) ? data.can_help_with : [],
    comments: data.comments || "",
    emergency_contact_name: data.emergency_contact_name || "",
    emergency_contact_phone: data.emergency_contact_phone || "",
    updated_at: new Date().toISOString()
  };
}

async function replacePlusOnes(guestId, plusOnes) {
  const { data: existing, error: existingError } = await sb.from("plus_ones").select("*").eq("guest_id", guestId);
  if (existingError) throw new Error(existingError.message);
  const byId = new Map((existing || []).map((item) => [item.id, item]));
  const byName = new Map((existing || []).map((item) => [String(item.name || "").trim().toLowerCase(), item]));

  const { error: deleteError } = await sb.from("plus_ones").delete().eq("guest_id", guestId);
  if (deleteError) throw new Error(deleteError.message);
  const rows = (plusOnes || [])
    .filter((item) => item && String(item.name || "").trim())
    .map((item) => {
      const prev = (item.id && byId.get(item.id)) || byName.get(String(item.name).trim().toLowerCase()) || {};
      return {
        guest_id: guestId,
        name: String(item.name).trim(),
        phone: String(item.phone || "").trim(),
        status: item.status || "not_bolt",
        has_tent: item.has_tent ?? prev.has_tent ?? "",
        tent_share_spots:
          item.tent_share_spots != null
            ? Number(item.tent_share_spots)
            : prev.tent_share_spots != null
              ? Number(prev.tent_share_spots)
              : null,
        tent_notes: item.tent_notes ?? prev.tent_notes ?? "",
        has_sleeping_bag: item.has_sleeping_bag ?? prev.has_sleeping_bag ?? "",
        need_sleeping_bag: item.need_sleeping_bag ?? prev.need_sleeping_bag ?? "",
        tent_preference: item.tent_preference ?? prev.tent_preference ?? ""
      };
    });
  if (rows.length) {
    const { error } = await sb.from("plus_ones").insert(rows);
    if (error) throw new Error(error.message);
  }
}

async function syncDriverCar(guestId, canDrive, seats) {
  const isDriver = ["yes", "bolt_drive"].includes(canDrive);
  if (!isDriver) {
    const { error } = await sb.from("cars").delete().eq("driver_guest_id", guestId);
    if (error) throw new Error(error.message);
    return;
  }
  const { data: existingCars, error: findError } = await sb
    .from("cars")
    .select("id")
    .eq("driver_guest_id", guestId)
    .limit(1);
  if (findError) throw new Error(findError.message);
  let carId;
  if (existingCars && existingCars.length) {
    carId = existingCars[0].id;
    const { error } = await sb.from("cars").update({ total_seats: seats }).eq("id", carId);
    if (error) throw new Error(error.message);
  } else {
    const { data: inserted, error } = await sb
      .from("cars")
      .insert({ trip_id: tripId, driver_guest_id: guestId, total_seats: seats })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    carId = inserted.id;
  }
  const { data: selfRow, error: selfError } = await sb
    .from("car_passengers")
    .select("id")
    .eq("car_id", carId)
    .eq("guest_id", guestId)
    .limit(1);
  if (selfError) throw new Error(selfError.message);
  if (!selfRow || !selfRow.length) {
    await sb.from("car_passengers").delete().eq("guest_id", guestId);
    const { error } = await sb.from("car_passengers").insert({ car_id: carId, guest_id: guestId });
    if (error) throw new Error(error.message);
  }
}

async function saveGuest(data, asAdmin = false) {
  const cols = guestColumns(data);
  if (!cols.name || !cols.email || !cols.phone) {
    throw new Error("Name, email, and phone are required.");
  }
  const editId = String(data.edit_id || "");
  const emailN = normalizeEmail(cols.email);
  const phoneN = normalizePhone(cols.phone);
  const { data: existing, error: dupError } = await sb.from("guests").select("id, email, phone");
  if (dupError) throw new Error(dupError.message);
  const duplicate = (existing || []).find(
    (item) => item.id !== editId && (normalizeEmail(item.email) === emailN || normalizePhone(item.phone) === phoneN)
  );
  if (duplicate) {
    throw new Error("A registration with this email or phone already exists. Use Edit my response.");
  }
  let guestId = editId;
  if (editId) {
    const { error } = await sb.from("guests").update(cols).eq("id", editId);
    if (error) throw new Error(error.message);
  } else {
    const { data: inserted, error } = await sb
      .from("guests")
      .insert({ ...cols, trip_id: tripId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    guestId = inserted.id;
  }
  await replacePlusOnes(guestId, data.plus_ones);
  await syncDriverCar(guestId, cols.can_drive, data.total_seats ? Number(data.total_seats) : 0);
  return asAdmin ? loadAdminState() : loadPublicState();
}

async function lookupGuest(email, phone) {
  const emailN = normalizeEmail(email);
  const phoneN = normalizePhone(phone);
  const { data, error } = await sb.from("guests").select(GUEST_FULL).ilike("email", String(email || "").trim());
  if (error) throw new Error(error.message);
  const match = (data || []).find(
    (item) => normalizeEmail(item.email) === emailN && normalizePhone(item.phone) === phoneN
  );
  if (!match) throw new Error("No registration found for that email and phone.");
  return mapGuest(match);
}

async function adminLogin(pin) {
  const tripRow = await fetchTrip();
  tripId = tripRow.id;
  if (String(pin || "").trim() !== String(tripRow.admin_pin || "")) {
    throw new Error("Wrong key");
  }
  return true;
}

async function saveSettings(trip) {
  const { error } = await sb
    .from("trips")
    .update({
      title: trip.title,
      date: trip.date,
      location: trip.location,
      meeting_point: trip.meetingPoint,
      intro: trip.intro,
      locked_fields: trip.lockedFields || [],
      registration_open: trip.registrationOpen !== false,
      updated_at: new Date().toISOString()
    })
    .eq("id", tripId);
  if (error) throw new Error(error.message);
  return loadAdminState();
}

async function deleteGuest(id) {
  const { error } = await sb.from("guests").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return loadAdminState();
}

async function loadTransport() {
  const { data: cars, error: carsError } = await sb
    .from("cars")
    .select(
      "id, total_seats, is_ready, driver_guest_id, driver:guests!cars_driver_guest_id_fkey(id, name, starting_from, staying_overnight), car_passengers(id, guest_id, plus_one_id, guest:guests(id, name, staying_overnight), plus_one:plus_ones(id, name, owner:guests(name, staying_overnight)))"
    )
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });
  if (carsError) throw new Error(carsError.message);

  const { data: guests, error: guestsError } = await sb
    .from("guests")
    .select("id, name, starting_from, staying_overnight, can_drive")
    .eq("trip_id", tripId)
    .order("name", { ascending: true });
  if (guestsError) throw new Error(guestsError.message);

  const { data: plusOnes, error: plusOnesError } = await sb
    .from("plus_ones")
    .select("id, name, guest_id, owner:guests(name, trip_id, staying_overnight)");
  if (plusOnesError) throw new Error(plusOnesError.message);

  const tripPlusOnes = (plusOnes || []).filter((item) => item.owner && item.owner.trip_id === tripId);

  const assignedGuestIds = new Set();
  const assignedPlusOneIds = new Set();
  (cars || []).forEach((car) => {
    (car.car_passengers || []).forEach((passenger) => {
      if (passenger.guest_id) assignedGuestIds.add(passenger.guest_id);
      if (passenger.plus_one_id) assignedPlusOneIds.add(passenger.plus_one_id);
    });
  });

  const unassignedGuests = (guests || [])
    .filter((guest) => !["yes", "bolt_drive"].includes(guest.can_drive))
    .filter((guest) => !assignedGuestIds.has(guest.id))
    .map((guest) => ({ type: "guest", id: guest.id, name: guest.name, startingFrom: guest.starting_from, stayingOvernight: guest.staying_overnight }));

  const unassignedPlusOnes = tripPlusOnes
    .filter((item) => !assignedPlusOneIds.has(item.id))
    .map((item) => ({ type: "plus_one", id: item.id, name: item.name, ownerName: item.owner ? item.owner.name : "", stayingOvernight: item.owner ? item.owner.staying_overnight : "no" }));

  return { cars: cars || [], unassigned: [...unassignedGuests, ...unassignedPlusOnes] };
}

async function renderTransport() {
  const carsEl = $("#transportCars");
  if (!carsEl) return;
  try {
    transportData = await loadTransport();
  } catch (error) {
    carsEl.innerHTML = `<p class="transport-empty">Could not load transport info: ${escapeHtml(error.message)}</p>`;
    return;
  }
  const stillOpen = transportData.cars.some((car) => car.id === openPickerCarId);
  if (!stillOpen) openPickerCarId = null;
  paintTransport();
}

function paintTransport() {
  if (!transportData) return;
  renderTransportSummary(transportData);
  renderTransportCars(transportData);
  renderTransportUnassigned(transportData);
}

function renderTransportSummary(data) {
  const el = $("#transportSummary");
  if (!el) return;
  const totalSeats = data.cars.reduce((sum, car) => sum + (car.total_seats || 0), 0);
  const filled = data.cars.reduce((sum, car) => sum + (car.car_passengers || []).length, 0);
  const free = data.cars.reduce((sum, car) => sum + Math.max(0, (car.total_seats || 0) - (car.car_passengers || []).length), 0);
  const items = [
    ["Cars", data.cars.length],
    ["Total seats", totalSeats],
    ["Seats filled", filled],
    ["Seats free", free],
    ["Unassigned", data.unassigned.length]
  ];
  el.innerHTML = items
    .map(([label, value]) => `<div class="transport-stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`)
    .join("");
}

function renderTransportCars(data) {
  const el = $("#transportCars");
  if (!el) return;
  if (!data.cars.length) {
    el.innerHTML = `<p class="transport-empty">No drivers yet. When someone registers as a driver, their car appears here.</p>`;
    return;
  }
  const sortedCars = [...data.cars].sort(
    (a, b) => Number(Boolean(b.is_ready)) - Number(Boolean(a.is_ready))
  );
  el.innerHTML = sortedCars.map((car) => carCardHtml(car)).join("");
}

function carCardHtml(car) {
  const driver = car.driver || {};
  const seats = car.total_seats || 0;
  const passengers = car.car_passengers || [];
  const seatsUnknown = seats <= 0;
  const freeSeats = seatsUnknown ? 0 : Math.max(0, seats - passengers.length);
  const isReady = Boolean(car.is_ready);

  const driverPassenger = passengers.find((passenger) => passenger.guest_id === car.driver_guest_id);
  const others = passengers.filter((passenger) => passenger !== driverPassenger);

  const slots = [];
  if (driverPassenger) slots.push(seatHtml(driverPassenger, true, isReady));
  else if (driver.id) slots.push(driverSeatFallback(driver));
  others.forEach((passenger) => slots.push(seatHtml(passenger, false, isReady)));
  if (!isReady) {
    if (seatsUnknown) {
      slots.push(emptySeatHtml(car.id, true));
    } else {
      for (let i = 0; i < freeSeats; i += 1) slots.push(emptySeatHtml(car.id, false));
    }
  }

  const departure = driver.starting_from
    ? `<span class="departure-pill">${departurePin()} ${escapeHtml(driver.starting_from)}</span>`
    : `<span class="departure-pill muted">${departurePin()} Departure TBD</span>`;

  return `<article class="car-card${isReady ? " is-ready" : ""}" data-car-id="${escapeHtml(car.id)}">
    <header class="car-card-header">
      <div class="car-title">
        <span class="wheel-icon" title="Driver">${wheelIcon()}</span>
        <h3>${escapeHtml(driver.name || "Unknown")}'s car</h3>
      </div>
      ${isReady ? readyBadge() : overnightBadge(driver.staying_overnight)}
    </header>
    <div class="car-departure">${departure}</div>
    <div class="seat-grid">${slots.join("")}</div>
    ${!isReady && openPickerCarId === car.id ? pickerHtml(car.id) : ""}
    ${!isReady && seatsUnknown ? `<p class="seat-note">Seat count not set - add seats in the driver's registration</p>` : ""}
    ${readyControlHtml(car.id, isReady)}
  </article>`;
}

function readyBadge() {
  return `<span class="overnight-badge ready" title="This car is ready and locked">${checkIcon()} Ready</span>`;
}

function readyControlHtml(carId, isReady) {
  const promise = "I have agreed with all the passengers where/when we are meeting and promise to keep them safe and on time";
  if (isReady) {
    return `<div class="car-ready-state" title="${escapeHtml(promise)}">${checkIcon()} <span>Driver approved &mdash; this car is ready and locked</span></div>`;
  }
  return `<button class="car-ready-toggle" type="button" data-mark-ready="${escapeHtml(carId)}" title="${escapeHtml(promise)}">
    <span class="car-ready-box" aria-hidden="true"></span>
    <span>I am the driver and I approve this car is ready</span>
  </button>`;
}

function checkIcon() {
  return `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function pickerHtml(carId) {
  const people = transportData ? transportData.unassigned : [];
  const options = people.length
    ? people
        .map(
          (person) =>
            `<button class="picker-option" type="button" data-pick-car="${escapeHtml(carId)}" data-person-type="${escapeHtml(person.type)}" data-person-id="${escapeHtml(person.id)}">
              <span class="chip-name">${escapeHtml(person.name)}${person.type === "plus_one" ? `<span class="plus-one-badge">+1</span>` : ""}</span>
              ${
                person.type === "plus_one"
                  ? `<span class="picker-detail">+1 of ${escapeHtml(person.ownerName || "?")}</span>`
                  : person.startingFrom
                    ? `<span class="picker-detail">${escapeHtml(person.startingFrom)}</span>`
                    : ""
              }
            </button>`
        )
        .join("")
    : `<p class="transport-empty">No unassigned people left.</p>`;
  return `<div class="seat-picker">
    <div class="seat-picker-head"><span>Add to this car</span><button class="seat-picker-close" type="button" data-close-picker aria-label="Close">×</button></div>
    <div class="seat-picker-list">${options}</div>
  </div>`;
}

function seatHtml(passenger, isDriver, locked = false) {
  const person = passenger.guest || passenger.plus_one || {};
  const isPlusOne = Boolean(passenger.plus_one_id);
  const name = person.name || "Unknown";
  const ownerName = isPlusOne && passenger.plus_one ? passenger.plus_one.owner?.name : "";
  const overnight = isPlusOne ? passenger.plus_one?.owner?.staying_overnight : person.staying_overnight;
  return `<div class="seat filled${isDriver ? " driver" : ""}">
    <span class="seat-person">${isDriver ? `<span class="seat-badge">${wheelIcon()}</span>` : ""}${escapeHtml(name)}${isPlusOne ? `<span class="plus-one-badge">+1</span>` : ""}${isDriver ? "" : overnightBadge(overnight)}${isPlusOne ? `<span class="seat-detail">+1 of ${escapeHtml(ownerName || "?")}</span>` : ""}</span>
    ${
      isDriver || locked
        ? `<span class="seat-role">${isDriver ? "Driver" : "Locked"}</span>`
        : `<button class="seat-remove" type="button" data-remove-passenger="${escapeHtml(passenger.id)}" aria-label="Unassign ${escapeHtml(name)}">×</button>`
    }
  </div>`;
}

function driverSeatFallback(driver) {
  return `<div class="seat filled driver"><span class="seat-person"><span class="seat-badge">${wheelIcon()}</span>${escapeHtml(driver.name || "Driver")}</span><span class="seat-role">Driver</span></div>`;
}

function emptySeatHtml(carId, unlimited) {
  return `<button class="seat empty" type="button" data-assign-car="${escapeHtml(carId)}"><span class="seat-empty-label">+ ${unlimited ? "Add" : "Available"}</span></button>`;
}

function renderTransportUnassigned(data) {
  const el = $("#transportUnassigned");
  if (!el) return;
  const chips = data.unassigned.map((person) => personChipHtml(person)).join("");
  el.innerHTML = `<div class="unassigned-head"><h3>Unassigned</h3><span class="unassigned-count">${data.unassigned.length} waiting for a seat</span></div>
    <div class="chip-pool">${chips || `<p class="transport-empty">Everyone has a seat.</p>`}</div>`;
}

function personChipHtml(person) {
  const selected = selectedPerson && selectedPerson.type === person.type && selectedPerson.id === person.id;
  const detail = person.type === "plus_one" ? `+1 of ${person.ownerName || "?"}` : person.startingFrom || "";
  return `<button class="person-chip${person.type === "plus_one" ? " is-plus-one" : ""}${selected ? " selected" : ""}" type="button" data-person-type="${escapeHtml(person.type)}" data-person-id="${escapeHtml(person.id)}" data-person-name="${escapeHtml(person.name)}">
    <span class="chip-name">${escapeHtml(person.name)}${person.type === "plus_one" ? `<span class="plus-one-badge">+1</span>` : ""}${overnightBadge(person.stayingOvernight)}</span>
    ${detail ? `<span class="chip-detail">${escapeHtml(detail)}</span>` : ""}
  </button>`;
}

function wheelIcon() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 4.6v5M6.2 17.8l3.2-3.2M17.8 17.8l-3.2-3.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}

function departurePin() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2.4" fill="currentColor"/></svg>`;
}

function overnightBadge(value) {
  if (value === "yes") return `<span class="overnight-badge stay" title="Staying overnight">⛺ Overnight</span>`;
  if (value === "maybe") return `<span class="overnight-badge maybe" title="Maybe overnight">⛺ Maybe</span>`;
  return `<span class="overnight-badge day" title="Day trip">☀️ Day trip</span>`;
}

async function assignPersonToCar(carId, person) {
  if (!person) return;
  const status = $("#transportStatus");
  try {
    const column = person.type === "guest" ? "guest_id" : "plus_one_id";
    await sb.from("car_passengers").delete().eq(column, person.id);
    const { error } = await sb.from("car_passengers").insert({ car_id: carId, [column]: person.id });
    if (error) throw new Error(error.message);
    selectedPerson = null;
    openPickerCarId = null;
    if (status) status.textContent = "";
    await renderTransport();
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function markCarReady(carId) {
  const status = $("#transportStatus");
  try {
    const { error } = await sb.from("cars").update({ is_ready: true }).eq("id", carId);
    if (error) throw new Error(error.message);
    if (openPickerCarId === carId) openPickerCarId = null;
    if (status) status.textContent = "Car marked as ready and locked.";
    await renderTransport();
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function unassignPassenger(id) {
  const status = $("#transportStatus");
  try {
    const { error } = await sb.from("car_passengers").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await renderTransport();
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function loadFleet() {
  const { data: boats, error: boatsError } = await sb
    .from("boats")
    .select(
      "id, boat_type, seats, label, boat_assignments(id, guest_id, plus_one_id, guest:guests(id, name, kayak_type_pref, kayak_experience), plus_one:plus_ones(id, name, owner:guests(name, kayak_type_pref, kayak_experience)))"
    )
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });
  if (boatsError) throw new Error(boatsError.message);

  const { data: guests, error: guestsError } = await sb
    .from("guests")
    .select("id, name, kayak_type_pref, kayak_experience")
    .eq("trip_id", tripId)
    .order("name", { ascending: true });
  if (guestsError) throw new Error(guestsError.message);

  const { data: plusOnes, error: plusOnesError } = await sb
    .from("plus_ones")
    .select("id, name, guest_id, owner:guests(name, trip_id, kayak_type_pref, kayak_experience)");
  if (plusOnesError) throw new Error(plusOnesError.message);

  const tripPlusOnes = (plusOnes || []).filter((item) => item.owner && item.owner.trip_id === tripId);

  const assignedGuestIds = new Set();
  const assignedPlusOneIds = new Set();
  (boats || []).forEach((boat) => {
    (boat.boat_assignments || []).forEach((occupant) => {
      if (occupant.guest_id) assignedGuestIds.add(occupant.guest_id);
      if (occupant.plus_one_id) assignedPlusOneIds.add(occupant.plus_one_id);
    });
  });

  const unassignedGuests = (guests || [])
    .filter((guest) => !assignedGuestIds.has(guest.id))
    .map((guest) => ({ type: "guest", id: guest.id, name: guest.name, boatPref: guest.kayak_type_pref, experience: guest.kayak_experience }));

  const unassignedPlusOnes = tripPlusOnes
    .filter((item) => !assignedPlusOneIds.has(item.id))
    .map((item) => ({
      type: "plus_one",
      id: item.id,
      name: item.name,
      ownerName: item.owner ? item.owner.name : "",
      boatPref: item.owner ? item.owner.kayak_type_pref : "any",
      experience: item.owner ? item.owner.kayak_experience : ""
    }));

  return { boats: boats || [], unassigned: [...unassignedGuests, ...unassignedPlusOnes] };
}

async function renderFleet() {
  const boatsEl = $("#fleetBoats");
  if (!boatsEl) return;
  try {
    fleetData = await loadFleet();
  } catch (error) {
    boatsEl.innerHTML = `<p class="transport-empty">Could not load fleet info: ${escapeHtml(error.message)}</p>`;
    return;
  }
  const stillOpen = fleetData.boats.some((boat) => boat.id === openPickerBoatId);
  if (!stillOpen) openPickerBoatId = null;
  paintFleet();
}

function paintFleet() {
  if (!fleetData) return;
  renderFleetSummary(fleetData);
  renderFleetBoats(fleetData);
  renderFleetUnassigned(fleetData);
}

function renderFleetSummary(data) {
  const el = $("#fleetSummary");
  if (!el) return;
  const totalSeats = data.boats.reduce((sum, boat) => sum + (boat.seats || 0), 0);
  const filled = data.boats.reduce((sum, boat) => sum + (boat.boat_assignments || []).length, 0);
  const free = data.boats.reduce((sum, boat) => sum + Math.max(0, (boat.seats || 0) - (boat.boat_assignments || []).length), 0);
  const items = [
    ["Boats", data.boats.length],
    ["Total seats", totalSeats],
    ["Seats filled", filled],
    ["Seats free", free],
    ["Unassigned", data.unassigned.length]
  ];
  el.innerHTML = items
    .map(([label, value]) => `<div class="transport-stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`)
    .join("");
}

function renderFleetBoats(data) {
  const el = $("#fleetBoats");
  if (!el) return;
  if (!data.boats.length) {
    el.innerHTML = `<p class="transport-empty">No boats in the fleet yet.</p>`;
    return;
  }
  el.innerHTML = data.boats.map((boat) => boatCardHtml(boat)).join("");
}

function boatCardHtml(boat) {
  const seats = boat.seats || 0;
  const occupants = boat.boat_assignments || [];
  const freeSeats = Math.max(0, seats - occupants.length);

  const slots = occupants.map((occupant) => boatSeatHtml(occupant));
  for (let i = 0; i < freeSeats; i += 1) slots.push(emptyBoatSeatHtml(boat.id));

  return `<article class="car-card" data-boat-id="${escapeHtml(boat.id)}">
    <header class="car-card-header">
      <div class="car-title">
        <span class="boat-icon" title="${escapeHtml(labelBoatType(boat.boat_type))}">${boatIcon(boat.boat_type)}</span>
        <h3>${escapeHtml(boat.label || "Boat")}</h3>
      </div>
      <span class="boat-type-pill">${escapeHtml(labelBoatType(boat.boat_type))}</span>
    </header>
    <div class="seat-grid">${slots.join("")}</div>
    ${openPickerBoatId === boat.id ? boatPickerHtml(boat.id) : ""}
  </article>`;
}

function boatPickerHtml(boatId) {
  const people = fleetData ? fleetData.unassigned : [];
  const options = people.length
    ? people
        .map(
          (person) =>
            `<button class="picker-option" type="button" data-pick-boat="${escapeHtml(boatId)}" data-person-type="${escapeHtml(person.type)}" data-person-id="${escapeHtml(person.id)}">
              <span class="chip-name">${escapeHtml(person.name)}${person.type === "plus_one" ? `<span class="plus-one-badge">+1</span>` : ""}${boatPrefBadge(person.boatPref)}${experienceBadge(person.experience)}</span>
              ${
                person.type === "plus_one"
                  ? `<span class="picker-detail">+1 of ${escapeHtml(person.ownerName || "?")}</span>`
                  : ""
              }
            </button>`
        )
        .join("")
    : `<p class="transport-empty">No unassigned people left.</p>`;
  return `<div class="seat-picker">
    <div class="seat-picker-head"><span>Add to this boat</span><button class="seat-picker-close" type="button" data-close-boat-picker aria-label="Close">×</button></div>
    <div class="seat-picker-list">${options}</div>
  </div>`;
}

function boatSeatHtml(occupant) {
  const person = occupant.guest || occupant.plus_one || {};
  const isPlusOne = Boolean(occupant.plus_one_id);
  const name = person.name || "Unknown";
  const ownerName = isPlusOne && occupant.plus_one ? occupant.plus_one.owner?.name : "";
  const boatPref = isPlusOne ? occupant.plus_one?.owner?.kayak_type_pref : person.kayak_type_pref;
  const experience = isPlusOne ? occupant.plus_one?.owner?.kayak_experience : person.kayak_experience;
  return `<div class="seat filled">
    <span class="seat-person">${escapeHtml(name)}${isPlusOne ? `<span class="plus-one-badge">+1</span>` : ""}${boatPrefBadge(boatPref)}${experienceBadge(experience)}${isPlusOne ? `<span class="seat-detail">+1 of ${escapeHtml(ownerName || "?")}</span>` : ""}</span>
    <button class="seat-remove" type="button" data-remove-occupant="${escapeHtml(occupant.id)}" aria-label="Remove ${escapeHtml(name)}">×</button>
  </div>`;
}

function emptyBoatSeatHtml(boatId) {
  return `<button class="seat empty" type="button" data-assign-boat="${escapeHtml(boatId)}"><span class="seat-empty-label">+ Available</span></button>`;
}

function renderFleetUnassigned(data) {
  const el = $("#fleetUnassigned");
  if (!el) return;
  const chips = data.unassigned.map((person) => fleetChipHtml(person)).join("");
  el.innerHTML = `<div class="unassigned-head"><h3>Unassigned</h3><span class="unassigned-count">${data.unassigned.length} waiting for a boat</span></div>
    <div class="chip-pool">${chips || `<p class="transport-empty">Everyone has a boat.</p>`}</div>`;
}

function fleetChipHtml(person) {
  const selected = selectedFleetPerson && selectedFleetPerson.type === person.type && selectedFleetPerson.id === person.id;
  const detail = person.type === "plus_one" ? `+1 of ${person.ownerName || "?"}` : "";
  return `<button class="person-chip${person.type === "plus_one" ? " is-plus-one" : ""}${selected ? " selected" : ""}" type="button" data-person-type="${escapeHtml(person.type)}" data-person-id="${escapeHtml(person.id)}" data-person-name="${escapeHtml(person.name)}">
    <span class="chip-name">${escapeHtml(person.name)}${person.type === "plus_one" ? `<span class="plus-one-badge">+1</span>` : ""}${boatPrefBadge(person.boatPref)}${experienceBadge(person.experience)}</span>
    ${detail ? `<span class="chip-detail">${escapeHtml(detail)}</span>` : ""}
  </button>`;
}

function labelBoatType(value) {
  return {
    two_seater_kayak: "Kayak",
    two_seater_canoe: "Canoe",
    three_seater_kayak: "Kayak",
    three_seater_canoe: "Canoe",
    kayak: "Kayak",
    canoe: "Canoe"
  }[value] || "Boat";
}

function boatPrefBadge(value) {
  if (value === "two_person") return `<span class="boat-pref-badge kayak" title="Prefers a kayak">🛶 Prefers kayak</span>`;
  if (value === "two_person_canoe") return `<span class="boat-pref-badge canoe" title="Prefers a canoe">🛶 Prefers canoe</span>`;
  return `<span class="boat-pref-badge any" title="No boat preference">Any boat</span>`;
}

function boatIcon(boatType) {
  const isCanoe = String(boatType || "").includes("canoe");
  const label = isCanoe ? "Canoe" : "Kayak";
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><title>${label}</title><path d="M2 14c4 3 16 3 20 0-2 4-6 6-10 6S4 18 2 14z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 4v9" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}

async function assignPersonToBoat(boatId, person) {
  if (!person) return;
  const status = $("#fleetStatus");
  try {
    const column = person.type === "guest" ? "guest_id" : "plus_one_id";
    await sb.from("boat_assignments").delete().eq(column, person.id);
    const { error } = await sb.from("boat_assignments").insert({ boat_id: boatId, [column]: person.id });
    if (error) throw new Error(error.message);
    selectedFleetPerson = null;
    openPickerBoatId = null;
    if (status) status.textContent = "";
    await renderFleet();
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function unassignBoatOccupant(id) {
  const status = $("#fleetStatus");
  try {
    const { error } = await sb.from("boat_assignments").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await renderFleet();
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

function participantCount() {
  return state.guests.reduce((sum, guest) => sum + 1 + (guest.plusOnes?.length || (guest.plusOne ? 1 : 0)), 0);
}

function driverCount() {
  return state.guests.filter((guest) => ["yes", "bolt_drive"].includes(guest.canDrive)).length;
}

function seatCount() {
  return state.guests.reduce((sum, guest) => sum + (["yes", "bolt_drive"].includes(guest.canDrive) ? Number(guest.totalSeats || 0) : 0), 0);
}

function overnightCount() {
  return state.guests.filter((guest) => guest.stayingOvernight === "yes" || guest.stayOvernight).length;
}

function renderTripView() {
  $(".logo").innerHTML = `<span>${escapeHtml(firstWord(state.trip.title || "Bolt"))}</span> ${escapeHtml(restWords(state.trip.title || "Kayak Trip"))} <strong>2026</strong>`;
  renderParticipantDatalist();
  renderGuestList();
  updateNav();
  updateRegistrationLock();
}

function isRegistrationOpen() {
  return !state || !state.trip || state.trip.registrationOpen !== false;
}

function updateRegistrationLock() {
  const startButton = $("#startButton");
  if (!startButton) return;
  const open = isRegistrationOpen();
  startButton.disabled = !open;
  startButton.classList.toggle("is-locked", !open);
  startButton.textContent = open ? "Let's go" : "Trip full";
  const note = $("#registrationClosedNote");
  if (note) note.hidden = open;
}

function firstWord(value) {
  return String(value).split(" ")[0] || "Bolt";
}

function restWords(value) {
  const words = String(value).split(" ");
  return words.slice(1).join(" ") || "Kayak Trip";
}

function renderParticipantDatalist() {
  const options = [`<option value="">No preference</option>`, ...state.guests.map((guest) => `<option value="${escapeHtml(guest.name)}">${escapeHtml(guest.name)}</option>`)].join("");
  $("#participantList").innerHTML = state.guests.map((guest) => `<option value="${escapeHtml(guest.name)}"></option>`).join("");
  $("#f_preferred_car_buddy").innerHTML = options;
  $("#f_kayak_partner").innerHTML = options;
  const buddy = $("#p_preferred_car_buddy");
  const partner = $("#p_kayak_partner");
  if (buddy) {
    const current = buddy.value;
    buddy.innerHTML = options;
    buddy.value = current;
  }
  if (partner) {
    const current = partner.value;
    partner.innerHTML = options;
    partner.value = current;
  }
  populateProfileSelect();
}

function populateProfileSelect() {
  const select = $("#profileGuestSelect");
  if (!select) return;
  const current = select.value;
  select.innerHTML = [
    `<option value="">Select your name...</option>`,
    ...state.guests.map((guest) => `<option value="${escapeHtml(guest.id)}">${escapeHtml(guest.name)}</option>`)
  ].join("");
  if (current && state.guests.some((guest) => guest.id === current)) select.value = current;
}

function goToStep(step) {
  const target = Math.max(0, Math.min(totalSteps, step));
  const previous = $(".step.active");
  const next = $(`.step[data-step="${target}"]`);
  if (!next) return;
  previous?.classList.remove("active");
  next.classList.add("active");
  currentStep = target;
  if (currentStep === totalSteps) buildReview();
  updateNav();
  window.scrollTo({ top: 0 });
  setTimeout(() => {
    next.querySelector("input, textarea, select")?.focus({ preventScroll: true });
  }, 160);
}

function nextStep() {
  if (currentStep === totalSteps) {
    submitGuest();
    return;
  }
  if (currentStep > 0 && !validateStep(currentStep)) return;
  if (currentStep === 2 && !validatePlusOnes()) return;
  goToStep(currentStep + 1);
}

function prevStep() {
  if (currentStep > 0) goToStep(currentStep - 1);
}

function updateNav() {
  const nav = $("#formNav");
  const prev = $("#prevBtn");
  const next = $("#nextBtn");
  const counter = $("#stepCounter");
  document.body.classList.toggle("registration-active", currentStep > 0);
  nav.style.display = currentStep === 0 ? "none" : "flex";
  prev.style.visibility = currentStep <= 1 ? "hidden" : "visible";
  counter.textContent = currentStep === 0 ? "" : `Step ${currentStep} of ${totalSteps}`;
  $("#progressFill").style.width = currentStep === 0 ? "0%" : `${(currentStep / totalSteps) * 100}%`;
  if (currentStep === totalSteps) {
    next.textContent = editingGuestId ? "Update" : "Submit";
    next.classList.add("submit");
    next.classList.remove("primary");
  } else {
    next.textContent = "Continue →";
    next.classList.add("primary");
    next.classList.remove("submit");
  }
  applyFieldLocks();
}

function validateStep(step) {
  const stepEl = $(`.step[data-step="${step}"]`);
  const invalid = stepEl.querySelector(":invalid");
  if (!invalid) return true;
  invalid.reportValidity();
  return false;
}

function validatePlusOnes() {
  if (formState.options.has_plus_ones !== "yes") return true;
  const cards = $$(".plus-one-card");
  if (!cards.length) {
    addPlusOne();
    return false;
  }
  const empty = cards.find((card) => !card.querySelector(".po-name").value.trim());
  if (!empty) return true;
  empty.querySelector(".po-name").reportValidity();
  return false;
}

function selectOption(card) {
  const field = card.dataset.field;
  const value = card.dataset.value;
  card.parentElement.querySelectorAll(".option-card").forEach((item) => item.classList.remove("selected"));
  card.classList.add("selected");
  formState.options[field] = value;

  if (field === "has_plus_ones") {
    toggle("plusOneSection", value === "yes");
    if (value === "yes" && !$("#plusOneList").children.length) addPlusOne();
    syncPlusOneInputs();
  }
  if (field === "can_drive") toggle("driverSection", value === "yes" || value === "bolt_drive");
  if (field === "eating_group_food") toggle("foodSection", value === "yes");
}

function setOption(field, value) {
  if (!value) return;
  const option = $(`[data-field="${field}"][data-value="${value}"]`);
  if (option) selectOption(option);
}

function toggle(id, show) {
  $(`#${id}`)?.classList.toggle("show", show);
}

function syncPlusOneInputs() {
  const disabled = formState.options.has_plus_ones !== "yes";
  $$(".plus-one-card input, .plus-one-card select").forEach((field) => {
    field.disabled = disabled;
  });
}

function addPlusOne() {
  plusOneCount += 1;
  const id = `plus_one_${plusOneCount}`;
  const card = document.createElement("div");
  card.className = "plus-one-card";
  card.id = id;
  card.innerHTML = `<div class="plus-one-header">
      <h4>+1 #${plusOneCount}</h4>
      <button class="remove-btn" data-remove-plus-one="${id}" type="button" aria-label="Remove plus one">×</button>
    </div>
    <label class="field-group">Name * <input class="po-name" required placeholder="Full name" /></label>
    <label class="field-group">Phone <small>Optional, if organizers should add them to the group</small><input class="po-phone" type="tel" placeholder="+372..." /></label>
    <label class="field-group">Bolt connection <select class="po-status">
      <option value="bolt">Bolt</option>
      <option value="ex_bolt">Ex-Bolt</option>
      <option value="not_bolt" selected>Not Bolt</option>
    </select></label>`;
  $("#plusOneList").appendChild(card);
  syncPlusOneInputs();
}

function toggleHelp(chip) {
  const value = chip.dataset.help;
  chip.classList.toggle("selected");
  if (chip.classList.contains("selected")) {
    if (!formState.helpWith.includes(value)) formState.helpWith.push(value);
  } else {
    formState.helpWith = formState.helpWith.filter((item) => item !== value);
  }
}

function collectData() {
  const startingFrom = $("#f_starting_from").value;
  const customStart = $("#f_starting_from_custom").value.trim();
  const plusOnes =
    formState.options.has_plus_ones === "yes"
      ? $$(".plus-one-card")
          .map((card) => ({
            id: card.dataset.plusOneId || "",
            name: card.querySelector(".po-name").value.trim(),
            phone: card.querySelector(".po-phone").value.trim(),
            status: card.querySelector(".po-status").value
          }))
          .filter((item) => item.name)
      : [];

  return {
    edit_id: editingGuestId,
    name: $("#f_name").value.trim(),
    email: $("#f_email").value.trim(),
    phone: $("#f_phone").value.trim(),
    submitter_status: formState.options.submitter_status || "bolt",
    plus_ones: plusOnes,
    can_drive: formState.options.can_drive || "no",
    total_seats: $("#f_total_seats").value || null,
    starting_from: startingFrom === "other" ? customStart : startingFrom,
    preferred_car_buddy: $("#f_preferred_car_buddy").value.trim(),
    kayak_partner_pref: $("#f_kayak_partner").value.trim(),
    kayak_type_pref: $("#f_kayak_type").value,
    kayak_type_notes: $("#f_kayak_type_notes").value.trim(),
    kayak_experience: formState.options.kayak_experience || "",
    staying_overnight: formState.options.staying_overnight || "no",
    ...preservedTentFields(state?.guests?.find((guest) => guest.id === editingGuestId)),
    eating_group_food: formState.options.eating_group_food !== "no",
    dietary_pref: formState.options.dietary_pref || "meat",
    allergies: $("#f_allergies").value.trim(),
    wants_drinks: formState.options.wants_drinks || "no",
    wants_sauna: formState.options.wants_sauna === "yes",
    can_help_with: formState.helpWith,
    comments: $("#f_comments").value.trim(),
    emergency_contact_name: $("#f_emergency_name").value.trim(),
    emergency_contact_phone: $("#f_emergency_phone").value.trim()
  };
}

function buildReview() {
  const data = collectData();
  const drinksLabel = { yes: "Yes", soft: "Soft drinks only", no: "No thanks" }[data.wants_drinks] || data.wants_drinks;

  $("#reviewContent").innerHTML = [
    reviewSection("About You", 1, [
      ["Name", data.name],
      ["Email", data.email],
      ["Phone", data.phone],
      ["Bolt connection", labelBoltStatus(data.submitter_status)],
      ["+1s", data.plus_ones.map((item) => item.name).join(", ") || "None"]
    ]),
    reviewSection("Trip date", null, [["Date", "July 25-26, 2026"]]),
    reviewSection("Transportation", 3, [
      ["Driver", `${data.can_drive}${data.total_seats ? ` (${data.total_seats} seats)` : ""}`],
      ["Starting from", data.starting_from || "Not set"],
      ["Ride buddy", data.preferred_car_buddy || "No preference"]
    ]),
    reviewSection("Kayaking", 4, [
      ["Partner", data.kayak_partner_pref || "Assign me"],
      ["Kayak type", labelKayakType(data.kayak_type_pref)],
      ["Kayak notes", data.kayak_type_notes || "-"],
      ["Experience", data.kayak_experience || "Not set"]
    ]),
    reviewSection("Overnight and Food", 5, [
      ["Staying", data.staying_overnight],
      ["Food", data.eating_group_food ? data.dietary_pref : "Bringing own"],
      ["Allergies", data.allergies || "-"],
      ["Drinks", drinksLabel],
      ["Sauna", data.wants_sauna ? "Yes" : "No"]
    ]),
    reviewSection("Extras", 7, [
      ["Helping with", data.can_help_with.join(", ") || "-"],
      ["Emergency", data.emergency_contact_name ? `${data.emergency_contact_name} (${data.emergency_contact_phone || "no phone"})` : "-"],
      ["Notes", data.comments || "-"]
    ])
  ].join("");
}

function reviewSection(title, step, rows) {
  return `<section class="review-section">
    <div class="review-section-header">
      <h4>${escapeHtml(title)}</h4>
      ${step ? `<button class="review-edit-btn" data-review-step="${step}" type="button">Edit</button>` : ""}
    </div>
    ${rows.map(([label, value]) => `<div class="review-row"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`).join("")}
  </section>`;
}

async function submitGuest() {
  const button = $("#nextBtn");
  const data = collectData();
  if (!editingGuestId && !editingAsAdmin && !isRegistrationOpen()) {
    $("#guestStatus").textContent = "Registration is closed.";
    return;
  }
  try {
    button.disabled = true;
    button.textContent = editingGuestId ? "Updating..." : "Submitting...";
    state = await saveGuest(data, editingAsAdmin);
    $("#app").classList.add("hidden");
    $("#successPanel").classList.remove("hidden");
    $("#guestStatus").textContent = "";
    $("#successPanel h2").textContent = editingGuestId ? "Your response is updated" : "You're registered";
    renderTripView();
    renderTransport();
  } catch (error) {
    $("#guestStatus").textContent = error.message;
  } finally {
    button.disabled = false;
    updateNav();
  }
}

function resetFormFlow() {
  $("#guestForm").reset();
  $("#plusOneList").innerHTML = "";
  plusOneCount = 0;
  editingGuestId = "";
  editingAsAdmin = false;
  formState.helpWith = [];
  formState.options = {
    has_plus_ones: "no",
    submitter_status: "bolt",
    can_drive: "no",
    kayak_experience: "intermediate",
    staying_overnight: "no",
    eating_group_food: "yes",
    dietary_pref: "meat",
    wants_drinks: "no",
    wants_sauna: "no"
  };
  $$(".selected").forEach((item) => item.classList.remove("selected"));
  $$('[data-field="has_plus_ones"][data-value="no"], [data-field="submitter_status"][data-value="bolt"], [data-field="can_drive"][data-value="no"], [data-field="kayak_experience"][data-value="intermediate"], [data-field="staying_overnight"][data-value="no"], [data-field="eating_group_food"][data-value="yes"], [data-field="dietary_pref"][data-value="meat"], [data-field="wants_drinks"][data-value="no"], [data-field="wants_sauna"][data-value="no"]').forEach((item) => item.classList.add("selected"));
  $$(".conditional").forEach((item) => item.classList.remove("show"));
  $("#foodSection").classList.add("show");
  $("#successPanel").classList.add("hidden");
  $("#app").classList.remove("hidden");
  goToStep(0);
}

function loadGuestForEdit(guest, asAdmin = false) {
  resetFormFlow();
  document.body.classList.remove("panel-open");
  $$(".registration-side-panel").forEach((el) => el.classList.remove("page-active"));
  history.replaceState(null, "", location.pathname);
  editingGuestId = guest.id;
  editingAsAdmin = asAdmin;
  $("#f_name").value = guest.name || "";
  $("#f_email").value = guest.email || "";
  $("#f_phone").value = guest.phone || "";
  setOption("submitter_status", guest.submitterStatus || "bolt");
  if (guest.plusOnes?.length) {
    setOption("has_plus_ones", "yes");
    $("#plusOneList").innerHTML = "";
    plusOneCount = 0;
    guest.plusOnes.forEach((plusOne) => {
      addPlusOne();
      const card = $("#plusOneList").lastElementChild;
      if (plusOne.id) card.dataset.plusOneId = plusOne.id;
      card.querySelector(".po-name").value = plusOne.name || "";
      card.querySelector(".po-phone").value = plusOne.phone || "";
      card.querySelector(".po-status").value = plusOne.status || "not_bolt";
    });
  }
  setOption("can_drive", guest.canDrive || "no");
  $("#f_total_seats").value = guest.totalSeats || "";
  $("#f_starting_from").value = ["Bolt HQ", "Tartu"].includes(guest.startingFrom) ? guest.startingFrom : guest.startingFrom ? "other" : "";
  $("#f_starting_from_custom").value = $("#f_starting_from").value === "other" ? guest.startingFrom : "";
  toggle("customStartSection", $("#f_starting_from").value === "other");
  $("#f_preferred_car_buddy").value = guest.preferredCarBuddy || "";
  $("#f_kayak_partner").value = guest.kayakPartnerPref || "";
  $("#f_kayak_type").value = guest.kayakTypePref || "any";
  $("#f_kayak_type_notes").value = guest.kayakTypeNotes || "";
  setOption("kayak_experience", guest.kayakExperience || "intermediate");
  setOption("staying_overnight", guest.stayingOvernight || "no");
  setOption("eating_group_food", guest.eatingGroupFood === false ? "no" : "yes");
  setOption("dietary_pref", guest.dietaryPref || "meat");
  $("#f_allergies").value = guest.allergies || "";
  setOption("wants_drinks", guest.wantsDrinks || "no");
  setOption("wants_sauna", guest.wantsSauna ? "yes" : "no");
  formState.helpWith = Array.isArray(guest.canHelpWith) ? [...guest.canHelpWith] : [];
  $$(".chip[data-help]").forEach((chip) => chip.classList.toggle("selected", formState.helpWith.includes(chip.dataset.help)));
  $("#f_emergency_name").value = guest.emergencyContactName || "";
  $("#f_emergency_phone").value = guest.emergencyContactPhone || "";
  $("#f_comments").value = guest.comments || guest.notes || "";
  $("#successPanel").classList.add("hidden");
  $("#app").classList.remove("hidden");
  goToStep(1);
  applyFieldLocks();
}

function applyFieldLocks() {
  const locked = editingGuestId && !editingAsAdmin ? state.trip.lockedFields || [] : [];
  const groups = {
    contact: ["#f_name", "#f_email", "#f_phone", '[data-field="submitter_status"]'],
    transport: ['[data-field="can_drive"]', "#f_total_seats", "#f_starting_from", "#f_starting_from_custom", "#f_preferred_car_buddy"],
    kayak: ["#f_kayak_partner", "#f_kayak_type", "#f_kayak_type_notes", '[data-field="kayak_experience"]'],
    overnight: ['[data-field="staying_overnight"]'],
    food: ['[data-field="eating_group_food"]', '[data-field="dietary_pref"]', "#f_allergies", '[data-field="wants_drinks"]', '[data-field="wants_sauna"]']
  };
  Object.entries(groups).forEach(([group, selectors]) => {
    const disabled = locked.includes(group);
    selectors.forEach((selector) => {
      $$(selector).forEach((element) => {
        element.disabled = disabled;
        element.classList.toggle("locked", disabled);
      });
    });
  });
}

function profileSelectOption(card) {
  const field = card.dataset.field;
  const value = card.dataset.value;
  card.parentElement.querySelectorAll(".option-card").forEach((item) => item.classList.remove("selected"));
  card.classList.add("selected");
  profileState.options[field] = value;

  if (field === "has_plus_ones") {
    profileToggle("p_plusOneSection", value === "yes");
    if (value === "yes" && !$("#p_plusOneList").children.length) addProfilePlusOne();
    syncProfilePlusOneInputs();
  }
  if (field === "can_drive") profileToggle("p_driverSection", value === "yes" || value === "bolt_drive");
  if (field === "eating_group_food") profileToggle("p_foodSection", value === "yes");
}

function profileSetOption(field, value) {
  if (!value) return;
  const option = document.querySelector(`#profile [data-field="${field}"][data-value="${value}"]`);
  if (option) profileSelectOption(option);
}

function profileToggle(id, show) {
  $(`#${id}`)?.classList.toggle("show", show);
}

function syncProfilePlusOneInputs() {
  const disabled = profileState.options.has_plus_ones !== "yes";
  $$("#p_plusOneList input, #p_plusOneList select").forEach((field) => {
    field.disabled = disabled;
  });
}

function addProfilePlusOne() {
  profilePlusOneCount += 1;
  const id = `profile_plus_one_${profilePlusOneCount}`;
  const card = document.createElement("div");
  card.className = "plus-one-card";
  card.id = id;
  card.innerHTML = `<div class="plus-one-header">
      <h4>+1 #${profilePlusOneCount}</h4>
      <button class="remove-btn" data-remove-profile-plus-one="${id}" type="button" aria-label="Remove plus one">×</button>
    </div>
    <label class="field-group">Name * <input class="po-name" required placeholder="Full name" /></label>
    <label class="field-group">Phone <small>Optional, if organizers should add them to the group</small><input class="po-phone" type="tel" placeholder="+372..." /></label>
    <label class="field-group">Bolt connection <select class="po-status">
      <option value="bolt">Bolt</option>
      <option value="ex_bolt">Ex-Bolt</option>
      <option value="not_bolt" selected>Not Bolt</option>
    </select></label>`;
  $("#p_plusOneList").appendChild(card);
  syncProfilePlusOneInputs();
  return card;
}

function toggleProfileHelp(chip) {
  const value = chip.dataset.help;
  chip.classList.toggle("selected");
  if (chip.classList.contains("selected")) {
    if (!profileState.helpWith.includes(value)) profileState.helpWith.push(value);
  } else {
    profileState.helpWith = profileState.helpWith.filter((item) => item !== value);
  }
}

function resetProfileFields() {
  profileState.options = {};
  profileState.helpWith = [];
  profilePlusOneCount = 0;
  $("#p_plusOneList").innerHTML = "";
  $$("#profile .option-card.selected").forEach((item) => item.classList.remove("selected"));
  $$("#profile .chip.selected").forEach((item) => item.classList.remove("selected"));
  $$("#profile .conditional").forEach((item) => {
    if (item.id !== "profileVerify") item.classList.remove("show");
  });
  ["p_total_seats", "p_starting_from", "p_starting_from_custom", "p_kayak_type_notes", "p_allergies", "p_emergency_name", "p_emergency_phone", "p_comments"].forEach((id) => {
    const el = $(`#${id}`);
    if (el) el.value = "";
  });
}

function loadProfile(guest) {
  profileGuest = guest;
  resetProfileFields();
  $("#p_name").textContent = guest.name || "";
  $("#p_email").textContent = guest.email || "";
  $("#p_phone").textContent = guest.phone || "";
  profileSetOption("submitter_status", guest.submitterStatus || "bolt");

  profileSetOption("has_plus_ones", guest.plusOnes?.length ? "yes" : "no");
  if (guest.plusOnes?.length) {
    $("#p_plusOneList").innerHTML = "";
    profilePlusOneCount = 0;
    guest.plusOnes.forEach((plusOne) => {
      const card = addProfilePlusOne();
      if (plusOne.id) card.dataset.plusOneId = plusOne.id;
      card.querySelector(".po-name").value = plusOne.name || "";
      card.querySelector(".po-phone").value = plusOne.phone || "";
      card.querySelector(".po-status").value = plusOne.status || "not_bolt";
    });
  }

  profileSetOption("can_drive", guest.canDrive || "no");
  $("#p_total_seats").value = guest.totalSeats || "";
  $("#p_starting_from").value = ["Bolt HQ", "Tartu"].includes(guest.startingFrom) ? guest.startingFrom : guest.startingFrom ? "other" : "";
  $("#p_starting_from_custom").value = $("#p_starting_from").value === "other" ? guest.startingFrom : "";
  profileToggle("p_customStartSection", $("#p_starting_from").value === "other");
  $("#p_preferred_car_buddy").value = guest.preferredCarBuddy || "";
  $("#p_kayak_partner").value = guest.kayakPartnerPref || "";
  $("#p_kayak_type").value = guest.kayakTypePref || "any";
  $("#p_kayak_type_notes").value = guest.kayakTypeNotes || "";
  profileSetOption("kayak_experience", guest.kayakExperience || "intermediate");
  profileSetOption("staying_overnight", guest.stayingOvernight || "no");
  profileSetOption("eating_group_food", guest.eatingGroupFood === false ? "no" : "yes");
  profileSetOption("dietary_pref", guest.dietaryPref || "meat");
  $("#p_allergies").value = guest.allergies || "";
  profileSetOption("wants_drinks", guest.wantsDrinks || "no");
  profileSetOption("wants_sauna", guest.wantsSauna ? "yes" : "no");
  profileState.helpWith = Array.isArray(guest.canHelpWith) ? [...guest.canHelpWith] : [];
  $$("#p_helpChips .chip[data-help]").forEach((chip) => chip.classList.toggle("selected", profileState.helpWith.includes(chip.dataset.help)));
  $("#p_emergency_name").value = guest.emergencyContactName || "";
  $("#p_emergency_phone").value = guest.emergencyContactPhone || "";
  $("#p_comments").value = guest.comments || guest.notes || "";
  applyProfileFieldLocks();
  $("#profileFields").classList.remove("hidden");
  $("#profileSaveStatus").textContent = "";
}

function applyProfileFieldLocks() {
  const locked = state.trip.lockedFields || [];
  const groups = {
    contact: ['#profile [data-field="submitter_status"]'],
    transport: ['#profile [data-field="can_drive"]', "#p_total_seats", "#p_starting_from", "#p_starting_from_custom", "#p_preferred_car_buddy"],
    kayak: ["#p_kayak_partner", "#p_kayak_type", "#p_kayak_type_notes", '#profile [data-field="kayak_experience"]'],
    overnight: ['#profile [data-field="staying_overnight"]'],
    food: ['#profile [data-field="eating_group_food"]', '#profile [data-field="dietary_pref"]', "#p_allergies", '#profile [data-field="wants_drinks"]', '#profile [data-field="wants_sauna"]']
  };
  Object.entries(groups).forEach(([group, selectors]) => {
    const disabled = locked.includes(group);
    selectors.forEach((selector) => {
      $$(selector).forEach((element) => {
        element.disabled = disabled;
        element.classList.toggle("locked", disabled);
      });
    });
  });
}

function collectProfileData() {
  const guest = profileGuest;
  const startingFrom = $("#p_starting_from").value;
  const customStart = $("#p_starting_from_custom").value.trim();
  const plusOnes =
    profileState.options.has_plus_ones === "yes"
      ? $$("#p_plusOneList .plus-one-card")
          .map((card) => ({
            id: card.dataset.plusOneId || "",
            name: card.querySelector(".po-name").value.trim(),
            phone: card.querySelector(".po-phone").value.trim(),
            status: card.querySelector(".po-status").value
          }))
          .filter((item) => item.name)
      : [];

  return {
    edit_id: guest.id,
    name: guest.name,
    email: guest.email,
    phone: guest.phone,
    submitter_status: profileState.options.submitter_status || "bolt",
    plus_ones: plusOnes,
    can_drive: profileState.options.can_drive || "no",
    total_seats: $("#p_total_seats").value || null,
    starting_from: startingFrom === "other" ? customStart : startingFrom,
    preferred_car_buddy: $("#p_preferred_car_buddy").value.trim(),
    kayak_partner_pref: $("#p_kayak_partner").value.trim(),
    kayak_type_pref: $("#p_kayak_type").value,
    kayak_type_notes: $("#p_kayak_type_notes").value.trim(),
    kayak_experience: profileState.options.kayak_experience || "",
    staying_overnight: profileState.options.staying_overnight || "no",
    ...preservedTentFields(profileGuest),
    eating_group_food: profileState.options.eating_group_food !== "no",
    dietary_pref: profileState.options.dietary_pref || "meat",
    allergies: $("#p_allergies").value.trim(),
    wants_drinks: profileState.options.wants_drinks || "no",
    wants_sauna: profileState.options.wants_sauna === "yes",
    can_help_with: profileState.helpWith,
    comments: $("#p_comments").value.trim(),
    emergency_contact_name: $("#p_emergency_name").value.trim(),
    emergency_contact_phone: $("#p_emergency_phone").value.trim()
  };
}

async function saveProfile() {
  if (!profileGuest) return;
  const button = $("#profileSaveBtn");
  const status = $("#profileSaveStatus");
  if (profileState.options.has_plus_ones === "yes") {
    const cards = $$("#p_plusOneList .plus-one-card");
    const emptyCard = cards.find((card) => !card.querySelector(".po-name").value.trim());
    if (!cards.length || emptyCard) {
      status.textContent = 'Add a name for each +1, or switch to "Just me".';
      emptyCard?.querySelector(".po-name")?.reportValidity();
      return;
    }
  }
  const data = collectProfileData();
  try {
    button.disabled = true;
    button.textContent = "Saving...";
    status.textContent = "";
    state = await saveGuest(data, false);
    renderTripView();
    renderTransport();
    status.textContent = "Saved.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Save changes";
    applyProfileFieldLocks();
  }
}

function onProfileSelectChange() {
  profileGuest = null;
  $("#profileFields").classList.add("hidden");
  $("#profileVerifyStatus").textContent = "";
  $("#p_verify_email").value = "";
  $("#p_verify_phone").value = "";
  profileToggle("profileVerify", Boolean($("#profileGuestSelect").value));
}

async function verifyProfile() {
  const id = $("#profileGuestSelect").value;
  const status = $("#profileVerifyStatus");
  if (!id) {
    status.textContent = "Pick your name first.";
    return;
  }
  const emailEl = $("#p_verify_email");
  const phoneEl = $("#p_verify_phone");
  if (!emailEl.value.trim() || !phoneEl.value.trim()) {
    status.textContent = "Enter the email and phone you registered with.";
    return;
  }
  try {
    status.textContent = "Checking...";
    const guest = await lookupGuest(emailEl.value, phoneEl.value);
    if (guest.id !== id) {
      status.textContent = "That email and phone don't match the selected name.";
      return;
    }
    status.textContent = "";
    loadProfile(guest);
  } catch (error) {
    status.textContent = error.message;
  }
}

function renderGuestList() {
  const list = $("#guestList");
  if (!state.guests.length) {
    list.innerHTML = `<article class="guest-empty"><h3>No registrations yet</h3><p>Be the first to sign up.</p></article>`;
    return;
  }
  const order = { bolt: 0, ex_bolt: 1, not_bolt: 2 };
  const sortedGuests = [...state.guests].sort((a, b) => (order[a.submitterStatus] ?? 0) - (order[b.submitterStatus] ?? 0));
  list.innerHTML = `<div class="guest-summary" aria-label="Registration summary">
      ${summaryItem("People (incl. +1s)", participantCount())}
      ${summaryItem("Drivers", driverCount())}
      ${summaryItem("Seats", seatCount())}
      ${summaryItem("Overnight", overnightCount())}
    </div>
    <div class="guest-table-wrap">
      <table class="guest-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Bolt</th>
            <th>Overnight</th>
            <th>Food</th>
            <th>Diet</th>
            <th>Drinks</th>
            <th>Experience</th>
            <th>Sauna</th>
          </tr>
        </thead>
        <tbody>
          ${sortedGuests.map((guest) => guestTableRows(guest)).join("")}
        </tbody>
      </table>
    </div>`;
}

function summaryItem(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function guestTableRows(guest) {
  const masterRow = `<tr>
    <td data-label="Name"><span class="guest-row-name">${escapeHtml(guest.name)}</span></td>
    <td data-label="Bolt">${boltChip(guest.submitterStatus)}</td>
    <td data-label="Overnight">${overnightBadge(guest.stayingOvernight)}</td>
    <td data-label="Food">${foodChip(guest)}</td>
    <td data-label="Diet">${dietaryChip(guest) || "-"}</td>
    <td data-label="Drinks">${drinksChip(guest)}</td>
    <td data-label="Experience">${experienceChip(guest) || "-"}</td>
    <td data-label="Sauna">${saunaChip(guest) || "-"}</td>
  </tr>`;
  const plusOneRows = (guest.plusOnes || [])
    .map(
      (plusOne) => `<tr class="is-plusone">
        <td data-label="Name"><span class="plusone-connector" aria-hidden="true">↳</span><span class="guest-row-name">${escapeHtml(plusOne.name)}</span><span class="plus-one-badge">+1</span></td>
        <td data-label="Bolt">${boltChip(plusOne.status)}</td>
        <td data-label="Details" colspan="6"><span class="guest-table-muted">Shares ${escapeHtml(guest.name)}'s overnight/food/drinks details</span></td>
      </tr>`
    )
    .join("");
  return masterRow + plusOneRows;
}

function boltChip(status) {
  return `<span class="boat-type-pill">${escapeHtml(labelBoltStatus(status))}</span>`;
}

function attrChip(tone, icon, label) {
  return `<span class="attr-chip tone-${tone}" title="${escapeHtml(label)}">${icon} ${escapeHtml(label)}</span>`;
}

function foodChip(guest) {
  if (guest.eatingGroupFood === false) return attrChip("gray", "🥪", "Bringing own food");
  return attrChip("green", "🍖", "Group food");
}

function dietaryChip(guest) {
  if (guest.eatingGroupFood === false) return "";
  const icons = { meat: "🥩", vegetarian: "🥬", vegan: "🌿" };
  const labels = { meat: "Meat", vegetarian: "Vegetarian", vegan: "Vegan" };
  const value = guest.dietaryPref || "meat";
  return attrChip("gray", icons[value] || "🍽️", labels[value] || value);
}

function drinksChip(guest) {
  if (guest.wantsDrinks === "yes") return attrChip("green", "🍺", "Drinks");
  if (guest.wantsDrinks === "soft") return attrChip("blue", "🥤", "Soft drinks only");
  return attrChip("gray", "💧", "Bringing own drinks");
}

function experienceChip(guest) {
  return experienceBadge(guest.kayakExperience);
}

function experienceBadge(value) {
  if (!value) return "";
  const icons = { beginner: "🐘", intermediate: "🌊", experienced: "🏆" };
  return attrChip("gray", icons[value] || "🛶", labelExperience(value));
}

function saunaChip(guest) {
  if (!guest.wantsSauna) return "";
  return attrChip("green", "🧖", "Sauna");
}

function fillSettingsForm() {
  const form = $("#settingsForm");
  Object.entries(state.trip).forEach(([key, value]) => {
    const input = form.elements[key];
    if (!input) return;
    if (key === "lockedFields" || key === "registrationOpen") return;
    input.value = Array.isArray(value) ? value.join("\n") : value;
  });
  $$('input[name="lockedFields"]').forEach((input) => {
    input.checked = (state.trip.lockedFields || []).includes(input.value);
  });
  form.elements.registrationOpen.checked = state.trip.registrationOpen !== false;
}

function renderAdmin() {
  $("#adminCount").textContent = `${state.guests.length} registered`;
  renderOverview();
  renderAssignments();
  renderTransportBoard();
  renderAdminGuests();
}

function renderOverview() {
  const diet = countBy(state.guests.filter((guest) => guest.eatingGroupFood), "dietaryPref");
  $("#overviewGrid").innerHTML = [
    ["Registered", state.guests.length],
    ["People", participantCount()],
    ["Drivers", driverCount()],
    ["Total seats", seatCount()],
    ["Overnight", overnightCount()],
    ["Need tent", state.guests.filter((guest) => guest.stayingOvernight === "yes" && guest.hasTent === "no").length],
    ["Can share tent", state.guests.filter((guest) => isOvernight(guest) && guest.hasTent === "share").length],
    ["Meat", diet.meat || 0],
    ["Veg/Vegan", (diet.vegetarian || 0) + (diet.vegan || 0)]
  ]
    .map(([label, value]) => `<div class="stat-card"><div class="stat-value">${escapeHtml(value)}</div><div class="stat-label">${escapeHtml(label)}</div></div>`)
    .join("");
}

function renderAssignments() {
  $("#assignmentBoard").innerHTML = [
    assignmentColumn("Cars", buildCarAssignments()),
    assignmentColumn("Tents", buildTentAssignments())
  ].join("");
}

function assignmentColumn(title, items) {
  const content = items.length
    ? items.map((item) => `<li class="${item.warning ? "warning" : ""}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></li>`).join("")
    : `<li><span>No recommendations yet.</span></li>`;
  return `<section class="assignment-column"><h4>${escapeHtml(title)}</h4><ul>${content}</ul></section>`;
}

function buildCarAssignments() {
  const drivers = state.guests
    .filter((guest) => ["yes", "bolt_drive"].includes(guest.canDrive))
    .map((guest) => ({
      guest,
      overnight: isOvernight(guest),
      remaining: Math.max(0, Number(guest.totalSeats || 0) - partySize(guest)),
      passengers: []
    }));
  const passengers = state.guests
    .filter((guest) => !["yes", "bolt_drive"].includes(guest.canDrive))
    .map((guest) => ({ guest, overnight: isOvernight(guest), size: partySize(guest) }));
  const items = [];

  passengers.forEach((passenger) => {
    const exact = drivers.find((driver) => driver.overnight === passenger.overnight && driver.remaining >= passenger.size);
    const fallback = exact || drivers.find((driver) => driver.remaining >= passenger.size);
    if (!fallback) {
      items.push({
        title: `Find ride for ${partyLabel(passenger.guest)}`,
        detail: `${labelStay(passenger.guest.stayingOvernight)} from ${passenger.guest.startingFrom || "TBD"}`,
        warning: true
      });
      return;
    }
    fallback.remaining -= passenger.size;
    fallback.passengers.push(passenger);
  });

  drivers.forEach((driver) => {
    const passengerNames = driver.passengers.map((item) => partyLabel(item.guest)).join(", ");
    const mismatch = driver.passengers.some((item) => item.overnight !== driver.overnight);
    items.push({
      title: passengerNames ? `${partyLabel(driver.guest)} + ${passengerNames}` : `${partyLabel(driver.guest)} has ${driver.remaining} open seat${driver.remaining === 1 ? "" : "s"}`,
      detail: `${labelDriver(driver.guest.canDrive)}, ${labelStay(driver.guest.stayingOvernight)}${mismatch ? " - check return/stay mismatch" : ""}`,
      warning: mismatch
    });
  });

  return items;
}

function buildTentAssignments() {
  const hosts = state.guests
    .filter((guest) => isOvernight(guest) && ["yes", "share"].includes(guest.hasTent))
    .map((guest) => ({ guest, open: guest.hasTent === "share" ? Math.max(1, Number(guest.tentShareSpots || 1)) : 0, assigned: [] }));
  const needTent = state.guests.filter((guest) => isOvernight(guest) && guest.hasTent === "no");
  const items = [];

  needTent.forEach((guest) => {
    const host = hosts.find((item) => item.open > 0);
    if (!host) {
      items.push({
        title: `Tent needed for ${partyLabel(guest)}`,
        detail: "No sharing tent marked available.",
        warning: true
      });
      return;
    }
    host.open -= 1;
    host.assigned.push(guest);
  });

  hosts.forEach((host) => {
    if (!host.assigned.length && host.guest.hasTent !== "share") return;
    items.push({
      title: host.assigned.length ? `${partyLabel(host.guest)} shares with ${host.assigned.map(partyLabel).join(", ")}` : `${partyLabel(host.guest)} can share a tent`,
      detail: `${host.open ? `${host.open} open sharing spot${host.open === 1 ? "" : "s"}` : "Tent spot assigned"}${host.guest.tentNotes ? ` - ${host.guest.tentNotes}` : ""}`,
      warning: false
    });
  });

  return items;
}

function partySize(guest) {
  return 1 + (guest.plusOnes?.length || (guest.plusOne ? 1 : 0));
}

function partyLabel(guest) {
  return `${guest.name}${partySize(guest) > 1 ? ` party (${partySize(guest)})` : ""}`;
}

function isOvernight(guest) {
  return guest.stayingOvernight === "yes" || guest.stayOvernight;
}

function exportCsv() {
  const headers = [
    "Name",
    "Email",
    "Phone",
    "Bolt connection",
    "Plus ones",
    "Plus one statuses",
    "Driver",
    "Seats",
    "Starting from",
    "Kayak partner",
    "Kayak type",
    "Kayak notes",
    "Experience",
    "Overnight",
    "Tent",
    "Tent share spots",
    "Tent notes",
    "Sleeping bag",
    "Food",
    "Allergies",
    "Drinks",
    "Sauna",
    "Help",
    "Emergency contact",
    "Emergency phone",
    "Notes",
    "Created"
  ];
  const rows = state.guests.map((guest) => [
    guest.name,
    guest.email,
    guest.phone,
    labelBoltStatus(guest.submitterStatus),
    guest.plusOneName,
    guest.plusOnes?.map((item) => `${item.name}: ${labelBoltStatus(item.status)}`).join("; "),
    labelDriver(guest.canDrive),
    guest.totalSeats || "",
    guest.startingFrom,
    guest.kayakPartnerPref,
    labelKayakType(guest.kayakTypePref),
    guest.kayakTypeNotes,
    labelExperience(guest.kayakExperience),
    labelStay(guest.stayingOvernight),
    labelTent(guest.hasTent),
    guest.tentShareSpots,
    guest.tentNotes,
    guest.hasSleepingBag,
    guest.eatingGroupFood ? guest.dietaryPref : "own food",
    guest.allergies,
    guest.wantsDrinks,
    guest.wantsSauna ? "yes" : "no",
    guest.canHelpWith?.join(", "),
    guest.emergencyContactName,
    guest.emergencyContactPhone,
    guest.comments || guest.notes,
    guest.createdAt
  ]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "kayak-trip-registrations.csv";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 60000);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function renderTransportBoard() {
  const drivers = state.guests.filter((guest) => ["yes", "bolt_drive"].includes(guest.canDrive));
  const passengers = state.guests.filter((guest) => !["yes", "bolt_drive"].includes(guest.canDrive));
  $("#transportBoard").innerHTML = [
    boardColumn("Drivers", drivers, (guest) => `${guest.totalSeats || "?"} seats, ${guest.startingFrom || "from TBD"}`),
    boardColumn("Passengers", passengers, (guest) => `${guest.startingFrom || "from TBD"}${guest.preferredCarBuddy ? `, with ${guest.preferredCarBuddy}` : ""}`),
    boardColumn("Overnight", state.guests.filter((guest) => guest.stayingOvernight === "yes"), (guest) => `Tent: ${guest.hasTent || "-"}, bag: ${guest.hasSleepingBag || "-"}`),
    boardColumn("Helpers", state.guests.filter((guest) => guest.canHelpWith?.length), (guest) => guest.canHelpWith.join(", "))
  ].join("");
}

function boardColumn(title, guests, lineRenderer) {
  const items = guests.length
    ? guests.map((guest) => `<li><strong>${escapeHtml(guest.name)}</strong><span>${escapeHtml(lineRenderer(guest))}</span></li>`).join("")
    : `<li><span>None yet</span></li>`;
  return `<section class="board-column"><h4>${escapeHtml(title)}</h4><ul>${items}</ul></section>`;
}

function renderAdminGuests() {
  const container = $("#adminGuests");
  if (!state.guests.length) {
    container.innerHTML = `<p>No registrations yet.</p>`;
    return;
  }
  container.innerHTML = state.guests
    .map((guest) => `<article class="admin-card">
      <div>
        <h4>${escapeHtml(guest.name)}</h4>
        <p>${new Date(guest.createdAt).toLocaleString()}</p>
      </div>
      <dl>
        ${detail("Email", guest.email || "-")}
        ${detail("Phone", guest.phone || "-")}
        ${detail("Bolt connection", labelBoltStatus(guest.submitterStatus))}
        ${detail("+1s", guest.plusOneName || "-")}
        ${detail("+1 status", guest.plusOnes?.map((item) => `${item.name}: ${labelBoltStatus(item.status)}`).join(", ") || "-")}
        ${detail("Driver", labelDriver(guest.canDrive))}
        ${detail("Seats", guest.totalSeats || "-")}
        ${detail("Start", guest.startingFrom || "-")}
        ${detail("Kayak partner", guest.kayakPartnerPref || "Assign")}
        ${detail("Kayak type", labelKayakType(guest.kayakTypePref))}
        ${detail("Kayak notes", guest.kayakTypeNotes || "-")}
        ${detail("Experience", labelExperience(guest.kayakExperience))}
        ${detail("Overnight", labelStay(guest.stayingOvernight))}
        ${detail("Tent", labelTent(guest.hasTent))}
        ${detail("Tent share", guest.hasTent === "share" ? `${guest.tentShareSpots || 1} spot${Number(guest.tentShareSpots || 1) === 1 ? "" : "s"}` : "-")}
        ${detail("Tent notes", guest.tentNotes || "-")}
        ${detail("Food", guest.eatingGroupFood ? guest.dietaryPref : "Own")}
        ${detail("Allergies", guest.allergies || "-")}
        ${detail("Drinks", guest.wantsDrinks || "no")}
        ${detail("Sauna", guest.wantsSauna ? "Yes" : "No")}
        ${detail("Help", guest.canHelpWith?.join(", ") || "-")}
        ${detail("Emergency", guest.emergencyContactName ? `${guest.emergencyContactName} ${guest.emergencyContactPhone || ""}` : "-")}
        ${detail("Notes", guest.comments || guest.notes || "-")}
      </dl>
      <div class="admin-card-actions">
        <button class="nav-btn secondary compact" data-edit="${guest.id}" type="button">Edit</button>
        <button class="nav-btn danger" data-delete="${guest.id}" type="button">Remove</button>
      </div>
    </article>`)
    .join("");
}

function detail(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function labelDriver(value) {
  return { yes: "Driving", bolt_drive: "Bolt Drive", no: "Passenger" }[value] || "Passenger";
}

function labelStay(value) {
  return { yes: "Overnight", maybe: "Maybe overnight", no: "Day trip" }[value] || "Day trip";
}

function labelTent(value) {
  return { yes: "Bringing own", share: "Can share", no: "Needs tent" }[value] || "-";
}

function labelBoltStatus(value) {
  return { bolt: "Bolt", ex_bolt: "Ex-Bolt", not_bolt: "Not Bolt" }[value] || "Not set";
}

function labelExperience(value) {
  return { beginner: "Beginner", intermediate: "Some experience", experienced: "Experienced", okay: "Some experience", confident: "Experienced" }[value] || "Not set";
}

function labelKayakType(value) {
  return {
    any: "Don't care",
    two_person: "2-person kayak",
    two_person_canoe: "2-person canoe"
  }[value] || "Don't care";
}

function splitLines(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

const GUIDE_URL = "/articles/my-article/my-article.md";
let guideLoaded = false;

function preprocessGuideMarkdown(md) {
  return md
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)(?:\{([^}]*)\})?/g, (match, alt, src, attrs) => {
      let url = src.trim().replace(/^public\//, "/");
      if (!/^(https?:)?\/\//.test(url) && !url.startsWith("/")) url = `/${url.replace(/^\.\//, "")}`;
      let style = "";
      if (attrs) {
        const width = attrs.match(/width="([\d.]+)in"/);
        if (width) style = ` style="max-width:${Math.round(parseFloat(width[1]) * 96)}px"`;
      }
      const altText = escapeHtml(alt || "");
      return `<img src="${escapeHtml(url)}" alt="${altText}"${style} loading="lazy" />`;
    })
    .replace(/\[([^\]]+)\]\{\.underline\}/g, "<u>$1</u>")
    .replace(/\[([^\]]+)\]\{\.mark\}/g, "<mark>$1</mark>")
    .replace(/\{\.[^}]*\}/g, "");
}

async function renderGuide() {
  const el = $("#guideContent");
  if (!el || guideLoaded) return;
  try {
    const response = await fetch(`${GUIDE_URL}?v=${Date.now()}`);
    if (!response.ok) throw new Error(`Could not load the guide (${response.status}).`);
    const markdown = await response.text();
    el.innerHTML = marked.parse(preprocessGuideMarkdown(markdown), { gfm: true, breaks: false });
    guideLoaded = true;
  } catch (error) {
    el.innerHTML = `<p class="transport-empty">${escapeHtml(error.message)}</p>`;
  }
}

const PANEL_ROUTES = ["guests", "transport", "fleet", "guide", "profile", "admin"];

function currentRoute() {
  const hash = (location.hash || "").replace(/^#\/?/, "");
  return PANEL_ROUTES.includes(hash) ? hash : "home";
}

function showRoute(route) {
  const isPanel = PANEL_ROUTES.includes(route);
  document.body.classList.toggle("panel-open", isPanel);
  $$(".registration-side-panel").forEach((el) => el.classList.toggle("page-active", isPanel && el.id === route));
  $$(".header-links a").forEach((link) => {
    const target = (link.getAttribute("href") || "").replace(/^#\/?/, "");
    link.classList.toggle("active", target === route);
  });
  if (route === "transport") renderTransport();
  if (route === "fleet") renderFleet();
  if (route === "guide") renderGuide();
  window.scrollTo({ top: 0 });
}

function handleRoute() {
  showRoute(currentRoute());
}

function goHome() {
  history.replaceState(null, "", location.pathname);
  resetFormFlow();
  showRoute("home");
}

window.addEventListener("hashchange", handleRoute);

$("#startButton").addEventListener("click", () => {
  if (!isRegistrationOpen()) return;
  goToStep(1);
});
$(".logo").addEventListener("click", (event) => {
  event.preventDefault();
  goHome();
});
$("#nextBtn").addEventListener("click", nextStep);
$("#prevBtn").addEventListener("click", prevStep);
$("#anotherResponseButton").addEventListener("click", resetFormFlow);
$("#addPlusOneButton").addEventListener("click", addPlusOne);

document.addEventListener("click", (event) => {
  if (event.target.closest("#profile")) return;
  const option = event.target.closest(".option-card");
  if (option) selectOption(option);
  const chip = event.target.closest(".chip[data-help]");
  if (chip) toggleHelp(chip);
  const remove = event.target.closest("[data-remove-plus-one]");
  if (remove) $(`#${remove.dataset.removePlusOne}`)?.remove();
  const review = event.target.closest("[data-review-step]");
  if (review) goToStep(Number(review.dataset.reviewStep));
});

$("#profile").addEventListener("click", (event) => {
  const option = event.target.closest(".option-card");
  if (option && !option.disabled) {
    profileSelectOption(option);
    return;
  }
  const chip = event.target.closest(".chip[data-help]");
  if (chip && !chip.disabled) {
    toggleProfileHelp(chip);
    return;
  }
  const remove = event.target.closest("[data-remove-profile-plus-one]");
  if (remove) $(`#${remove.dataset.removeProfilePlusOne}`)?.remove();
});

$("#profileGuestSelect").addEventListener("change", onProfileSelectChange);
$("#profileVerifyButton").addEventListener("click", verifyProfile);
$("#profileSaveBtn").addEventListener("click", saveProfile);
$("#p_addPlusOneButton").addEventListener("click", addProfilePlusOne);
$("#p_starting_from").addEventListener("change", (event) => {
  profileToggle("p_customStartSection", event.target.value === "other");
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.target.matches("textarea")) return;
  if (currentStep === 0) return;
  event.preventDefault();
  nextStep();
});

$("#f_starting_from").addEventListener("change", (event) => {
  toggle("customStartSection", event.target.value === "other");
});

$("#adminLogin").addEventListener("submit", async (event) => {
  event.preventDefault();
  const pin = event.currentTarget.elements.pin.value;
  try {
    await adminLogin(pin);
    adminUnlocked = true;
    state = await loadAdminState();
    $("#adminPanel").classList.remove("hidden");
    fillSettingsForm();
    renderAdmin();
  } catch {
    event.currentTarget.elements.pin.value = "";
    event.currentTarget.elements.pin.placeholder = "Wrong key";
  }
});

$("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    state = await saveSettings({
      title: data.title,
      date: data.date,
      location: data.location,
      meetingPoint: data.meetingPoint,
      lockedFields: new FormData(form).getAll("lockedFields"),
      registrationOpen: form.elements.registrationOpen.checked,
      intro: data.intro
    });
    $("#settingsStatus").textContent = "Settings saved.";
    renderTripView();
    renderAdmin();
  } catch (error) {
    $("#settingsStatus").textContent = error.message;
  }
});

$("#adminGuests").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit]");
  if (edit) {
    const guest = state.guests.find((item) => item.id === edit.dataset.edit);
    if (guest) loadGuestForEdit(guest, true);
    return;
  }
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  state = await deleteGuest(button.dataset.delete);
  renderTripView();
  renderAdmin();
  renderTransport();
});

$("#exportCsvButton").addEventListener("click", exportCsv);

$("#transport").addEventListener("click", (event) => {
  const chip = event.target.closest(".person-chip[data-person-id]");
  if (chip) {
    const type = chip.dataset.personType;
    const id = chip.dataset.personId;
    const name = chip.dataset.personName;
    const isSame = selectedPerson && selectedPerson.type === type && selectedPerson.id === id;
    selectedPerson = isSame ? null : { type, id, name };
    openPickerCarId = null;
    const status = $("#transportStatus");
    if (status) status.textContent = selectedPerson ? `Selected ${name} — tap an open seat to place them.` : "";
    paintTransport();
    return;
  }
  const ready = event.target.closest("[data-mark-ready]");
  if (ready) {
    const confirmed = window.confirm(
      "Mark this car as ready?\n\nThis confirms you have agreed with all the passengers where/when you are meeting and promise to keep them safe and on time. Once confirmed, the passenger list is locked and cannot be changed here."
    );
    if (confirmed) markCarReady(ready.dataset.markReady);
    return;
  }
  const pick = event.target.closest("[data-pick-car]");
  if (pick) {
    const person = (transportData ? transportData.unassigned : []).find(
      (item) => item.type === pick.dataset.personType && item.id === pick.dataset.personId
    );
    if (person) assignPersonToCar(pick.dataset.pickCar, person);
    return;
  }
  if (event.target.closest("[data-close-picker]")) {
    openPickerCarId = null;
    paintTransport();
    return;
  }
  const assign = event.target.closest("[data-assign-car]");
  if (assign) {
    const carId = assign.dataset.assignCar;
    if (selectedPerson) {
      assignPersonToCar(carId, selectedPerson);
      return;
    }
    openPickerCarId = openPickerCarId === carId ? null : carId;
    paintTransport();
    return;
  }
  const remove = event.target.closest("[data-remove-passenger]");
  if (remove) {
    unassignPassenger(remove.dataset.removePassenger);
  }
});

$("#fleet").addEventListener("click", (event) => {
  const chip = event.target.closest(".person-chip[data-person-id]");
  if (chip) {
    const type = chip.dataset.personType;
    const id = chip.dataset.personId;
    const name = chip.dataset.personName;
    const isSame = selectedFleetPerson && selectedFleetPerson.type === type && selectedFleetPerson.id === id;
    selectedFleetPerson = isSame ? null : { type, id, name };
    openPickerBoatId = null;
    const status = $("#fleetStatus");
    if (status) status.textContent = selectedFleetPerson ? `Selected ${name} — tap an open spot to place them.` : "";
    paintFleet();
    return;
  }
  const pick = event.target.closest("[data-pick-boat]");
  if (pick) {
    const person = (fleetData ? fleetData.unassigned : []).find(
      (item) => item.type === pick.dataset.personType && item.id === pick.dataset.personId
    );
    if (person) assignPersonToBoat(pick.dataset.pickBoat, person);
    return;
  }
  if (event.target.closest("[data-close-boat-picker]")) {
    openPickerBoatId = null;
    paintFleet();
    return;
  }
  const assign = event.target.closest("[data-assign-boat]");
  if (assign) {
    const boatId = assign.dataset.assignBoat;
    if (selectedFleetPerson) {
      assignPersonToBoat(boatId, selectedFleetPerson);
      return;
    }
    openPickerBoatId = openPickerBoatId === boatId ? null : boatId;
    paintFleet();
    return;
  }
  const remove = event.target.closest("[data-remove-occupant]");
  if (remove) {
    unassignBoatOccupant(remove.dataset.removeOccupant);
  }
});

state = await loadPublicState();
renderTripView();
renderTransport();
goToStep(0);
handleRoute();
