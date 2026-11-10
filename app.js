// Week in Fits, front end.
// Plain static JS, no framework. The planner is a deterministic rule
// system: warmth matched to temperature, occasion matched to tags,
// no garment repeats in the week, colours spread across days.
// Try-ons go through our own server at /api/tryon, never direct
// from the browser to Clothsy, so the API key stays server-side.

const SAMPLE_SHOPPERS = [
  {
    id: "sample-woman",
    name: "Sample shopper, Amara (woman)",
    note: "Sample photo from Unsplash, full length.",
    imageUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=80",
  },
  {
    id: "sample-man",
    name: "Sample shopper, David (man)",
    note: "Sample photo from Unsplash, full length.",
    imageUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800&q=80",
  },
];

const WEEK_START = new Date(2026, 10, 16);
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DEFAULT_OCCASIONS = ["work", "work", "casual", "work", "date", "event", "rest"];
const OCCASIONS = ["work", "casual", "event", "date", "rest"];
const FALLBACK_WEATHER = { temp: 31, rain: 10, label: "31C, sunny, 10% rain (fallback)" };
const STORAGE_KEY = "weekInFitsCustomGarments";
const DEMO_NOTE = "Demo mode, sample try-on, not a live Clothsy call.";
const MANNEQUIN_SVG =
  '<svg class="mannequin-figure" viewBox="0 0 120 220" role="img" aria-label="Digital mannequin, prototype">' +
  '<rect x="52" y="8" width="16" height="10" rx="3" fill="#5b21e8"/>' +
  '<path d="M52 18 L68 18 L64 34 L56 34 Z" fill="#5b21e8"/>' +
  '<path d="M38 44 Q60 34 82 44 L88 70 Q92 96 84 130 L80 168 L40 168 L36 130 Q28 96 32 70 Z" fill="#efe9fd" stroke="#5b21e8" stroke-width="3"/>' +
  '<rect x="58" y="168" width="4" height="34" fill="#5b21e8"/>' +
  '<rect x="38" y="202" width="44" height="8" rx="4" fill="#5b21e8"/>' +
  "</svg>";

const state = {
  garments: [],
  customGarments: [],
  person: null,
  personDataUrl: null,
  weather: [],
  weatherSource: "fallback",
  plan: [],
  mode: "demo",
  credits: "unknown",
  mannequinSelected: [],
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadCustomGarments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.customGarments = raw ? JSON.parse(raw) : [];
  } catch (err) {
    state.customGarments = [];
  }
}

function saveCustomGarments() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.customGarments));
  } catch (err) {
    // Storage may be full or blocked, the closet still works for this visit.
  }
}

function allGarments() {
  return state.garments.concat(state.customGarments);
}

function renderSamples() {
  const wrap = $("samples");
  wrap.innerHTML = "";
  SAMPLE_SHOPPERS.forEach((shopper) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sample-card";
    button.dataset.shopperId = shopper.id;
    button.innerHTML =
      '<img src="' + shopper.imageUrl + '" alt="' + escapeHtml(shopper.name) + '">' +
      "<p><strong>" + escapeHtml(shopper.name) + "</strong><br>" + escapeHtml(shopper.note) + "</p>";
    button.addEventListener("click", () => selectPerson(shopper));
    wrap.appendChild(button);
  });
}

function selectPerson(shopper) {
  state.person = shopper;
  state.personDataUrl = null;
  document.querySelectorAll(".sample-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.shopperId === shopper.id);
  });
  $("photo-preview").innerHTML =
    '<img src="' + shopper.imageUrl + '" alt="' + escapeHtml(shopper.name) + '">' +
    "<p><strong>" + escapeHtml(shopper.name) + "</strong>, sample photo. Tick the consent box before a try-on.</p>";
}

function downscalePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that photo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a readable photo."));
      img.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderCloset() {
  const grid = $("closet-grid");
  grid.innerHTML = "";
  allGarments().forEach((garment) => {
    const card = document.createElement("article");
    card.className = "garment";
    const isCustom = garment.id && garment.id.indexOf("custom-") === 0;
    card.innerHTML =
      '<img src="' + escapeHtml(garment.imageUrl) + '" alt="' + escapeHtml(garment.name) + '" loading="lazy">' +
      '<div class="garment-body"><h4>' + escapeHtml(garment.name) + "</h4>" +
      "<p>" + escapeHtml(garment.type) + ", " + escapeHtml(garment.colour) + ", " + escapeHtml(garment.warmth) + "<br>" +
      escapeHtml((garment.occasions || []).join(", ")) + "</p>" +
      (isCustom ? '<button class="button small secondary" type="button" data-remove="' + escapeHtml(garment.id) + '">Remove</button>' : "") +
      "</div>";
    grid.appendChild(card);
  });
  grid.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      state.customGarments = state.customGarments.filter((g) => g.id !== button.dataset.remove);
      saveCustomGarments();
      renderCloset();
    });
  });
}

function renderWeekDays() {
  const wrap = $("week-days");
  wrap.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const date = new Date(WEEK_START);
    date.setDate(WEEK_START.getDate() + i);
    const dateText = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const weather = state.weather[i] || FALLBACK_WEATHER;
    const row = document.createElement("div");
    row.className = "day-row";
    row.innerHTML =
      '<div><div class="day-label">' + DAY_NAMES[i] + ", " + dateText + "</div>" +
      '<div class="weather">' + escapeHtml(weather.label) + "</div></div>" +
      '<select data-day="' + i + '" aria-label="Occasion for ' + DAY_NAMES[i] + '">' +
      OCCASIONS.map((o) => '<option value="' + o + '"' + (o === DEFAULT_OCCASIONS[i] ? " selected" : "") + ">" + o + "</option>").join("") +
      "</select>";
    wrap.appendChild(row);
  }
}

async function loadWeather() {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=6.5244&longitude=3.3792" +
    "&daily=temperature_2m_max,precipitation_probability_max" +
    "&timezone=Africa%2FLagos&start_date=2026-11-16&end_date=2026-11-22";
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("Weather request failed");
    }
    const data = await res.json();
    const temps = data.daily && data.daily.temperature_2m_max;
    const rain = data.daily && data.daily.precipitation_probability_max;
    if (!temps || temps.length < 7) {
      throw new Error("Weather data was incomplete");
    }
    state.weather = temps.map((temp, i) => {
      const rainProb = rain ? rain[i] : 10;
      const rainText = rainProb >= 60 ? "rain likely" : (rainProb >= 30 ? "some rain" : "sunny");
      return {
        temp: Math.round(temp),
        rain: rainProb,
        label: Math.round(temp) + "C, " + rainText + ", " + rainProb + "% rain (forecast)",
      };
    });
    state.weatherSource = "forecast";
  } catch (err) {
    state.weather = [];
    for (let i = 0; i < 7; i++) {
      state.weather.push(FALLBACK_WEATHER);
    }
    state.weatherSource = "fallback";
  }
  renderWeekDays();
}

function warmthFor(temp, rain) {
  if (rain >= 60 || temp < 24) {
    return "warm";
  }
  if (temp >= 29) {
    return "light";
  }
  return "medium";
}

function scoreGarment(garment, occasion, wantWarmth, usedColours) {
  let score = 0;
  if ((garment.occasions || []).indexOf(occasion) !== -1) {
    score += 3;
  }
  if (garment.warmth === wantWarmth) {
    score += 3;
  } else if (
    (wantWarmth === "light" && garment.warmth === "medium") ||
    (wantWarmth === "medium" && garment.warmth === "light") ||
    (wantWarmth === "medium" && garment.warmth === "warm")
  ) {
    score += 1;
  }
  if (garment.type === "top" || garment.type === "dress") {
    score += 1;
  }
  if (usedColours.indexOf(garment.colour) === -1) {
    score += 1;
  }
  return score;
}

