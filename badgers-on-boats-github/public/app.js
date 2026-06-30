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
const fmt = (value) => `${Math.round(value)} ${state?.costs.currency || "EUR"}`;

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

function calculateCosts() {
  const people = participantCount();
  const cars = driverCount();
  const total =
    Number(state.costs.fixedCosts || 0) +
    people * Number(state.costs.perPersonCost || 0) +
    cars * Number(state.costs.perCarCost || 0);
  return {
    people,
    cars,
    total,
    perPerson: people ? total / people : 0
  };
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
    kayak_experience: formState.options.kayak_experience || "",
    staying_overnight: formState.options.staying_overnight || "no",
    has_tent: formState.options.has_tent || "",
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
      ["Experience", data.kayak_experience || "Not set"]
    ]),
    reviewSection("Overnight and Food", 5, [
      ["Staying", data.staying_overnight],
      ["Tent", data.has_tent || "-"],
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
    list.innerHTML = `<article class="guest-card"><h3>No registrations yet</h3><p>Be the first to sign up.</p></article>`;
    return;
  }
  list.innerHTML = state.guests
    .map((guest) => `<article class="guest-card">
      <h3>${escapeHtml(guest.name)}</h3>
      <p>${guest.plusOneName ? `With ${escapeHtml(guest.plusOneName)}` : "Solo registration"}</p>
      <div class="chips">
        ${chip(labelDriver(guest.canDrive))}
        ${chip(labelStay(guest.stayingOvernight))}
        ${chip(labelExperience(guest.kayakExperience))}
        ${guest.dietaryPref ? chip(guest.dietaryPref) : ""}
      </div>
    </article>`)
    .join("");
}

function chip(text) {
  return `<span class="chip">${escapeHtml(text)}</span>`;
}

function fillSettingsForm() {
  const form = $("#settingsForm");
  Object.entries({ ...state.trip, ...state.costs }).forEach(([key, value]) => {
    const input = form.elements[key];
    if (!input) return;
    input.value = Array.isArray(value) ? value.join("\n") : value;
  });
}

function renderAdmin() {
  $("#adminCount").textContent = `${state.guests.length} registered`;
  renderCosts();
  renderTransportBoard();
  renderAdminGuests();
}

function renderCosts() {
  const costs = calculateCosts();
  const diet = countBy(state.guests.filter((guest) => guest.eatingGroupFood), "dietaryPref");
  $("#costGrid").innerHTML = [
    ["Registered", state.guests.length],
    ["People", costs.people],
    ["Drivers", driverCount()],
    ["Total seats", seatCount()],
    ["Overnight", overnightCount()],
    ["Need tent", state.guests.filter((guest) => guest.stayingOvernight === "yes" && guest.hasTent === "no").length],
    ["Meat", diet.meat || 0],
    ["Veg/Vegan", (diet.vegetarian || 0) + (diet.vegan || 0)],
    ["Per person est.", fmt(costs.perPerson)]
  ]
    .map(([label, value]) => `<div class="stat-card"><div class="stat-value">${escapeHtml(value)}</div><div class="stat-label">${escapeHtml(label)}</div></div>`)
    .join("");
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
        ${detail("Experience", labelExperience(guest.kayakExperience))}
        ${detail("Overnight", labelStay(guest.stayingOvernight))}
        ${detail("Tent", guest.hasTent || "-")}
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

function labelExperience(value) {
  return { beginner: "Beginner", intermediate: "Some experience", experienced: "Experienced", okay: "Some experience", confident: "Experienced" }[value] || "Not set";
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
        },
        costs: {
          fixedCosts: Number(data.fixedCosts),
          perPersonCost: Number(data.perPersonCost),
          perCarCost: Number(data.perCarCost),
          currency: data.currency
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

state = await api("/api/state");
renderTripView();
goToStep(0);
