/* 健身紀錄 App - Phase 1 MVP */
"use strict";

/* ================= 資料 ================= */
const STORE_KEY = "fitapp.v1";

const COURSES = {
  A: {
    name: "A 課・推力日",
    exercises: ["腿推機", "胸推機", "肩推機", "蝴蝶機夾胸", "三頭下壓", "捲腹"],
    extras: ["跑步機坡度快走(分)", "滑步機(分)"],
    extrasTitle: "有氧收尾（目標 30 分鐘，數字填分鐘）",
  },
  B: {
    name: "B 課・拉力日",
    exercises: ["腿彎舉機", "滑輪下拉", "坐姿划船", "反向飛鳥", "二頭彎舉", "棒式(秒)"],
    extras: ["跑步機坡度快走(分)", "滑步機(分)"],
    extrasTitle: "有氧收尾（目標 30 分鐘，數字填分鐘）",
  },
  C: {
    name: "C 課・下肢日",
    exercises: ["腿推機", "腿伸展機", "腿彎舉機", "髖外展機", "站姿提踵", "捲腹"],
    extras: ["跑步機坡度快走(分)", "滑步機(分)"],
    extrasTitle: "有氧收尾（目標 30 分鐘，數字填分鐘）",
  },
  D: {
    name: "D 課・居家保底",
    exercises: ["深蹲", "伏地挺身", "臀橋", "棒式(秒)"],
    extras: ["原地登階(分)", "超人式"],
    extrasTitle: "加碼動作（有餘力再做）",
  },
  FREE: { name: "自由訓練", exercises: [], extras: [], extrasTitle: "" },
};

const LIBRARY = [
  { name: "腿推機", group: "腿" },
  { name: "腿伸展機", group: "腿前側" },
  { name: "腿彎舉機", group: "腿後側" },
  { name: "髖外展機", group: "臀" },
  { name: "站姿提踵", group: "小腿" },
  { name: "胸推機", group: "胸" },
  { name: "蝴蝶機夾胸", group: "胸" },
  { name: "滑輪下拉", group: "背" },
  { name: "坐姿划船", group: "背" },
  { name: "肩推機", group: "肩" },
  { name: "反向飛鳥", group: "後肩・上背" },
  { name: "二頭彎舉", group: "手臂" },
  { name: "三頭下壓", group: "手臂" },
  { name: "捲腹", group: "核心" },
  { name: "棒式(秒)", group: "核心" },
  { name: "深蹲", group: "腿・居家" },
  { name: "羅馬尼亞硬舉", group: "腿後・下背" },
  { name: "啞鈴臥推", group: "胸" },
  { name: "啞鈴肩推", group: "肩" },
  { name: "伏地挺身", group: "胸・居家" },
  { name: "臀橋", group: "臀腿・居家" },
  { name: "超人式", group: "下背・居家" },
  { name: "原地登階(分)", group: "有氧・居家" },
  { name: "跑步機坡度快走(分)", group: "有氧" },
  { name: "滑步機(分)", group: "有氧" },
];

/* 有氧動作的專屬欄位（名稱以「(分)」結尾者視為有氧） */
const CARDIO_FIELDS = {
  "跑步機坡度快走(分)": [
    { key: "mins", label: "分鐘", step: 5, def: 30 },
    { key: "incline", label: "坡度%", step: 1, def: 6 },
    { key: "speed", label: "km/h", step: 0.5, def: 5.5 },
  ],
  "滑步機(分)": [
    { key: "mins", label: "分鐘", step: 5, def: 30 },
    { key: "resistance", label: "阻力", step: 1, def: 5 },
  ],
};

function cardioConfig(name) {
  if (CARDIO_FIELDS[name]) return CARDIO_FIELDS[name];
  if (/\(分\)$/.test(name)) return [{ key: "mins", label: "分鐘", step: 5, def: 10 }];
  return null;
}

/** 單組紀錄的顯示字串（重訓 / 有氧通用；相容舊資料的 reps=分鐘 寫法） */
function fmtSet(exName, s) {
  if (cardioConfig(exName) || s.mins != null) {
    const mins = s.mins != null ? s.mins : s.reps;
    const parts = [`${mins}分`];
    if (s.incline != null) parts.push(`坡${s.incline}%`);
    if (s.speed != null) parts.push(`${s.speed}km/h`);
    if (s.resistance != null) parts.push(`阻力${s.resistance}`);
    return parts.join("・");
  }
  return `${s.kg}kg×${s.reps}`;
}

let state = loadState();

/* ================= 訓練計畫（plan.json，可線上更新） ================= */
const DEFAULT_PLAN = {
  updated: "builtin",
  startDate: "2026-07-14",
  pattern: "alternate",
  weeklyTarget: 3,
  rotation: ["A", "B", "C"],
  deloadEvery: 5,
  cardioTargetMins: 30,
  stepsTarget: 7000,
  phases: [],
};

let plan = loadCachedPlan();

function loadCachedPlan() {
  try {
    const p = JSON.parse(localStorage.getItem("fitapp.plan"));
    return Object.assign({}, DEFAULT_PLAN, p || {});
  } catch { return { ...DEFAULT_PLAN }; }
}

async function refreshPlan() {
  try {
    const res = await fetch("plan.json", { cache: "no-cache" });
    if (!res.ok) return;
    const p = await res.json();
    const changed = p.updated !== plan.updated;
    localStorage.setItem("fitapp.plan", JSON.stringify(p));
    plan = Object.assign({}, DEFAULT_PLAN, p);
    if (changed && !state.active) renderTrain();
  } catch { /* 離線時用快取版 */ }
}

/* ================= 排程引擎（練1休1） ================= */
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
function weekIndex(dateStr) { return Math.max(0, Math.floor(daysBetween(plan.startDate, dateStr) / 7)); }
function isDeloadWeek(dateStr) { return plan.deloadEvery > 0 && (weekIndex(dateStr) + 1) % plan.deloadEvery === 0; }

function nextCourseAfter(courseKey) {
  const rot = plan.rotation;
  const i = rot.indexOf(courseKey);
  return rot[(i + 1) % rot.length] || rot[0];
}