function generateWeek() {
  const garments = allGarments();
  const message = $("plan-message");
  if (garments.length < 7) {
    message.textContent = "Add more garments first, the week needs at least 7.";
    return;
  }
  const used = new Set();
  const usedColours = [];
  const plan = [];
  for (let i = 0; i < 7; i++) {
    const occasion = document.querySelector('select[data-day="' + i + '"]').value;
    const weather = state.weather[i] || FALLBACK_WEATHER;
    const wantWarmth = warmthFor(weather.temp, weather.rain);
    const date = new Date(WEEK_START);
    date.setDate(WEEK_START.getDate() + i);
    const candidates = garments
      .filter((g) => !used.has(g.id))
      .map((g, index) => ({ garment: g, score: scoreGarment(g, occasion, wantWarmth, usedColours), index: index }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    if (candidates.length === 0) {
      message.textContent = "Not enough unused garments left for the full week.";
      return;
    }
    const main = candidates[0].garment;
    used.add(main.id);
    usedColours.push(main.colour);
    let paired = null;
    if (main.type === "top") {
      const bottoms = garments.filter((g) => !used.has(g.id) && g.type === "bottom" && (g.occasions || []).indexOf(occasion) !== -1);
      if (bottoms.length > 0) {
        paired = bottoms[0];
        used.add(paired.id);
      }
    } else if (main.type === "dress" && (wantWarmth === "warm" || occasion === "event" || occasion === "date")) {
      const jackets = garments.filter((g) => !used.has(g.id) && g.type === "jacket");
      if (jackets.length > 0) {
        paired = jackets[0];
        used.add(paired.id);
      }
    } else if (main.type === "bottom") {
      const tops = garments.filter((g) => !used.has(g.id) && g.type === "top" && (g.occasions || []).indexOf(occasion) !== -1);
      if (tops.length > 0) {
        paired = tops[0];
        used.add(paired.id);
      }
    }
    plan.push({ dayIndex: i, date: date, occasion: occasion, weather: weather, main: main, paired: paired });
  }
  state.plan = plan;
  state.mannequinSelected = [];
  $("mannequin-grid").innerHTML = "";
  updateMannequinControls();
  message.textContent = "Week planned. No garment repeats, warmth matched to the weather, occasion matched to the day.";
  renderPlan();
}

function renderPlan() {
  const grid = $("plan-grid");
  grid.innerHTML = "";
  state.plan.forEach((day) => {
    const dateText = day.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const card = document.createElement("article");
    card.className = "plan-card";
    card.innerHTML =
      '<img src="' + escapeHtml(day.main.imageUrl) + '" alt="' + escapeHtml(day.main.name) + '" loading="lazy">' +
      '<div class="plan-body"><h4>' + DAY_NAMES[day.dayIndex] + ", " + dateText + "</h4>" +
      "<p>Occasion: " + escapeHtml(day.occasion) + "<br>" + escapeHtml(day.weather.label) + "</p>" +
      "<p><strong>" + escapeHtml(day.main.name) + "</strong>" +
      (day.paired ? "<br>Paired with: " + escapeHtml(day.paired.name) : "") + "</p>" +
      '<label class="test-check"><input type="checkbox" data-mannequin-day="' + day.dayIndex + '"' +
      (state.mannequinSelected.indexOf(day.dayIndex) !== -1 ? " checked" : "") + "> Test this outfit</label>" +
      '<button class="button small" type="button" data-tryon="' + day.dayIndex + '">Try on</button></div>';
    grid.appendChild(card);
  });
  grid.querySelectorAll("[data-mannequin-day]").forEach((box) => {
    box.addEventListener("change", () => {
      const dayIndex = Number(box.dataset.mannequinDay);
      if (box.checked) {
        if (state.mannequinSelected.length >= 4) {
          box.checked = false;
          $("mannequin-message").textContent = "Pick at most 4 outfits to test.";
          return;
        }
        state.mannequinSelected.push(dayIndex);
      } else {
        state.mannequinSelected = state.mannequinSelected.filter((d) => d !== dayIndex);
      }
      updateMannequinControls();
    });
  });
  grid.querySelectorAll("[data-tryon]").forEach((button) => {
    button.addEventListener("click", () => tryOnDay(Number(button.dataset.tryon), button));
  });
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: data };
  } finally {
    clearTimeout(timer);
  }
}

