let state = null;
let adminPin = "";
let currentStep = 0;
let plusOneCount = 0;

const totalSteps = 8;
const formState = {
  options: {
    has_plus_ones: "no",
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

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

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
}

function firstWord(value) {
  return String(value).split(" ")[0] || "Bolt";
}

function restWords(value) {
  const words = String(value).split(" ");
  return words.slice(1).join(" ") || "Kayak Trip";
}

function renderParticipantDatalist() {
  $("#participantList").innerHTML = state.guests.map((guest) => `<option value="${escapeHtml(guest.name)}"></option>`).join("");
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
    next.textContent = "Submit";
    next.classList.add("submit");
    next.classList.remove("primary");
  } else {
    next.textContent = "Continue →";
    next.classList.add("primary");
    next.classList.remove("submit");
  }
}

function validateStep(step) {
  const stepEl = $(`.step[data-step="${step}"]`);
  const invalid = stepEl.querySelector(":invalid");
  if (!invalid) return true;
  invalid.reportValidity();
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
  }
  if (field === "can_drive") toggle("driverSection", value === "yes" || value === "bolt_drive");
  if (field === "staying_overnight") toggle("overnightSection", value === "yes" || value === "maybe");
  if (field === "has_tent") toggle("tentShareSection", value === "share");
  if (field === "eating_group_food") toggle("foodSection", value === "yes");
}