/** 最近一次輪替課（A/B/C）；D 課與自由訓練不影響輪替 */
function lastGymWorkout() {
  for (let i = state.workouts.length - 1; i >= 0; i--)
    if (plan.rotation.includes(state.workouts[i].course)) return state.workouts[i];
  return null;
}

function todayPlanInfo() {
  const today = todayStr();
  const trainedToday = state.workouts.some((w) => w.date === today);
  const lastGym = lastGymWorkout();
  const nextCourse = lastGym ? nextCourseAfter(lastGym.course) : plan.rotation[0];
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const weekCount = state.workouts.filter((w) => w.date >= todayStr(monday)).length;
  let type;
  if (trainedToday) type = "done";
  else if (lastGym && daysBetween(lastGym.date, today) === 1) type = "rest";
  else type = "train";
  return { type, nextCourse, weekCount, deload: isDeloadWeek(today), dayN: state.workouts.length + 1 };
}

function currentPhase() {
  const ym = todayStr().slice(0, 7);
  return (plan.phases || []).find((p) => ym >= p.from && ym <= p.to) || null;
}

/* ================= 重量處方引擎（雙進度法） ================= */
const INCREMENTS = { "腿推機": 5, "腿彎舉機": 5, "腿伸展機": 5, "髖外展機": 5, "站姿提踵": 5 };
function repCeil(name) {
  if (name === "捲腹") return 20;
  if (name === "棒式(秒)") return 60;
  return 15;
}

function lastRecordFull(exName) {
  for (let i = state.workouts.length - 1; i >= 0; i--) {
    const e = state.workouts[i].entries.find((x) => x.name === exName && x.sets.length);
    if (e) return { sets: e.sets, date: state.workouts[i].date };
  }
  return null;
}

function prescribe(exName) {
  const reduce = isDeloadWeek(todayStr()) ? "減量週" : (state.active?.low ? "低強度模式" : null);
  const cfg = cardioConfig(exName);
  const last = lastRecordFull(exName);

  if (cfg) {
    if (!last) return { reason: "照預設強度開始就好" };
    const s = last.sets[last.sets.length - 1];
    const f = { mins: s.mins != null ? s.mins : (s.reps || 30) };
    if (s.incline != null) f.incline = s.incline;
    if (s.speed != null) f.speed = s.speed;
    if (s.resistance != null) f.resistance = s.resistance;
    let reason = "維持上次強度";
    const target = plan.cardioTargetMins || 30;
    if (reduce) { f.mins = Math.max(15, Math.round(f.mins * 0.7 / 5) * 5); reason = `${reduce}：時間 -30%`; }
    else if (f.mins < target) { f.mins = Math.min(target, f.mins + 5); reason = `先把時間拉到 ${target} 分`; }
    else if (f.incline != null && f.incline < 12) { f.incline += 1; reason = "時間達標 → 坡度 +1%"; }
    else if (f.resistance != null) { f.resistance += 1; reason = "時間達標 → 阻力 +1"; }
    else if (f.speed != null) { f.speed = Math.round((f.speed + 0.3) * 10) / 10; reason = "坡度已頂 → 速度 +0.3"; }
    return { cardio: f, reason };
  }

  if (!last) return { reason: "第一次做：選能標準完成 15 下的重量" };
  const ceil = repCeil(exName);
  const top = Math.max(...last.sets.map((s) => s.kg || 0));

  if (top === 0) { // 徒手：次數進階
    const maxReps = Math.max(...last.sets.map((s) => s.reps || 0));
    if (maxReps >= ceil)
      return { kg: 0, reps: ceil, reason: exName === "棒式(秒)" ? "已達 60 秒 → 試單腳棒式" : "已達上限 → 放慢速度更有感" };
    return { kg: 0, reps: Math.min(ceil, maxReps + (exName === "棒式(秒)" ? 10 : 2)), reason: "徒手進階：加次數" };
  }

  const topSets = last.sets.filter((s) => (s.kg || 0) === top);
  const inc = INCREMENTS[exName] != null ? INCREMENTS[exName] : 2.5;
  let kg = top, reason;
  if (topSets.length >= 2 && topSets.every((s) => (s.reps || 0) >= ceil)) {
    kg = top + inc;
    reason = `上次 ${top}kg 每組滿 ${ceil} 下 → 加重（就近選槽位）`;
  } else if (topSets.some((s) => (s.reps || 0) < 12)) {
    reason = `維持 ${top}kg，先把每組做回 12 下`;
  } else {
    reason = `維持 ${top}kg，目標每組多 1 下`;
  }
  if (reduce) { kg = Math.round(kg * 0.7 * 2) / 2; reason = `${reduce}：重量 -30%`; }
  return { kg, reason };
}

function defaultState() {
  return {
    weights: [],            // {date:"YYYY-MM-DD", kg:75}
    workouts: [],           // {id, date, course, startTs, endTs, entries:[{name, sets:[{kg,reps,ts}]}]}
    diet: {},               // "YYYY-MM-DD": {sugar:bool, late:bool, steps:num}
    settings: { restSec: 90, sound: true, vibrate: true },
    active: null,           // 進行中的訓練（同 workout 結構，無 endTs）
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    return Object.assign(defaultState(), s);
  } catch (e) {
    console.error("讀取資料失敗", e);
    return defaultState();
  }
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

/* ================= 工具 ================= */
const $ = (id) => document.getElementById(id);

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDateShort(dateStr) {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

/* ================= 分頁切換 ================= */
const VIEW_TITLES = { train: "訓練", weight: "體重", diet: "打卡", history: "歷史", settings: "設定" };

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + name));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  $("topbarTitle").textContent = VIEW_TITLES[name];
  if (name === "train") renderTrain();
  if (name === "weight") renderWeight();
  if (name === "diet") renderDiet();
  if (name === "history") renderHistory();
  if (name === "settings") renderSettings();
}

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => showView(t.dataset.view)));

/* ================= 訓練 ================= */
let elapsedTimer = null;

function startWorkout(courseKey, low) {
  const course = COURSES[courseKey];
  state.active = {
    id: Date.now().toString(36),
    date: todayStr(),
    course: courseKey,
    startTs: Date.now(),
    low: !!low,
    entries: course.exercises.map((n) => ({ name: n, sets: [] })),
  };
  save();
  renderTrain();
  if (courseKey === "FREE") openPicker();
}