async function callTryOn(day, onProgress) {
  const payload = {
    garmentImageUrl: day.main.imageUrl,
    title: day.main.name + (day.paired ? " with " + day.paired.name : ""),
    consent: true,
  };
  if (state.personDataUrl) {
    payload.personImageData = state.personDataUrl;
  } else {
    payload.personImageUrl = state.person.imageUrl;
  }
  let data;
  try {
    const started = await fetchJson("/api/tryon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, 90000);
    data = started.data;
    if (!started.ok) {
      return { status: "failed", message: data.message || data.error || ("Server returned HTTP " + started.status) };
    }
  } catch (err) {
    if (err && err.name === "AbortError") {
      return { status: "failed", message: "The try-on took too long to start. Please try again." };
    }
    return { status: "failed", message: "Could not start the try-on: " + err.message };
  }
  if (data.mode === "live" && data.status === "pending" && data.id) {
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (onProgress) {
        onProgress("Still working, check " + (attempt + 1) + " of 40.");
      }
      let pollData = null;
      try {
        const polled = await fetchJson("/api/tryon?id=" + encodeURIComponent(data.id), {}, 20000);
        pollData = polled.data;
      } catch (err) {
        continue;
      }
      if (pollData.status === "success" && pollData.resultUrl) {
        data = pollData;
        break;
      }
      if (pollData.status === "failed") {
        data = pollData;
        break;
      }
      if (attempt === 39) {
        data = { status: "failed", message: "Try-on was still working after about two minutes. Please try again, it may have finished on Clothsy." };
      }
    }
  }
  return data;
}

