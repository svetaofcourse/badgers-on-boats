let state = null;
let adminPin = "";

const $ = (selector) => document.querySelector(selector);
const fmt = (value) => `${Math.round(value)} ${state?.costs.currency || "EUR"}`;

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(adminPin ? { "x-admin-pin": adminPin } : {})
    },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function participantCount() {
  return state.guests.reduce((sum, guest) => sum + 1 + (guest.plusOne ? 1 : 0), 0);
}

function carCount() {
  return state.guests.filter((guest) => guest.transportThere === "driving" || guest.transportBack === "driving" || guest.comingByCar).length;
}

function overnightCount() {
  return state.guests.reduce((sum, guest) => sum + (guest.stayOvernight ? 1 + (guest.plusOne ? 1 : 0) : 0), 0);
}

function calculateCosts() {
  const people = participantCount();
  const cars = carCount();
  const total =
    Number(state.costs.fixedCosts || 0) +
    people * Number(state.costs.perPersonCost || 0) +
    cars * Number(state.costs.perCarCost || 0);
  return {
    people,
    cars,
    total,
    perPerson: people ? total / people : 0,
    deposits: people * Number(state.costs.depositPerPerson || 0)
  };
}

function peopleInParty(guest) {
  return 1 + (guest.plusOne ? 1 : 0);
}

function transportSummary(direction) {
  const transportKey = direction === "there" ? "transportThere" : "transportBack";
  const seatsKey = direction === "there" ? "seatsThere" : "seatsBack";
  const needingRide = state.guests.reduce((sum, guest) => sum + (guest[transportKey] === "need-ride" ? peopleInParty(guest) : 0), 0);
  const seats = state.guests.reduce((sum, guest) => sum + (guest[transportKey] === "driving" ? Number(guest[seatsKey] || 0) : 0), 0);
  return { needingRide, seats, balance: seats - needingRide };
}

function signedCount(value) {
  if (value > 0) return `+${value} seats`;
  if (value < 0) return `${Math.abs(value)} need seats`;
  return "Matched";
}

function topChoice(guests, key, options) {
  const counts = new Map();
  guests.forEach((guest) => {
    const value = guest[key];
    if (!value || value === "decide-later") return;
    counts.set(value, (counts.get(value) || 0) + 1 + (guest.plusOne ? 1 : 0));
  });
  const winner = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (!winner) return "No votes yet";
  const label = options.includes(winner[0]) ? winner[0] : winner[0];
  return `${label} (${winner[1]})`;
}

function updateTripView() {
  $("#tripTitle").textContent = state.trip.title;
  $("#tripDate").textContent = state.trip.date || "Date options coming soon";
  $("#tripIntro").textContent = state.trip.intro;
  $("#tripLocation").textContent = state.trip.location || "To be decided";
  $("#tripMeeting").textContent = state.trip.meetingPoint || "To be decided";
  $("#peopleCount").textContent = calculateCosts().people;
  $("#publicCost").textContent = fmt(calculateCosts().perPerson);
}

function renderChoiceSelects() {
  renderOptions($("#datePreference"), [
    ["decide-later", state.trip.dateOptions.length ? "Choose later" : "Dates will be added soon"],
    ["any", "Any proposed date works"],
    ...state.trip.dateOptions.map((option) => [option, option])
  ]);
  renderOptions($("#placePreference"), [
    ["decide-later", state.trip.placeOptions.length ? "Choose later" : "Places will be added soon"],
    ["any", "Any proposed place works"],
    ...state.trip.placeOptions.map((option) => [option, option])
  ]);
}

function renderOptions(select, options) {
  const current = select.value;
  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
  if (options.some(([value]) => value === current)) select.value = current;
}

function chip(text) {
  return `<span class="chip">${text}</span>`;
}

function renderGuestList() {
  const list = $("#guestList");
  if (!state.guests.length) {
    list.innerHTML = `<article class="guest-card"><h3>No sign-ups yet</h3><p>Be the first to add your info.</p></article>`;
    return;
  }

  list.innerHTML = state.guests
    .map((guest) => {
      const party = 1 + (guest.plusOne ? 1 : 0);
      return `<article class="guest-card">
        <h3>${escapeHtml(guest.name)}</h3>
        <p>${party} ${party === 1 ? "person" : "people"} ${guest.plusOneName ? `with ${escapeHtml(guest.plusOneName)}` : ""}</p>
        <div class="chips">
          ${chip(guest.comingByCar ? `Car, ${guest.carSeats} free seats` : "No car")}
          ${chip(labelDate(guest.datePreference))}
          ${chip(labelPlace(guest.placePreference))}
          ${chip(guest.stayOvernight ? "Overnight" : "No overnight")}
          ${chip(labelTransport(guest.transportThere, "there"))}
          ${chip(labelTransport(guest.transportBack, "back"))}
          ${chip(labelBoat(guest.boat))}
          ${guest.food ? chip("Food notes") : ""}
        </div>
      </article>`;
    })
    .join("");
}