/* ================= 今天頁 ================= */
function renderToday() {
  const info = todayPlanInfo();
  const phase = currentPhase();
  const box = $("todayCard");
  const wk = weekIndex(todayStr()) + 1;
  const kicker = `${phase ? phase.name : "訓練計畫"}｜第 ${wk} 週${info.deload ? "・🔧 減量週" : ""}`;

  if (info.type === "done") {
    const w = state.workouts.filter((x) => x.date === todayStr()).pop();
    const st = w ? workoutStats(w) : null;
    box.innerHTML = `<div class="card today-card tc-done">
      <div class="today-kicker">${esc(kicker)}</div>
      <div class="today-main">✅ 今天已完成：${esc(COURSES[w.course]?.name || w.course)}</div>
      <div class="today-sub">${st ? `${st.mins} 分鐘・${st.sets} 組・總量 ${st.vol.toLocaleString()} kg` : ""}</div>
      <div class="today-sub">明天：休息日（步數＋打卡）・本週 ${info.weekCount}/${plan.weeklyTarget} 次 💪</div>
    </div>`;
    return;
  }

  if (info.type === "rest") {
    const d = state.diet[todayStr()] || {};
    const steps = d.steps || 0;
    box.innerHTML = `<div class="card today-card tc-rest">
      <div class="today-kicker">${esc(kicker)}</div>
      <div class="today-main">😴 今天：休息日</div>
      <div class="today-tasks">
        <div class="t-task ${steps >= plan.stepsTarget ? "ok" : ""}">${steps >= plan.stepsTarget ? "✅" : "⬜"} 步數 ${steps.toLocaleString()} / ${plan.stepsTarget.toLocaleString()}</div>
        <div class="t-task ${d.sugar ? "ok" : ""}">${d.sugar ? "✅" : "⬜"} 沒喝含糖飲料</div>
        <div class="t-task ${d.late ? "ok" : ""}">${d.late ? "✅" : "⬜"} 睡前 3 小時不進食</div>
      </div>
      <div class="today-sub">明天：${esc(COURSES[info.nextCourse].name)}。恢復也是訓練的一部分。</div>
      <button class="btn btn-ghost btn-block" id="btnGoDiet">去打卡 →</button>
    </div>`;
    $("btnGoDiet").addEventListener("click", () => showView("diet"));
    return;
  }

  // 訓練日
  const course = COURSES[info.nextCourse];
  const rows = course.exercises.map((n) => {
    const rx = prescribe(n);
    let rxTxt;
    if (rx.cardio) rxTxt = `${rx.cardio.mins} 分`;
    else if (rx.kg == null) rxTxt = "自選";
    else if (rx.kg === 0) rxTxt = `${rx.reps != null ? rx.reps : ""} ${n === "棒式(秒)" ? "秒" : "下"}`;
    else rxTxt = `${rx.kg} kg`;
    return `<div class="rx-row"><span>${esc(n)}</span><b>${esc(rxTxt)}</b></div>`;
  }).join("");
  const over = info.weekCount >= plan.weeklyTarget;
  box.innerHTML = `<div class="card today-card tc-train">
    <div class="today-kicker">${esc(kicker)}</div>
    <div class="today-main">🏋️ 今天：${esc(course.name)}</div>
    <div class="today-sub">本週第 ${info.weekCount + 1}/${plan.weeklyTarget} 次・Day ${info.dayN}${over ? "・本週已達標，今天是加分題" : ""}</div>
    <div class="rx-list">${rows}</div>
    <label class="low-row"><input type="checkbox" id="lowMode"> 今天狀態不好（重量 -30%）</label>
    <button class="btn btn-primary btn-block btn-start-today" id="btnStartToday">開始今天的訓練 →</button>
  </div>`;
  $("btnStartToday").addEventListener("click", () => startWorkout(info.nextCourse, $("lowMode").checked));
}

function renderCalendar() {
  const box = $("calendarStrip");
  const info = todayPlanInfo();
  let nextIsTrain = info.type === "train";
  let course = info.nextCourse;
  const wd = ["日", "一", "二", "三", "四", "五", "六"];
  const cells = [];
  for (let i = 0; i < 14; i++) {
    const dt = new Date();
    dt.setDate(dt.getDate() + i);
    const ds = todayStr(dt);
    let label, cls;
    if (i === 0 && info.type === "done") { label = "✓完成"; cls = "cal-done"; nextIsTrain = false; }
    else if (nextIsTrain) { label = course + " 課"; cls = "cal-" + course.toLowerCase(); course = nextCourseAfter(course); nextIsTrain = false; }
    else { label = "休"; cls = "cal-rest"; nextIsTrain = true; }
    cells.push(`<div class="cal-cell ${cls}${i === 0 ? " cal-today" : ""}${isDeloadWeek(ds) ? " cal-deload" : ""}">
      <span class="cal-wd">${i === 0 ? "今天" : "週" + wd[dt.getDay()]}</span>
      <span class="cal-date">${dt.getMonth() + 1}/${dt.getDate()}</span>
      <span class="cal-tag">${label}</span></div>`);
  }
  box.innerHTML = cells.join("");
}

function finishWorkout() {
  const w = state.active;
  if (!w) return;
  const totalSets = w.entries.reduce((a, e) => a + e.sets.length, 0);
  if (totalSets === 0) {
    if (!confirm("這次訓練沒有記錄任何一組，要放棄這次訓練嗎？")) return;
    state.active = null;
    save();
    renderTrain();
    return;
  }
  if (!confirm(`結束訓練？共完成 ${totalSets} 組。`)) return;
  w.endTs = Date.now();
  w.entries = w.entries.filter((e) => e.sets.length > 0);
  state.workouts.push(w);
  state.active = null;
  save();
  stopRest();
  renderTrain();
  toast("💪 訓練完成，做得好！");
  shareWorkout(w); // 完成即產生 IG 分享卡
}

/** 找某動作最近一次（非本次）的紀錄字串 */
function lastRecord(exName) {
  for (let i = state.workouts.length - 1; i >= 0; i--) {
    const entry = state.workouts[i].entries.find((e) => e.name === exName && e.sets.length);
    if (entry) {
      const setsStr = entry.sets.map((s) => fmtSet(exName, s)).join("、");
      return { text: setsStr, date: state.workouts[i].date, lastSet: entry.sets[entry.sets.length - 1] };
    }
  }
  return null;
}