async function tryOnDay(dayIndex, button) {
  const day = state.plan[dayIndex];
  const resultBox = $("tryon-result");
  if (!day) {
    return;
  }
  if (!state.person) {
    resultBox.innerHTML = "<p>Pick a sample shopper or upload your photo first.</p>";
    return;
  }
  if (!$("consent").checked) {
    resultBox.innerHTML = "<p>Tick the consent box in Step 1 before a try-on. The person in the photo must be an adult who agreed to it.</p>";
    $("consent").focus();
    return;
  }
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Trying on...";
  resultBox.innerHTML = "<p>Making your try-on for " + escapeHtml(day.main.name) + ". This can take up to about two minutes.</p>";
  document.getElementById("tryon-result-section").scrollIntoView({ behavior: "smooth" });
  try {
    const data = await callTryOn(day, (text) => {
      resultBox.innerHTML = "<p>Making your try-on for " + escapeHtml(day.main.name) + ". " + escapeHtml(text) + "</p>";
    });
    if (data.status === "failed") {
      resultBox.innerHTML =
        "<p><strong>Try-on did not finish.</strong></p><p>" +
        escapeHtml(data.message || data.error || "Try-on did not finish.") + "</p>";
      return;
    }
    if (data.mode === "demo") {
      resultBox.innerHTML =
        '<div class="demo-label">' + escapeHtml(DEMO_NOTE) + " " + escapeHtml(data.message || "") + "</div>" +
        '<p><img src="' + escapeHtml(data.resultUrl) + '" alt="Demo try-on sample for ' + escapeHtml(day.main.name) + '"></p>' +
        "<p>AI-generated try-on. Main garment: " + escapeHtml(day.main.name) +
        (day.paired ? ", paired with " + escapeHtml(day.paired.name) : "") + ".</p>";
    } else {
      resultBox.innerHTML =
        '<div class="live-label">Live Clothsy try-on. AI-generated try-on.</div>' +
        '<p><img src="' + escapeHtml(data.resultUrl) + '" alt="Try-on result for ' + escapeHtml(day.main.name) + '"></p>' +
        "<p>Main garment: " + escapeHtml(day.main.name) +
        (day.paired ? ", paired with " + escapeHtml(day.paired.name) : "") +
        ". Result link works for 24 hours.</p>";
    }
  } catch (err) {
    resultBox.innerHTML = "<p><strong>Try-on failed.</strong></p><p>" + escapeHtml(err.message) + "</p>";
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function updateMannequinControls() {
  const message = $("mannequin-message");
  const button = $("test-mannequin");
  const count = state.mannequinSelected.length;
  if (state.plan.length === 0) {
    message.textContent = "Generate your week first, then tick 3 or 4 days in your plan below.";
    button.disabled = true;
    return;
  }
  if (count < 3) {
    message.textContent = "Tick " + (3 - count) + " more day" + (3 - count === 1 ? "" : "s") + " in your plan, 3 or 4 outfits to test.";
    button.disabled = true;
  } else {
    message.textContent = count + " outfits picked. Each test is 1 Clothsy credit in live mode.";
    button.disabled = false;
  }
}

async function runMannequinTest() {
  const grid = $("mannequin-grid");
  const button = $("test-mannequin");
  const selected = state.mannequinSelected.slice().sort((a, b) => a - b);
  if (selected.length < 3 || selected.length > 4) {
    $("mannequin-message").textContent = "Pick 3 or 4 days to test.";
    return;
  }
  if (!state.person) {
    $("mannequin-message").textContent = "Pick a sample shopper or upload your photo first.";
    return;
  }
  if (!$("consent").checked) {
    $("mannequin-message").textContent = "Tick the consent box in Step 1 before a try-on.";
    $("consent").focus();
    return;
  }
  button.disabled = true;
  button.textContent = "Testing on the mannequin...";
  grid.innerHTML = "";
  const cards = {};
  selected.forEach((dayIndex) => {
    const day = state.plan[dayIndex];
    const dateText = day.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const card = document.createElement("article");
    card.className = "mannequin-card";
    card.innerHTML = MANNEQUIN_SVG +
      '<div class="mannequin-body"><span class="prototype-label">Digital mannequin, prototype</span>' +
      "<h4>" + DAY_NAMES[day.dayIndex] + ", " + dateText + "</h4>" +
      "<p>" + escapeHtml(day.main.name) + (day.paired ? ", paired with " + escapeHtml(day.paired.name) : "") + "<br>Occasion: " + escapeHtml(day.occasion) + "</p>" +
      '<p class="mannequin-status">Making the try-on, this can take up to about two minutes.</p></div>';
    grid.appendChild(card);
    cards[dayIndex] = card;
  });
  document.getElementById("mannequin-test").scrollIntoView({ behavior: "smooth" });
  const testOne = async (dayIndex) => {
    const day = state.plan[dayIndex];
    const card = cards[dayIndex];
    const statusEl = card.querySelector(".mannequin-status");
    try {
      const data = await callTryOn(day, (text) => {
        if (statusEl) {
          statusEl.textContent = text;
        }
      });
      if (data.status === "failed") {
        if (statusEl) {
          statusEl.textContent = "Try-on did not finish: " + (data.message || data.error || "Try-on did not finish.");
        }
      } else {
        const label = data.mode === "demo"
          ? "Demo mode, sample try-on, not a live Clothsy call."
          : "Live Clothsy try-on. AI-generated try-on.";
        card.innerHTML =
          '<p><img src="' + escapeHtml(data.resultUrl) + '" alt="Mannequin test for ' + escapeHtml(day.main.name) + '"></p>' +
          '<div class="mannequin-body"><span class="prototype-label">Digital mannequin, prototype</span>' +
          "<h4>" + DAY_NAMES[day.dayIndex] + ", " + day.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + "</h4>" +
          "<p>" + escapeHtml(day.main.name) + (day.paired ? ", paired with " + escapeHtml(day.paired.name) : "") + "<br>Occasion: " + escapeHtml(day.occasion) + "</p>" +
          "<p>" + escapeHtml(label) + "</p></div>";
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = "Try-on failed: " + err.message;
      }
    }
  };
  await Promise.all(selected.map((dayIndex) => testOne(dayIndex)));
  button.disabled = false;
  button.textContent = "Test these outfits on the mannequin";
  updateMannequinControls();
  checkHealth();
}

async function checkHealth() {
  const badge = $("mode-badge");
  const note = $("mode-note");
  const footer = $("footer-mode");
  try {
    const res = await fetch("/api/health");
    if (!res.ok) {
      throw new Error("Health check failed");
    }
    const data = await res.json();
    state.mode = data.mode || "demo";
    state.credits = data.credits !== undefined ? data.credits : "unknown";
  } catch (err) {
    state.mode = "demo";
    state.credits = "unknown";
  }
  if (state.mode === "live") {
    badge.textContent = "Live mode, Clothsy connected";
    note.textContent = "Mode: live. Try-ons use the Clothsy API. Credits: " + state.credits + ". One finished try-on costs 1 credit.";
    footer.textContent = "Live mode: Clothsy API connected. Credits: " + state.credits + ".";
  } else {
    badge.textContent = "Demo mode";
    note.textContent = "Mode: demo. " + DEMO_NOTE + " Set CLOTHSY_API_KEY as a Vercel env var to enable live try-ons.";
    footer.textContent = "Demo mode: sample try-on, not a live Clothsy call, until an API key is set.";
  }
}

async function init() {
  loadCustomGarments();
  renderSamples();
  renderWeekDays();
  try {
    const res = await fetch("data/garments.json");
    state.garments = await res.json();
  } catch (err) {
    state.garments = [];
    $("closet-grid").innerHTML = "<p>Sample garments could not be loaded. Check that data/garments.json is served with the page.</p>";
  }
  renderCloset();
  await loadWeather();
  checkHealth();
  updateMannequinControls();
  $("generate-week").addEventListener("click", generateWeek);
  $("test-mannequin").addEventListener("click", runMannequinTest);
  $("photo-upload").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      $("photo-preview").innerHTML = "<p>That file is not a JPEG or PNG photo.</p>";
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      $("photo-preview").innerHTML = "<p>That photo is larger than 4 MB. Pick a smaller photo.</p>";
      return;
    }
    try {
      const dataUrl = await downscalePhoto(file);
      state.person = { id: "upload", name: "Your uploaded photo", imageUrl: dataUrl };
      state.personDataUrl = dataUrl;
      document.querySelectorAll(".sample-card").forEach((card) => card.classList.remove("selected"));
      $("photo-preview").innerHTML =
        '<img src="' + dataUrl + '" alt="Your uploaded photo">' +
        "<p><strong>Your uploaded photo.</strong> Tick the consent box before a try-on. Your photo is only sent to Clothsy when you tap Try on.</p>";
    } catch (err) {
      $("photo-preview").innerHTML = "<p>" + escapeHtml(err.message) + "</p>";
    }
  });
  $("add-garment-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const message = $("add-form-message");
    const imageUrl = $("new-image-url").value.trim();
    const name = $("new-name").value.trim();
    const type = $("new-type").value;
    const colour = $("new-colour").value.trim();
    const warmth = $("new-warmth").value;
    const occasions = Array.from(document.querySelectorAll('input[name="new-occasion"]:checked')).map((box) => box.value);
    if (!/^https:\/\//.test(imageUrl)) {
      message.textContent = "Image URL must start with https://.";
      return;
    }
    if (!name || !colour || occasions.length === 0) {
      message.textContent = "Fill in the name, colour, and at least one occasion.";
      return;
    }
    const garment = {
      id: "custom-" + Date.now(),
      name: name,
      type: type,
      colour: colour.toLowerCase(),
      warmth: warmth,
      occasions: occasions,
      imageUrl: imageUrl,
    };
    state.customGarments.push(garment);
    saveCustomGarments();
    renderCloset();
    message.textContent = name + " added to your closet.";
    event.target.reset();
  });
}

document.addEventListener("DOMContentLoaded", init);