function fillSettingsForm() {
  const form = $("#settingsForm");
  Object.entries({ ...state.trip, ...state.costs }).forEach(([key, value]) => {
    const input = form.elements[key];
    if (!input) return;
    input.value = Array.isArray(value) ? value.join("\n") : value;
  });
}

function renderCosts() {
  const costs = calculateCosts();
  const there = transportSummary("there");
  const back = transportSummary("back");
  $("#costGrid").innerHTML = [
    ["Participants", costs.people],
    ["Cars", costs.cars],
    ["Staying overnight", overnightCount()],
    ["Ride balance there", signedCount(there.balance)],
    ["Ride balance back", signedCount(back.balance)],
    ["Top date", topChoice(state.guests, "datePreference", state.trip.dateOptions)],
    ["Top place", topChoice(state.guests, "placePreference", state.trip.placeOptions)],
    ["Total estimate", fmt(costs.total)],
    ["Per person", fmt(costs.perPerson)],
    ["Deposits to collect", fmt(costs.deposits)]
  ]
    .map(([label, value]) => `<div class="cost-item"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderBoards() {
  const transportBoard = $("#transportBoard");
  const boatBoard = $("#boatBoard");
  if (!transportBoard || !boatBoard) return;

  transportBoard.innerHTML = [
    boardColumn("Need rides there", state.guests.filter((guest) => guest.transportThere === "need-ride"), transportLine("there")),
    boardColumn("Seats there", state.guests.filter((guest) => guest.transportThere === "driving"), driverLine("there")),
    boardColumn("Need rides back", state.guests.filter((guest) => guest.transportBack === "need-ride"), transportLine("back")),
    boardColumn("Seats back", state.guests.filter((guest) => guest.transportBack === "driving"), driverLine("back"))
  ].join("");

  boatBoard.innerHTML = [
    boardColumn("Needs boat match", state.guests.filter((guest) => guest.boatPartnerStatus === "match-me"), boatLine),
    boardColumn("Has partner", state.guests.filter((guest) => guest.boatPartnerStatus === "have-partner"), boatLine),
    boardColumn("Solo / no match", state.guests.filter((guest) => guest.boatPartnerStatus === "solo-only" || guest.okayToMatch === false), boatLine),
    boardColumn("Gear needs", state.guests.filter((guest) => guest.gearNeed), gearLine)
  ].join("");
}

function boardColumn(title, guests, lineRenderer) {
  const items = guests.length
    ? guests.map((guest) => `<li><strong>${escapeHtml(guest.name)}</strong><span>${lineRenderer(guest)}</span></li>`).join("")
    : `<li><span>None yet</span></li>`;
  return `<section class="board-column"><h4>${title}</h4><ul>${items}</ul></section>`;
}

function transportLine(direction) {
  return (guest) => {
    const time = direction === "there" ? guest.departureTime : guest.returnTime;
    const rideWith = guest.rideWith ? `, with ${escapeHtml(guest.rideWith)}` : "";
    return `${escapeHtml(guest.departureArea || "Area not set")}${time ? `, ${escapeHtml(time)}` : ""}${rideWith}`;
  };
}

function driverLine(direction) {
  return (guest) => {
    const seats = direction === "there" ? guest.seatsThere : guest.seatsBack;
    const time = direction === "there" ? guest.departureTime : guest.returnTime;
    return `${Number(seats || 0)} seats${time ? `, ${escapeHtml(time)}` : ""}`;
  };
}

function boatLine(guest) {
  const partner = guest.boatPartnerName ? `, partner: ${escapeHtml(guest.boatPartnerName)}` : "";
  const preference = guest.boatSharePreference ? `, wants: ${escapeHtml(guest.boatSharePreference)}` : "";
  return `${labelBoat(guest.boat)}, ${labelExperience(guest.experienceLevel)}${partner}${preference}`;
}

function gearLine(guest) {
  return escapeHtml(guest.gearNeed);
}

function renderAdminGuests() {
  const container = $("#adminGuests");
  if (!state.guests.length) {
    container.innerHTML = `<p>No guest details yet.</p>`;
    return;
  }

  container.innerHTML = state.guests
    .map(
      (guest) => `<article class="admin-card">
        <div>
          <h4>${escapeHtml(guest.name)}</h4>
          <p>${new Date(guest.createdAt).toLocaleString()}</p>
        </div>
        <dl>
          ${detail("Phone", guest.phone)}
          ${detail("Email", guest.email || "-")}
          ${detail("Preferred date", labelDate(guest.datePreference))}
          ${detail("Preferred place", labelPlace(guest.placePreference))}
          ${detail("Stay overnight", guest.stayOvernight ? "Yes" : "No")}
          ${detail("Party", String(1 + (guest.plusOne ? 1 : 0)))}
          ${detail("There", transportDetail(guest, "there"))}
          ${detail("Back", transportDetail(guest, "back"))}
          ${detail("Area", guest.departureArea || "-")}
          ${detail("Ride with", guest.rideWith || "-")}
          ${detail("Boat", labelBoat(guest.boat))}
          ${detail("Experience", labelExperience(guest.experienceLevel))}
          ${detail("Boat partner", boatPartnerDetail(guest))}
          ${detail("Food", guest.food || "-")}
          ${detail("Allergies", guest.allergies || "-")}
          ${detail("Gear has", guest.gearHave || "-")}
          ${detail("Gear needs", guest.gearNeed || "-")}
          ${detail("Notes", guest.notes || "-")}
        </dl>
        <button class="button danger" data-delete="${guest.id}" type="button">Remove</button>
      </article>`
    )
    .join("");
}

function detail(label, value) {
  return `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function labelDate(value) {
  if (state.trip.dateOptions.includes(value)) return value;
  return {
    "decide-later": "Date later",
    any: "Any date",
    "option-1": "Date option 1",
    "option-2": "Date option 2",
    "option-3": "Date option 3"
  }[value] || "Date later";
}

function labelPlace(value) {
  if (state.trip.placeOptions.includes(value)) return value;
  return {
    "decide-later": "Place later",
    any: "Any place"
  }[value] || "Place later";
}

function labelBoat(value) {
  return {
    "no-preference": "No boat preference",
    solo: "Solo kayak",
    tandem: "Tandem kayak",
    experienced: "Experienced paddler",
    beginner: "Beginner-friendly"
  }[value] || value;
}

function labelExperience(value) {
  return {
    beginner: "Beginner",
    okay: "Okay",
    confident: "Confident"
  }[value] || "Okay";
}

function labelTransport(value, direction) {
  return {
    "need-ride": direction === "there" ? "Needs ride there" : "Needs ride back",
    driving: direction === "there" ? "Can drive there" : "Can drive back",
    "passenger-arranged": "Ride arranged",
    other: "Transport unsure"
  }[value] || "Transport unsure";
}

function transportDetail(guest, direction) {
  const transport = direction === "there" ? guest.transportThere : guest.transportBack;
  const seats = direction === "there" ? guest.seatsThere : guest.seatsBack;
  const time = direction === "there" ? guest.departureTime : guest.returnTime;
  const seatText = transport === "driving" ? `, ${Number(seats || 0)} seats` : "";
  return `${labelTransport(transport, direction)}${seatText}${time ? `, ${time}` : ""}`;
}

function boatPartnerDetail(guest) {
  const labels = {
    "match-me": "Needs match",
    "have-partner": "Has partner",
    "solo-only": "Solo only",
    "no-preference": "No preference"
  };
  const base = labels[guest.boatPartnerStatus] || "Needs match";
  const partner = guest.boatPartnerName ? `: ${guest.boatPartnerName}` : "";
  return `${base}${partner}`;
}

function renderAll() {
  updateTripView();
  renderChoiceSelects();
  renderGuestList();
  if (!$("#adminPanel").classList.contains("hidden")) {
    fillSettingsForm();
    renderCosts();
    renderBoards();
    renderAdminGuests();
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

$("#guestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  data.plusOne = form.elements.plusOne.checked;
  data.okayToMatch = form.elements.okayToMatch.value;
  try {
    state = await api("/api/guests", {
      method: "POST",
      body: JSON.stringify(data)
    });
    form.reset();
    form.elements.seatsThere.value = 0;
    form.elements.seatsBack.value = 0;
    renderChoiceSelects();
    $("#guestStatus").textContent = "Saved. See you on the water.";
    renderAll();
  } catch (error) {
    $("#guestStatus").textContent = error.message;
  }
});

$("#adminLogin").addEventListener("submit", async (event) => {
  event.preventDefault();
  const pin = event.currentTarget.elements.pin.value;
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ pin })
    });
    adminPin = pin;
    state = await api("/api/admin/state");
    $("#adminPanel").classList.remove("hidden");
    renderAll();
  } catch {
    event.currentTarget.elements.pin.value = "";
    event.currentTarget.elements.pin.placeholder = "Wrong pin";
  }
});

$("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  try {
    state = await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify({
        trip: {
          title: data.title,
          date: data.date,
          location: data.location,
          meetingPoint: data.meetingPoint,
          dateOptions: splitLines(data.dateOptions),
          placeOptions: splitLines(data.placeOptions),
          intro: data.intro
        },
        costs: {
          fixedCosts: Number(data.fixedCosts),
          perPersonCost: Number(data.perPersonCost),
          perCarCost: Number(data.perCarCost),
          depositPerPerson: Number(data.depositPerPerson),
          currency: data.currency
        }
      })
    });
    $("#settingsStatus").textContent = "Settings saved.";
    renderAll();
  } catch (error) {
    $("#settingsStatus").textContent = error.message;
  }
});

function splitLines(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

$("#adminGuests").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  state = await api(`/api/admin/guests/${button.dataset.delete}`, { method: "DELETE" });
  renderAll();
});

state = await api("/api/state");
renderAll();