function renderTrain() {
  const idle = $("trainIdle");
  const active = $("trainActive");
  clearInterval(elapsedTimer);

  if (!state.active) {
    idle.hidden = false;
    active.hidden = true;
    renderToday();
    renderCalendar();
    // 上次訓練摘要
    const last = state.workouts[state.workouts.length - 1];
    const card = $("lastWorkoutCard");
    if (last) {
      card.hidden = false;
      const sets = last.entries.reduce((a, e) => a + e.sets.length, 0);
      const names = last.entries.map((e) => e.name).join("、");
      $("lastWorkoutSummary").textContent =
        `${fmtDateShort(last.date)}　${COURSES[last.course]?.name || last.course}　${sets} 組（${names}）`;
    } else {
      card.hidden = true;
    }
    return;
  }

  idle.hidden = true;
  active.hidden = false;
  $("woCourse").textContent = COURSES[state.active.course]?.name || "訓練";

  const updateElapsed = () => {
    $("woElapsed").textContent = "已進行 " + fmtDuration(Date.now() - state.active.startTs);
  };
  updateElapsed();
  elapsedTimer = setInterval(() => { if (state.active) updateElapsed(); }, 1000);

  renderExercises();
}

function renderExercises() {
  const box = $("exerciseList");
  box.innerHTML = "";
  renderExtras();
  state.active.entries.forEach((entry, idx) => {
    const last = lastRecord(entry.name);
    const lastSetHere = entry.sets[entry.sets.length - 1];
    const cardio = cardioConfig(entry.name);
    const rx = entry.sets.length ? null : prescribe(entry.name);

    const card = document.createElement("div");
    card.className = "exercise-card";

    const headHtml = `
      <div class="ex-head">
        <div class="ex-name">${esc(entry.name)}</div>
        <button class="ex-del" title="移除動作">✕</button>
      </div>
      <div class="ex-last">${last ? `上次 (${fmtDateShort(last.date)})：${esc(last.text)}` : "第一次做這個動作"}</div>
      ${rx && rx.reason ? `<div class="ex-rx">💡 ${esc(rx.reason)}</div>` : ""}
      <div class="set-chips">
        ${entry.sets.map((s, i) => `<button class="set-chip chip-log" data-si="${i}" title="點擊可刪除">${cardio ? "" : `第${i + 1}組 `}<b>${esc(fmtSet(entry.name, s))}</b></button>`).join("")}
      </div>`;

    if (cardio) {
      // 有氧：分鐘＋機台專屬欄位（坡度/速度/阻力）
      card.innerHTML = `${headHtml}
        <div class="cardio-fields">
          ${cardio.map((f) => {
            const def = lastSetHere?.[f.key] ?? rx?.cardio?.[f.key] ?? last?.lastSet?.[f.key] ?? f.def;
            return `<label class="cardio-field"><input type="number" inputmode="decimal" step="${f.step}" data-key="${f.key}" value="${def}"><span>${f.label}</span></label>`;
          }).join("")}
        </div>
        <button class="btn-set btn-cardio">完成有氧 ✓</button>`;

      card.querySelector(".btn-cardio").addEventListener("click", () => {
        const rec = { ts: Date.now() };
        let ok = true;
        cardio.forEach((f) => {
          const v = parseFloat(card.querySelector(`[data-key="${f.key}"]`).value);
          if (f.key === "mins" && (isNaN(v) || v <= 0)) ok = false;
          if (!isNaN(v)) rec[f.key] = v;
        });
        if (!ok) { toast("請先填分鐘數"); return; }
        entry.sets.push(rec);
        save();
        renderExercises();
        toast("🏃 有氧完成，辛苦了！");
      });
    } else {
      const defKg = lastSetHere ? lastSetHere.kg : (rx && rx.kg != null ? rx.kg : (last ? last.lastSet.kg : ""));
      const defReps = lastSetHere ? lastSetHere.reps : (rx && rx.reps != null ? rx.reps : (last ? last.lastSet.reps : ""));
      card.innerHTML = `${headHtml}
        <div class="set-input-row">
          <div class="num-group">
            <button class="stepper" data-f="kg" data-d="-1">−</button>
            <input type="number" class="in-kg" inputmode="decimal" step="0.5" placeholder="重量" value="${defKg}">
            <span class="unit">kg</span>
            <button class="stepper" data-f="kg" data-d="1">＋</button>
          </div>
          <div class="num-group">
            <button class="stepper" data-f="reps" data-d="-1">−</button>
            <input type="number" class="in-reps" inputmode="numeric" placeholder="次數" value="${defReps}">
            <span class="unit">次</span>
            <button class="stepper" data-f="reps" data-d="1">＋</button>
          </div>
          <button class="btn-set">完成一組</button>
        </div>`;

      const inKg = card.querySelector(".in-kg");
      const inReps = card.querySelector(".in-reps");

      card.querySelectorAll(".stepper").forEach((b) => {
        b.addEventListener("click", () => {
          const input = b.dataset.f === "kg" ? inKg : inReps;
          const step = b.dataset.f === "kg" ? 2.5 : 1;
          const cur = parseFloat(input.value) || 0;
          const next = Math.max(0, cur + step * Number(b.dataset.d));
          input.value = b.dataset.f === "kg" ? String(Math.round(next * 10) / 10) : String(Math.round(next));
        });
      });

      card.querySelector(".btn-set").addEventListener("click", () => {
        const kg = parseFloat(inKg.value);
        const reps = parseInt(inReps.value, 10);
        if (isNaN(kg) || kg < 0 || isNaN(reps) || reps <= 0) {
          toast("請先填重量和次數（徒手動作重量填 0）");
          return;
        }
        entry.sets.push({ kg, reps, ts: Date.now() });
        save();
        renderExercises();
        startRest(state.settings.restSec);
      });
    }

    // 點組數晶片 → 刪除該組（誤按修正）
    card.querySelectorAll(".chip-log").forEach((chip) => {
      chip.addEventListener("click", () => {
        const i = Number(chip.dataset.si);
        if (!confirm(`刪除這筆：${fmtSet(entry.name, entry.sets[i])}？`)) return;
        entry.sets.splice(i, 1);
        save();
        renderExercises();
      });
    });

    card.querySelector(".ex-del").addEventListener("click", () => {
      if (entry.sets.length && !confirm(`「${entry.name}」已記錄 ${entry.sets.length} 組，確定移除？`)) return;
      state.active.entries.splice(idx, 1);
      save();
      renderExercises();
    });

    box.appendChild(card);
  });
}