function toggle(id, show) {
  $(`#${id}`)?.classList.toggle("show", show);
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
    <label class="field-group">Name * <input class="po-name" placeholder="Full name" /></label>
    <label class="field-group">Phone <small>For the group chat</small><input class="po-phone" type="tel" placeholder="+372..." /></label>`;
  $("#plusOneList").appendChild(card);
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
  const plusOnes = $$(".plus-one-card")
    .map((card) => ({
      name: card.querySelector(".po-name").value.trim(),
      phone: card.querySelector(".po-phone").value.trim()
    }))
    .filter((item) => item.name);

  return {
    name: $("#f_name").value.trim(),
    email: $("#f_email").value.trim(),
    phone: $("#f_phone").value.trim(),
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
    has_tent: formState.options.has_tent || "",
    tent_share_spots: $("#f_tent_share_spots").value || null,
    tent_notes: $("#f_tent_notes").value.trim(),
    has_sleeping_bag: formState.options.has_sleeping_bag || "",
    eating_group_food: formState.options.eating_group_food !== "no",
    dietary_pref: formState.options.dietary_pref || "meat",
    allergies: $("#f_allergies").value.trim(),
    wants_drinks: formState.options.wants_drinks || "no",
    wants_sauna: formState.options.wants_sauna === "yes",
    tshirt_size: formState.options.tshirt_size || "",
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
      ["Tent", labelTent(data.has_tent)],
      ["Tent spots", data.has_tent === "share" ? data.tent_share_spots || "1" : "-"],
      ["Tent notes", data.tent_notes || "-"],
      ["Food", data.eating_group_food ? data.dietary_pref : "Bringing own"],
      ["Allergies", data.allergies || "-"],
      ["Drinks", drinksLabel],
      ["Sauna", data.wants_sauna ? "Yes" : "No"]
    ]),
    reviewSection("Extras", 7, [
      ["T-shirt", data.tshirt_size || "-"],
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
  try {
    button.disabled = true;
    button.textContent = "Submitting...";
    state = await api("/api/guests", {
      method: "POST",
      body: JSON.stringify(data)
    });
    $("#app").classList.add("hidden");
    $("#successPanel").classList.remove("hidden");
    $("#guestStatus").textContent = "";
    renderTripView();
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
  formState.helpWith = [];
  formState.options = {
    has_plus_ones: "no",
    can_drive: "no",
    kayak_experience: "intermediate",
    staying_overnight: "no",
    eating_group_food: "yes",
    dietary_pref: "meat",
    wants_drinks: "no",
    wants_sauna: "no"
  };
  $$(".selected").forEach((item) => item.classList.remove("selected"));
  $$('[data-field="has_plus_ones"][data-value="no"], [data-field="can_drive"][data-value="no"], [data-field="kayak_experience"][data-value="intermediate"], [data-field="staying_overnight"][data-value="no"], [data-field="eating_group_food"][data-value="yes"], [data-field="dietary_pref"][data-value="meat"], [data-field="wants_drinks"][data-value="no"], [data-field="wants_sauna"][data-value="no"]').forEach((item) => item.classList.add("selected"));
  $$(".conditional").forEach((item) => item.classList.remove("show"));
  $("#foodSection").classList.add("show");
  $("#successPanel").classList.add("hidden");
  $("#app").classList.remove("hidden");
  goToStep(0);
}

function renderGuestList() {
  const list = $("#guestList");
  if (!state.guests.length) {
    list.innerHTML = `<article class="guest-empty"><h3>No registrations yet</h3><p>Be the first to sign up.</p></article>`;
    return;
  }
  list.innerHTML = `<div class="guest-summary" aria-label="Registration summary">
      ${summaryItem("Registered", state.guests.length)}
      ${summaryItem("People", participantCount())}
      ${summaryItem("Drivers", driverCount())}
      ${summaryItem("Seats", seatCount())}
      ${summaryItem("Overnight", overnightCount())}
    </div>
    <div class="guest-table-wrap">
      <table class="guest-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Party</th>
            <th>Transport</th>
            <th>Overnight</th>
            <th>Kayak</th>
            <th>Food</th>
          </tr>
        </thead>
        <tbody>
          ${state.guests.map(guestRow).join("")}
        </tbody>
      </table>
    </div>`;
}

function summaryItem(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function guestRow(guest) {
  const plusOnes = guest.plusOnes?.length || (guest.plusOne ? 1 : 0);
  const partySize = 1 + plusOnes;
  return `<tr>
    <td data-label="Name"><strong>${escapeHtml(guest.name)}</strong>${guest.plusOneName ? `<span>With ${escapeHtml(guest.plusOneName)}</span>` : ""}</td>
    <td data-label="Party">${partySize} ${partySize === 1 ? "person" : "people"}</td>
    <td data-label="Transport">${escapeHtml(labelDriver(guest.canDrive))}${guest.totalSeats ? `<span>${escapeHtml(guest.totalSeats)} seats</span>` : ""}</td>
    <td data-label="Overnight">${escapeHtml(labelStay(guest.stayingOvernight))}</td>
    <td data-label="Kayak">${escapeHtml(labelExperience(guest.kayakExperience))}<span>${escapeHtml(labelKayakType(guest.kayakTypePref))}</span></td>
    <td data-label="Food">${escapeHtml(guest.eatingGroupFood ? guest.dietaryPref || "group food" : "own food")}</td>
  </tr>`;
}

function fillSettingsForm() {
  const form = $("#settingsForm");
  Object.entries(state.trip).forEach(([key, value]) => {
    const input = form.elements[key];
    if (!input) return;
    input.value = Array.isArray(value) ? value.join("\n") : value;
  });
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
    "Plus ones",
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
    "T-shirt",
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
    guest.plusOneName,
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
    guest.tshirtSize,
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
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
        ${detail("+1s", guest.plusOneName || "-")}
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
        ${detail("T-shirt", guest.tshirtSize || "-")}
        ${detail("Help", guest.canHelpWith?.join(", ") || "-")}
        ${detail("Emergency", guest.emergencyContactName ? `${guest.emergencyContactName} ${guest.emergencyContactPhone || ""}` : "-")}
        ${detail("Notes", guest.comments || guest.notes || "-")}
      </dl>
      <button class="nav-btn danger" data-delete="${guest.id}" type="button">Remove</button>
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

function labelExperience(value) {
  return { beginner: "Beginner", intermediate: "Some experience", experienced: "Experienced", okay: "Some experience", confident: "Experienced" }[value] || "Not set";
}

function labelKayakType(value) {
  return {
    any: "Any type",
    two_person: "2-person kayak",
    single: "Single kayak",
    sit_on_top: "Stable sit-on-top",
    canoe: "Canoe",
    not_sure: "Not sure",
    other: "Other / depends"
  }[value] || "Any type";
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

$("#startButton").addEventListener("click", () => goToStep(1));
$("#nextBtn").addEventListener("click", nextStep);
$("#prevBtn").addEventListener("click", prevStep);
$("#anotherResponseButton").addEventListener("click", resetFormFlow);
$("#addPlusOneButton").addEventListener("click", addPlusOne);

document.addEventListener("click", (event) => {
  const option = event.target.closest(".option-card");
  if (option) selectOption(option);
  const chip = event.target.closest(".chip[data-help]");
  if (chip) toggleHelp(chip);
  const remove = event.target.closest("[data-remove-plus-one]");
  if (remove) $(`#${remove.dataset.removePlusOne}`)?.remove();
  const review = event.target.closest("[data-review-step]");
  if (review) goToStep(Number(review.dataset.reviewStep));
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
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ pin })
    });
    adminPin = pin;
    state = await api("/api/admin/state");
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
    state = await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify({
        trip: {
          title: data.title,
          date: data.date,
          location: data.location,
          meetingPoint: data.meetingPoint,
          dateOptions: [],
          intro: data.intro
        }
      })
    });
    $("#settingsStatus").textContent = "Settings saved.";
    renderTripView();
    renderAdmin();
  } catch (error) {
    $("#settingsStatus").textContent = error.message;
  }
});

$("#adminGuests").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  state = await api(`/api/admin/guests/${button.dataset.delete}`, { method: "DELETE" });
  renderTripView();
  renderAdmin();
});

$("#exportCsvButton").addEventListener("click", exportCsv);

state = await api("/api/state");
renderTripView();
goToStep(0);