/** 本課加碼動作：一鍵加入（有時間再做） */
function renderExtras() {
  const old = $("extrasRow");
  if (old) old.remove();
  const course = COURSES[state.active?.course];
  const extras = (course?.extras || [])
    .filter((n) => !state.active.entries.some((e) => e.name === n));
  if (!extras.length) return;
  const row = document.createElement("div");
  row.id = "extrasRow";
  row.className = "card";
  row.innerHTML = `<div class="card-title">${esc(course.extrasTitle || "加碼動作")}</div>
    <div class="set-chips">${extras.map((n) => `<button class="set-chip extra-add" data-ex="${esc(n)}">＋ ${esc(n)}</button>`).join("")}</div>`;
  row.querySelectorAll(".extra-add").forEach((b) =>
    b.addEventListener("click", () => {
      state.active.entries.push({ name: b.dataset.ex, sets: [] });
      save();
      renderExercises();
    }));
  $("btnAddExercise").before(row);
}

document.querySelectorAll("[data-start]").forEach((b) =>
  b.addEventListener("click", () => startWorkout(b.dataset.start)));
$("btnFinish").addEventListener("click", finishWorkout);
$("btnAddExercise").addEventListener("click", openPicker);

/* ================= 動作選擇 ================= */
function openPicker() {
  const list = $("pickerList");
  list.innerHTML = "";
  LIBRARY.forEach((ex) => {
    const inUse = state.active && state.active.entries.some((e) => e.name === ex.name);
    const btn = document.createElement("button");
    btn.className = "picker-item";
    btn.innerHTML = `${esc(ex.name)}${inUse ? " ✓" : ""}<span class="muted">${esc(ex.group)}</span>`;
    btn.addEventListener("click", () => addExercise(ex.name));
    list.appendChild(btn);
  });
  $("customExName").value = "";
  $("pickerOverlay").hidden = false;
}

function addExercise(name) {
  if (!state.active) return;
  if (state.active.entries.some((e) => e.name === name)) {
    toast("這個動作已經在清單裡");
    return;
  }
  state.active.entries.push({ name, sets: [] });
  save();
  $("pickerOverlay").hidden = true;
  renderExercises();
}

$("btnCustomEx").addEventListener("click", () => {
  const name = $("customExName").value.trim();
  if (!name) { toast("請輸入動作名稱"); return; }
  addExercise(name);
});
$("btnPickerClose").addEventListener("click", () => ($("pickerOverlay").hidden = true));

/* ================= 組間休息倒數 ================= */
const RING_LEN = 553;
let restEndTs = 0;
let restTotal = 0;
let restTimer = null;

function startRest(sec) {
  restTotal = sec;
  restEndTs = Date.now() + sec * 1000;
  $("restOverlay").hidden = false;
  tickRest();
  clearInterval(restTimer);
  restTimer = setInterval(tickRest, 250);
}

function tickRest() {
  const remainMs = restEndTs - Date.now();
  const remain = Math.max(0, Math.ceil(remainMs / 1000));
  const timeEl = $("restTime");
  timeEl.textContent = remain;
  timeEl.classList.toggle("ending", remain <= 5);
  const ratio = Math.max(0, remainMs / (restTotal * 1000));
  $("ringFg").style.strokeDashoffset = String(RING_LEN * (1 - ratio));
  if (remainMs <= 0) {
    stopRest();
    notifyRestDone();
  }
}

function stopRest() {
  clearInterval(restTimer);
  restTimer = null;
  $("restOverlay").hidden = true;
}

function notifyRestDone() {
  if (state.settings.vibrate && navigator.vibrate) navigator.vibrate([300, 120, 300]);
  if (state.settings.sound) beep();
  toast("⏰ 休息結束，下一組！");
}

let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((t) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.35, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.18);
      osc.start(now + t);
      osc.stop(now + t + 0.2);
    });
  } catch (e) { /* 音效失敗不影響功能 */ }
}

$("btnRestPlus").addEventListener("click", () => {
  restEndTs += 30 * 1000;
  restTotal += 30;
  tickRest();
});
$("btnRestSkip").addEventListener("click", stopRest);

/* ================= 體重 ================= */
const GOAL = { start: 75, m1: 68, final: 55 };

function renderWeight() {
  $("weightDate").value = $("weightDate").value || todayStr();
  const ws = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));

  // 目標提示
  const goalEl = $("weightGoalLine");
  if (ws.length) {
    const cur = ws[ws.length - 1].kg;
    const toM1 = (cur - GOAL.m1).toFixed(1);
    goalEl.textContent = cur > GOAL.m1
      ? `目前 ${cur} kg，距離第一階段目標 ${GOAL.m1} kg 還有 ${toM1} kg`
      : `已達第一階段目標！目前 ${cur} kg，最終目標 ${GOAL.final} kg`;
  } else {
    goalEl.textContent = `起始 ${GOAL.start} kg → 第一階段目標 ${GOAL.m1} kg`;
  }

  // 圖表
  const chart = $("weightChart");
  if (ws.length < 2) {
    chart.innerHTML = `<div class="muted center">${ws.length ? "再多記幾天就會出現趨勢線" : "還沒有資料"}</div>`;
  } else {
    chart.innerHTML = buildWeightChart(ws.slice(-60));
  }

  // 清單（新到舊）
  const list = $("weightList");
  list.innerHTML = "";
  [...ws].reverse().slice(0, 30).forEach((w, i, arr) => {
    const prev = arr[i + 1];
    let diffHtml = "";
    if (prev) {
      const d = +(w.kg - prev.kg).toFixed(1);
      if (d !== 0) diffHtml = `<span class="w-diff ${d < 0 ? "diff-down" : "diff-up"}">${d < 0 ? "▼" : "▲"}${Math.abs(d)}</span>`;
    }
    const row = document.createElement("div");
    row.className = "w-item";
    row.innerHTML = `<span class="muted">${w.date}</span>
      <span><span class="w-kg">${w.kg} kg</span>${diffHtml}
      <button class="w-del" title="刪除">✕</button></span>`;
    row.querySelector(".w-del").addEventListener("click", () => {
      if (!confirm(`刪除 ${w.date} 的體重紀錄？`)) return;
      state.weights = state.weights.filter((x) => x.date !== w.date);
      save();
      renderWeight();
    });
    list.appendChild(row);
  });
  if (!ws.length) list.innerHTML = `<div class="muted center">尚無紀錄</div>`;
}

function buildWeightChart(ws) {
  const W = 520, H = 220, PAD = { l: 40, r: 12, t: 14, b: 24 };
  const kgs = ws.map((w) => w.kg);
  let min = Math.min(...kgs, GOAL.m1) - 1;
  let max = Math.max(...kgs) + 1;
  const x = (i) => PAD.l + (i / Math.max(1, ws.length - 1)) * (W - PAD.l - PAD.r);
  const y = (kg) => PAD.t + (1 - (kg - min) / (max - min)) * (H - PAD.t - PAD.b);

  const pts = ws.map((w, i) => `${x(i).toFixed(1)},${y(w.kg).toFixed(1)}`).join(" ");
  const dots = ws.map((w, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(w.kg).toFixed(1)}" r="3.5" fill="var(--primary)"/>`).join("");

  // y 軸刻度（4 條）
  let grid = "";
  for (let g = 0; g <= 3; g++) {
    const kg = min + ((max - min) * g) / 3;
    const yy = y(kg).toFixed(1);
    grid += `<line x1="${PAD.l}" y1="${yy}" x2="${W - PAD.r}" y2="${yy}" stroke="var(--line)" stroke-width="1"/>
      <text x="${PAD.l - 6}" y="${yy}" fill="var(--muted)" font-size="11" text-anchor="end" dominant-baseline="middle">${kg.toFixed(1)}</text>`;
  }
  // 第一階段目標線
  const gy = y(GOAL.m1).toFixed(1);
  const goalLine = `<line x1="${PAD.l}" y1="${gy}" x2="${W - PAD.r}" y2="${gy}" stroke="var(--green)" stroke-width="1.5" stroke-dasharray="6 5"/>
    <text x="${W - PAD.r}" y="${gy - 5}" fill="var(--green)" font-size="11" text-anchor="end">目標 ${GOAL.m1}</text>`;

  const x0 = fmtDateShort(ws[0].date), x1 = fmtDateShort(ws[ws.length - 1].date);
  const xLabels = `<text x="${PAD.l}" y="${H - 6}" fill="var(--muted)" font-size="11">${x0}</text>
    <text x="${W - PAD.r}" y="${H - 6}" fill="var(--muted)" font-size="11" text-anchor="end">${x1}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${grid}${goalLine}
    <polyline points="${pts}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}${xLabels}</svg>`;
}

$("btnSaveWeight").addEventListener("click", () => {
  const kg = parseFloat($("weightInput").value);
  const date = $("weightDate").value || todayStr();
  if (isNaN(kg) || kg < 30 || kg > 200) { toast("請輸入合理的體重數字"); return; }
  const existing = state.weights.find((w) => w.date === date);
  if (existing) existing.kg = kg;
  else state.weights.push({ date, kg });
  save();
  $("weightInput").value = "";
  renderWeight();
  toast("✅ 體重已記錄");
});

/* ================= 飲食打卡 ================= */
function dietOf(date) {
  if (!state.diet[date]) state.diet[date] = { sugar: false, late: false, steps: null };
  return state.diet[date];
}

function renderDiet() {
  const d = dietOf(todayStr());
  $("ruleSugar").classList.toggle("on", !!d.sugar);
  $("ruleLate").classList.toggle("on", !!d.late);
  $("stepsInput").value = d.steps ?? "";

  // 最近 7 天
  const week = $("dietWeek");
  week.innerHTML = "";
  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const ds = todayStr(dt);
    const rec = state.diet[ds];
    week.innerHTML += `
      <div class="dw-day">
        <div class="dw-label">${i === 0 ? "今" : dayNames[dt.getDay()]}</div>
        <div class="dw-dots">
          <div class="dw-dot ${rec?.sugar ? "on" : ""}" title="飲料"></div>
          <div class="dw-dot ${rec?.late ? "on" : ""}" title="宵夜"></div>
        </div>
      </div>`;
  }

  // 連續達成天數（兩規則都達成；今天未完成不斷streak）
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const rec = state.diet[todayStr(dt)];
    const ok = rec && rec.sugar && rec.late;
    if (ok) streak++;
    else if (i === 0) continue;
    else break;
  }
  $("dietStreak").textContent = streak > 0
    ? `🔥 兩規則連續達成 ${streak} 天`
    : "上排=沒喝含糖飲料、下排=睡前3小時沒進食";
}

$("ruleSugar").addEventListener("click", () => {
  const d = dietOf(todayStr());
  d.sugar = !d.sugar;
  save();
  renderDiet();
});
$("ruleLate").addEventListener("click", () => {
  const d = dietOf(todayStr());
  d.late = !d.late;
  save();
  renderDiet();
});
$("btnSaveSteps").addEventListener("click", () => {
  const v = parseInt($("stepsInput").value, 10);
  if (isNaN(v) || v < 0) { toast("請輸入步數"); return; }
  dietOf(todayStr()).steps = v;
  save();
  renderDiet();
  toast(v >= 7000 ? "🎯 步數達標！" : "✅ 已記錄");
});

/* ================= 歷史 ================= */
function renderHistory() {
  // 本週統計（週一起算）
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const mondayStr = todayStr(monday);
  const weekWos = state.workouts.filter((w) => w.date >= mondayStr);
  const weekSets = weekWos.reduce((a, w) => a + w.entries.reduce((b, e) => b + e.sets.length, 0), 0);
  const weekVol = weekWos.reduce((a, w) =>
    a + w.entries.reduce((b, e) => b + e.sets.reduce((c, s) => c + (s.kg || 0) * (s.reps || 0), 0), 0), 0);
  const dietOkDays = Object.entries(state.diet)
    .filter(([d, r]) => d >= mondayStr && r.sugar && r.late).length;

  $("weekStats").innerHTML = `
    <div class="stat"><b>${weekWos.length}</b><span>訓練次數</span></div>
    <div class="stat"><b>${weekSets}</b><span>總組數</span></div>
    <div class="stat"><b>${Math.round(weekVol)}</b><span>總量 kg</span></div>
    <div class="stat"><b>${dietOkDays}</b><span>飲食達成天</span></div>`;

  const list = $("historyList");
  list.innerHTML = "";
  if (!state.workouts.length) {
    list.innerHTML = `<div class="card muted center">還沒有訓練紀錄，去「訓練」開始第一次吧！</div>`;
    return;
  }
  [...state.workouts].reverse().forEach((w) => {
    const sets = w.entries.reduce((a, e) => a + e.sets.length, 0);
    const dur = w.endTs ? fmtDuration(w.endTs - w.startTs) : "--";
    const item = document.createElement("div");
    item.className = "h-item";
    item.innerHTML = `
      <button class="h-head">
        <span class="h-date">${w.date}　${COURSES[w.course]?.name || w.course}</span>
        <span class="h-meta">${sets} 組・${dur}</span>
      </button>
      <div class="h-detail" hidden>
        <div class="muted" style="font-size:12px;margin-bottom:6px">點任一組可刪除（修正誤記）</div>
        ${w.entries.map((e, ei) => `
          <div class="h-ex"><b>${esc(e.name)}</b>
          ${e.sets.map((s, si) => `<button class="h-set" data-ei="${ei}" data-si="${si}">${esc(fmtSet(e.name, s))}</button>`).join("")}</div>`).join("")}
        <div class="h-actions">
          <button class="btn btn-primary h-share">📤 IG 分享卡</button>
          <button class="h-del">刪除這筆紀錄</button>
        </div>
      </div>`;
    item.querySelector(".h-head").addEventListener("click", () => {
      const d = item.querySelector(".h-detail");
      d.hidden = !d.hidden;
    });
    item.querySelector(".h-share").addEventListener("click", () => shareWorkout(w));
    item.querySelectorAll(".h-set").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ei = Number(btn.dataset.ei), si = Number(btn.dataset.si);
        const e = w.entries[ei];
        if (!confirm(`刪除 ${e.name} 的這筆：${fmtSet(e.name, e.sets[si])}？`)) return;
        e.sets.splice(si, 1);
        if (!e.sets.length) w.entries.splice(ei, 1);
        if (!w.entries.length) state.workouts = state.workouts.filter((x) => x.id !== w.id);
        save();
        renderHistory();
      });
    });
    item.querySelector(".h-del").addEventListener("click", () => {
      if (!confirm(`刪除 ${w.date} 的訓練紀錄？此動作無法復原。`)) return;
      state.workouts = state.workouts.filter((x) => x.id !== w.id);
      save();
      renderHistory();
    });
    list.appendChild(item);
  });
}

/* ================= 設定 ================= */
function renderSettings() {
  $("restSecSelect").value = String(state.settings.restSec);
  $("optSound").checked = state.settings.sound;
  $("optVibrate").checked = state.settings.vibrate;
}

$("restSecSelect").addEventListener("change", (e) => {
  state.settings.restSec = parseInt(e.target.value, 10);
  save();
});
$("optSound").addEventListener("change", (e) => { state.settings.sound = e.target.checked; save(); });
$("optVibrate").addEventListener("change", (e) => { state.settings.vibrate = e.target.checked; save(); });

$("btnExport").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `fitness-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("📦 備份已下載");
});

$("btnImport").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.workouts) || !Array.isArray(data.weights)) {
        toast("❌ 不是有效的備份檔");
        return;
      }
      if (!confirm("匯入會覆蓋目前所有資料，確定？")) return;
      state = Object.assign(defaultState(), data);
      save();
      toast("✅ 匯入完成");
      showView("train");
    } catch {
      toast("❌ 備份檔解析失敗");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

$("btnWipe").addEventListener("click", () => {
  if (!confirm("確定清除全部資料？建議先匯出備份。")) return;
  if (!confirm("最後確認：所有訓練、體重、打卡紀錄都會消失，無法復原。")) return;
  state = defaultState();
  save();
  toast("已清除");
  showView("train");
});

/* ================= IG 分享卡 ================= */
let currentShare = null;

function workoutDayNumber(w) {
  const sorted = [...state.workouts].sort((a, b) => a.date.localeCompare(b.date) || a.startTs - b.startTs);
  return sorted.findIndex((x) => x.id === w.id) + 1;
}

function bestSet(exName, sets) {
  if (cardioConfig(exName)) return sets[sets.length - 1];
  return sets.reduce((a, s) => (s.kg > a.kg || (s.kg === a.kg && s.reps > a.reps) ? s : a), sets[0]);
}

function workoutStats(w) {
  const strengthEntries = w.entries.filter((e) => !cardioConfig(e.name));
  const sets = strengthEntries.reduce((a, e) => a + e.sets.length, 0);
  const vol = strengthEntries.reduce((a, e) => a + e.sets.reduce((c, s) => c + (s.kg || 0) * (s.reps || 0), 0), 0);
  const mins = w.endTs ? Math.round((w.endTs - w.startTs) / 60000) : 0;
  return { sets, vol: Math.round(vol), mins };
}

function shareText(w) {
  const day = workoutDayNumber(w);
  const st = workoutStats(w);
  const lines = w.entries.map((e) => {
    const cardio = cardioConfig(e.name);
    if (cardio) return `🏃 ${e.name.replace(/\(分\)$/, "")} ${fmtSet(e.name, e.sets[e.sets.length - 1])}`;
    const b = bestSet(e.name, e.sets);
    return `▪ ${e.name} ${b.kg}kg×${b.reps}（${e.sets.length}組）`;
  });
  return [
    `🏋️ 健身紀錄 Day ${day}`,
    `📅 ${w.date}｜${COURSES[w.course]?.name || w.course}`,
    `⏱ ${st.mins} 分鐘｜${st.sets} 組｜總量 ${st.vol.toLocaleString()} kg`,
    `────────`,
    ...lines,
    `────────`,
    `#健身紀錄 #減脂日記 #Day${day} #健身初心者`,
  ].join("\n");
}

function makeShareCard(w) {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const day = workoutDayNumber(w);
  const st = workoutStats(w);

  // 背景
  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0d1424");
  bg.addColorStop(1, "#0a0e17");
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  let g = x.createRadialGradient(W * .85, 60, 0, W * .85, 60, 560);
  g.addColorStop(0, "rgba(124,108,246,.30)"); g.addColorStop(1, "rgba(124,108,246,0)");
  x.fillStyle = g; x.fillRect(0, 0, W, 760);
  g = x.createRadialGradient(60, 180, 0, 60, 180, 520);
  g.addColorStop(0, "rgba(91,140,255,.26)"); g.addColorStop(1, "rgba(91,140,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, W, 800);

  const font = (wgt, size) => `${wgt} ${size}px "Noto Sans TC","Segoe UI",sans-serif`;

  // 頁首
  x.fillStyle = "rgba(147,161,189,.9)";
  x.font = font(700, 30);
  x.textAlign = "left";
  x.fillText("W O R K O U T   L O G", 72, 110);
  x.fillStyle = "#eef2fa";
  x.font = font(900, 84);
  x.fillText(w.date.replaceAll("-", "."), 72, 210);
  // Day 徽章
  const badge = `DAY ${day}`;
  x.font = font(900, 40);
  const bw = x.measureText(badge).width + 56;
  const bgrad = x.createLinearGradient(W - 72 - bw, 0, W - 72, 0);
  bgrad.addColorStop(0, "#5b8cff"); bgrad.addColorStop(1, "#7c6cf6");
  x.fillStyle = bgrad;
  roundRect(x, W - 72 - bw, 140, bw, 76, 38);
  x.fill();
  x.fillStyle = "#fff";
  x.fillText(badge, W - 72 - bw + 28, 193);
  // 課表名
  x.fillStyle = "#8fb0ff";
  x.font = font(800, 46);
  x.fillText(COURSES[w.course]?.name || w.course, 72, 286);

  // 統計列
  const stats = [
    [String(st.mins), "分鐘"],
    [String(st.sets), "組數"],
    [st.vol.toLocaleString(), "總量 kg"],
  ];
  const sw = (W - 144 - 40) / 3;
  stats.forEach(([num, label], i) => {
    const sx = 72 + i * (sw + 20);
    x.fillStyle = "rgba(255,255,255,.05)";
    roundRect(x, sx, 330, sw, 150, 24);
    x.fill();
    x.strokeStyle = "rgba(255,255,255,.10)";
    x.lineWidth = 2;
    roundRect(x, sx, 330, sw, 150, 24);
    x.stroke();
    x.textAlign = "center";
    x.fillStyle = "#8fb0ff";
    x.font = font(900, 58);
    x.fillText(num, sx + sw / 2, 410);
    x.fillStyle = "rgba(147,161,189,.95)";
    x.font = font(600, 26);
    x.fillText(label, sx + sw / 2, 452);
  });

  // 動作清單
  x.textAlign = "left";
  let y = 570;
  const rows = w.entries.slice(0, 8);
  rows.forEach((e) => {
    const cardio = cardioConfig(e.name);
    x.fillStyle = "rgba(255,255,255,.045)";
    roundRect(x, 72, y - 52, W - 144, 78, 18);
    x.fill();
    x.fillStyle = cardio ? "#34d399" : "#eef2fa";
    x.font = font(800, 36);
    x.fillText((cardio ? "🏃 " : "") + e.name.replace(/\(分\)$|\(秒\)$/, ""), 96, y);
    x.textAlign = "right";
    x.fillStyle = cardio ? "#34d399" : "#8fb0ff";
    x.font = font(800, 34);
    const b = bestSet(e.name, e.sets);
    x.fillText(cardio ? fmtSet(e.name, b) : `${b.kg}kg × ${b.reps}｜${e.sets.length} 組`, W - 96, y);
    x.textAlign = "left";
    y += 92;
  });

  // 頁尾
  x.fillStyle = "rgba(147,161,189,.55)";
  x.font = font(700, 28);
  x.fillText(`#健身紀錄  #減脂日記  #Day${day}`, 72, H - 76);
  x.textAlign = "right";
  x.fillStyle = "rgba(91,140,255,.65)";
  x.font = font(900, 30);
  x.fillText("🏋️ 健身紀錄 App", W - 72, H - 76);

  return new Promise((resolve) => c.toBlob(resolve, "image/png"));
}

function roundRect(x, px, py, pw, ph, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + pw, py, px + pw, py + ph, r);
  x.arcTo(px + pw, py + ph, px, py + ph, r);
  x.arcTo(px, py + ph, px, py, r);
  x.arcTo(px, py, px + pw, py, r);
  x.closePath();
}

async function shareWorkout(w) {
  const blob = await makeShareCard(w);
  if (currentShare?.url) URL.revokeObjectURL(currentShare.url);
  const url = URL.createObjectURL(blob);
  currentShare = { blob, url, w };
  $("shareImg").src = url;
  $("shareOverlay").hidden = false;
}

$("btnShareNative").addEventListener("click", async () => {
  if (!currentShare) return;
  const file = new File([currentShare.blob], `workout-${currentShare.w.date}.png`, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) { /* 使用者取消分享 */ }
  } else {
    toast("此裝置不支援直接分享，改用「下載圖片」");
  }
});

$("btnShareDownload").addEventListener("click", () => {
  if (!currentShare) return;
  const a = document.createElement("a");
  a.href = currentShare.url;
  a.download = `workout-${currentShare.w.date}.png`;
  a.click();
  toast("🖼 圖片已下載");
});

$("btnShareCopy").addEventListener("click", async () => {
  if (!currentShare) return;
  try {
    await navigator.clipboard.writeText(shareText(currentShare.w));
    toast("📋 文字版已複製，可直接貼到 IG");
  } catch {
    toast("複製失敗，請改用下載圖片");
  }
});

$("btnShareClose").addEventListener("click", () => ($("shareOverlay").hidden = true));

/* ================= 啟動 ================= */
$("topbarDate").textContent = (() => {
  const d = new Date();
  const wd = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} 週${wd}`;
})();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

showView("train");
refreshPlan();
