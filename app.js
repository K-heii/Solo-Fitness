(function () {
  "use strict";

  var STORAGE_KEY = "solo-fit-profile-v1";
  var APP_VERSION = "v4.1 — hauts faits sous les trophées, indices tactiles corrigés";

  var RANKS = [
    { name: "E", min: 0, glow: "#3ab6ff", label: "Éveillé" },
    { name: "D", min: 3, glow: "#2fd7ff", label: "Novice" },
    { name: "C", min: 7, glow: "#31e0c8", label: "Confirmé" },
    { name: "B", min: 14, glow: "#8b7bff", label: "Vétéran" },
    { name: "A", min: 30, glow: "#d16bff", label: "Elite" },
    { name: "S", min: 60, glow: "#ffd76a", label: "Monarque" },
  ];

  var DEFAULT_TARGETS = { pushups: 12, squats: 12, abdos: 18, plank: 30 };
  var PRESETS = {
    tranquille: { pushups: 10, squats: 10, abdos: 10, plank: 30 },
    normal: { pushups: 20, squats: 20, abdos: 20, plank: 60 },
  };
  var THEMES = [
    { key: "blue", label: "Bleu", color: "#2fd7ff" },
    { key: "yellow", label: "Jaune", color: "#ffcc33" },
    { key: "green", label: "Vert", color: "#2ee6a8" },
    { key: "red", label: "Rouge bordeaux", color: "#d9486e" },
  ];
  var BUILTIN_POOL = [
    { id: "pushups", label: "Pompes", unit: "", icon: "dumbbell", step: 2, cap: 60, builtin: true },
    { id: "squats", label: "Squats", unit: "", icon: "activity", step: 2, cap: 60, builtin: true },
    { id: "abdos", label: "Abdos", unit: "", icon: "layers", step: 3, cap: 80, builtin: true },
    { id: "plank", label: "Gainage", unit: "s", icon: "timer", step: 5, cap: 120, builtin: true },
  ];
  var REDEMPTION_MULT = 1.5;

  var CHANGELOG_VERSION = "v4.1";
  var CHANGELOG_ITEMS = [
    "Les Hauts Faits sont déplacés juste sous les Trophées, sur la page Quête.",
    "Correction : un appui sur un \"???\" affiche maintenant un vrai indice à l'écran (l'ancien indice au survol ne fonctionnait pas sur mobile).",
  ];

  // ---------- helpers ----------
  function todayStr(d) {
    d = d || new Date();
    var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  function daysBetween(a, b) {
    var da = new Date(a + "T00:00:00"), db = new Date(b + "T00:00:00");
    return Math.round((db - da) / 86400000);
  }
  function isSunday(dateStr) {
    return new Date(dateStr + "T00:00:00").getDay() === 0;
  }
  function reevalBump(maxVal, current, isPlank) {
    if (!(maxVal > current)) return 0;
    var raw = Math.round(maxVal / 10);
    raw = Math.max(1, raw);
    var cap = isPlank ? 15 : 8;
    return Math.min(raw, cap);
  }
  function getRank(streak) {
    var r = RANKS[0];
    for (var i = 0; i < RANKS.length; i++) if (streak >= RANKS[i].min) r = RANKS[i];
    return r;
  }
  function nextRankInfo(streak) {
    var current = getRank(streak);
    var idx = RANKS.findIndex(function (r) { return r.name === current.name; });
    var next = RANKS[idx + 1];
    if (!next) return { current: current, next: null, progress: 1 };
    var span = next.min - current.min;
    var progress = Math.min(1, (streak - current.min) / span);
    return { current: current, next: next, progress: progress };
  }
  function redemptionTargetFor(exo, current) {
    return Math.min(exo.cap, Math.ceil(current * REDEMPTION_MULT));
  }
  function redemptionTargets(t, ids) {
    var out = {};
    ids.forEach(function (id) {
      var exo = getExoMeta(id);
      out[id] = redemptionTargetFor(exo, t[id]);
    });
    return out;
  }
  function getExoMeta(id) {
    var found = profile.exercisePool.filter(function (e) { return e.id === id; })[0];
    if (found) return found;
    var builtin = BUILTIN_POOL.filter(function (e) { return e.id === id; })[0];
    return builtin || { id: id, label: id, unit: "", icon: "dumbbell", step: 2, cap: 100 };
  }
  function legacyExosFromEntry(h) {
    return BUILTIN_POOL.map(function (exo) {
      return { id: exo.id, label: exo.label, unit: exo.unit, value: h[exo.id], feedback: h.feedback ? h.feedback[exo.id] : null };
    });
  }
  function syncCheckedToIds(ids) {
    ids.forEach(function (id) { if (!(id in ui.checked)) ui.checked[id] = false; });
    Object.keys(ui.checked).forEach(function (k) { if (ids.indexOf(k) === -1) delete ui.checked[k]; });
  }
  function todayExerciseIds() {
    if (profile.exercisePool.length <= 4) return profile.exercisePool.map(function (e) { return e.id; });
    var sel = profile.todaySelection;
    if (sel && sel.date === todayStr() && sel.ids && sel.ids.length === 4) return sel.ids;
    return null;
  }
  function defaultProfile() {
    return {
      pseudo: "",
      onboarded: false,
      streak: 0,
      best: 0,
      lastCompletedDate: null,
      lastWelcomeDate: null,
      lastSeenVersion: null,
      targets: Object.assign({}, DEFAULT_TARGETS),
      history: [],
      lastJokerDate: null,
      theme: "blue",
      exercisePool: BUILTIN_POOL.map(function (e) { return Object.assign({}, e); }),
      todaySelection: { date: null, ids: [] },
      fx: { enabled: true },
      totalCustomExercisesAdded: 0,
      reevalYesStreak: 0,
      appOpenDaysCount: 0,
      lastOpenCountedDate: null,
      hiddenFlags: {},
      weakPointClearedAt: null,
    };
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------- tiny icon set (inline SVG, stroke-based, 24x24) ----------
  var ICONS = {
    dumbbell: '<line x1="4" y1="12" x2="20" y2="12"/><line x1="7" y1="8.5" x2="7" y2="15.5"/><line x1="17" y1="8.5" x2="17" y2="15.5"/><line x1="3" y1="10" x2="3" y2="14"/><line x1="21" y1="10" x2="21" y2="14"/>',
    activity: '<polyline points="3,12 8,12 10,5 14,19 16,12 21,12" fill="none"/>',
    layers: '<rect x="5" y="4" width="14" height="6" rx="1.2" fill="none"/><rect x="5" y="13" width="14" height="6" rx="1.2" fill="none"/>',
    timer: '<circle cx="12" cy="13" r="8" fill="none"/><line x1="12" y1="13" x2="12" y2="9"/><line x1="9" y1="2" x2="15" y2="2"/>',
    hexagon: '<polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="none"/>',
    flame: '<path d="M12 3c2.2 3 5 4.7 5 9a5 5 0 1 1-10 0c0-1.8.9-2.9 1.8-3.8-.3 1.8.6 2.6 1.1 1.8-.6-2.7.6-4.6 2.1-7z" fill="currentColor" stroke="none"/>',
    gear: '<circle cx="12" cy="12" r="7.2" fill="none"/><circle cx="12" cy="12" r="2.4" fill="none"/><line x1="19.2" y1="12" x2="22.2" y2="12"/><line x1="17.1" y1="17.1" x2="19.2" y2="19.2"/><line x1="12" y1="19.2" x2="12" y2="22.2"/><line x1="6.9" y1="17.1" x2="4.8" y2="19.2"/><line x1="4.8" y1="12" x2="1.8" y2="12"/><line x1="6.9" y1="6.9" x2="4.8" y2="4.8"/><line x1="12" y1="4.8" x2="12" y2="1.8"/><line x1="17.1" y1="6.9" x2="19.2" y2="4.8"/>',
    x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    checkCircle: '<circle cx="12" cy="12" r="9" fill="none"/><polyline points="8,12.5 11,15.5 16,9" fill="none"/>',
    circle: '<circle cx="12" cy="12" r="9" fill="none"/>',
    zap: '<polygon points="13,2 4,14 11,14 9,22 20,10 13,10" fill="currentColor" stroke="none"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3" fill="none"/><path d="M3 16h15a3 3 0 1 1-3 3" fill="none"/>',
    sword: '<line x1="5" y1="19" x2="16" y2="8"/><polyline points="14,6 18,4 20,6 16,10" fill="none"/><line x1="4" y1="16" x2="7" y2="19"/>',
    scroll: '<rect x="5" y="4" width="14" height="16" rx="2" fill="none"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/>',
    trendingUp: '<polyline points="3,17 9,11 13,15 21,6" fill="none"/><polyline points="15,6 21,6 21,12" fill="none"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/><path d="M16.5 8.5a5 5 0 0 1 0 7" fill="none"/><path d="M19.3 6a8 8 0 0 1 0 12" fill="none"/>',
    volumeOff: '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/><line x1="16" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="16" y2="15"/>',
    download: '<path d="M12 3v12" fill="none"/><polyline points="7,10 12,15 17,10" fill="none"/><path d="M4 19h16" fill="none"/>',
    upload: '<path d="M12 15V3" fill="none"/><polyline points="7,8 12,3 17,8" fill="none"/><path d="M4 19h16" fill="none"/>',
    alert: '<polygon points="12,3 22,20 2,20" fill="none"/><line x1="12" y1="9" x2="12" y2="14"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="none"/>',
    download2: '<rect x="3" y="16" width="18" height="4" rx="1" fill="none"/><path d="M12 3v10" fill="none"/><polyline points="8,10 12,14 16,10" fill="none"/>',
    arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,5 5,12 12,19" fill="none"/>',
    stopwatch: '<circle cx="12" cy="13" r="8" fill="none"/><line x1="12" y1="13" x2="15.5" y2="10" stroke-linecap="round"/><line x1="12" y1="5" x2="12" y2="3"/><line x1="9" y1="3" x2="15" y2="3"/>',
  };
  function icon(name, size, opts) {
    opts = opts || {};
    var color = opts.color || "currentColor";
    size = size || 18;
    return (
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="' + color +
      '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">' +
      (ICONS[name] || "") +
      "</svg>"
    );
  }

  // ---------- state ----------
  var profile = loadProfile();
  var ui = {
    view: "quest",
    checked: {},
    showFeedback: false,
    feedbackChoice: {},
    reevalAnswered: { date: null, answer: null },
    reevalValues: {},
    reevalError: false,
    redemptionAck: false,
    justBroken: false,
    onboardStep: 1,
    onboardMode: "choose",
    onboardName: "",
    onboardCustom: {},
    onboardCustomError: false,
    selectionChoice: {},
    selectionChoiceDate: null,
    newExoName: "",
    newExoUnit: "reps",
    newExoError: false,
    raidChecked: {},
    raidCheckedForId: null,
    weakPointChecked: false,
    weakPointCheckedFor: null,
    hintText: null,
    timerExoId: null,
    timerTarget: 0,
    timerRemaining: 0,
    timerRunning: false,
    rankClickTimes: [],
    rankUpFlash: null,
    error: false,
    installAvailable: false,
  };

  function loadProfile() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var loaded = raw ? JSON.parse(raw) : defaultProfile();
      var def = defaultProfile();
      var merged = Object.assign({}, def, loaded, {
        targets: Object.assign({}, DEFAULT_TARGETS, loaded.targets),
        fx: Object.assign({}, def.fx, loaded.fx),
        exercisePool: loaded.exercisePool && loaded.exercisePool.length >= 4 ? loaded.exercisePool : def.exercisePool,
        todaySelection: Object.assign({}, def.todaySelection, loaded.todaySelection),
        hiddenFlags: Object.assign({}, def.hiddenFlags, loaded.hiddenFlags),
      });
      // migration silencieuse : un profil qui a déjà de la donnée (créé avant l'onboarding)
      // ne doit jamais repasser par le calibrage initial, au risque d'écraser ses objectifs actuels.
      var hasExistingProgress = (merged.history && merged.history.length > 0) || merged.streak > 0 || !!merged.lastCompletedDate;
      if (!merged.onboarded && hasExistingProgress) {
        merged.onboarded = true;
        if (!merged.pseudo) merged.pseudo = "Chasseur";
        if (!merged.lastWelcomeDate) merged.lastWelcomeDate = todayStr();
      }
      return merged;
    } catch (e) {
      return defaultProfile();
    }
  }
  function saveProfile(next) {
    profile = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      ui.error = false;
    } catch (e) {
      ui.error = true;
    }
    applyTheme();
    updateAppBadge();
    render();
  }
  function updateAppBadge() {
    if (!("setAppBadge" in navigator)) return;
    try {
      var done = profile.lastCompletedDate === todayStr();
      if (done) navigator.clearAppBadge();
      else navigator.setAppBadge(1);
    } catch (e) { /* ignore */ }
  }
  function applyTheme() {
    var t = profile.theme && profile.theme !== "blue" ? profile.theme : "";
    if (t) document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  function setTheme(name) {
    saveProfile(Object.assign({}, profile, { theme: name }));
  }

  // ---------- pool d'exercices ----------
  function setNewExoName(v) {
    ui.newExoName = v;
  }
  function setNewExoUnit(v) {
    ui.newExoUnit = v;
    render();
  }
  function addExercise() {
    var nameInput = document.getElementById("slf-newexo-name");
    var startInput = document.getElementById("slf-newexo-start");
    var name = nameInput ? nameInput.value.trim().slice(0, 24) : "";
    var start = startInput ? parseFloat(startInput.value) : NaN;
    if (!name || isNaN(start) || start <= 0) {
      ui.newExoError = true;
      render();
      return;
    }
    ui.newExoError = false;
    var isSeconds = ui.newExoUnit === "seconds";
    var id = "custom_" + Date.now();
    var exo = {
      id: id,
      label: name,
      unit: isSeconds ? "s" : "",
      icon: isSeconds ? "timer" : "dumbbell",
      step: isSeconds ? 5 : 2,
      cap: isSeconds ? 180 : 100,
      builtin: false,
    };
    var newTargets = Object.assign({}, profile.targets);
    newTargets[id] = Math.round(start);
    ui.newExoName = "";
    ui.newExoUnit = "reps";
    saveProfile(Object.assign({}, profile, {
      exercisePool: profile.exercisePool.concat([exo]),
      targets: newTargets,
      totalCustomExercisesAdded: profile.totalCustomExercisesAdded + 1,
    }));
  }
  function removeExercise(id) {
    var exo = getExoMeta(id);
    if (exo.builtin) return;
    if (!window.confirm("Retirer cet exercice de ton pool ? Ta progression passée reste dans l'historique.")) return;
    var newPool = profile.exercisePool.filter(function (e) { return e.id !== id; });
    var next = Object.assign({}, profile, { exercisePool: newPool });
    if (profile.todaySelection && profile.todaySelection.ids && profile.todaySelection.ids.indexOf(id) !== -1) {
      next.todaySelection = { date: null, ids: [] };
    }
    saveProfile(next);
  }

  // ---------- derived ----------
  function getMode() {
    var today = todayStr();
    if (profile.lastCompletedDate === today) return "done";
    var reevalToday = ui.reevalAnswered.date === today ? ui.reevalAnswered.answer : null;
    if (isSunday(today) && reevalToday === null) return "reeval-prompt";
    if (reevalToday === "yes") return "reeval";
    if (profile.lastCompletedDate) {
      var diff = daysBetween(profile.lastCompletedDate, today);
      if (diff === 2) return "redemption";
    }
    return "normal";
  }
  function shouldShowWelcome() {
    return profile.onboarded && profile.lastWelcomeDate !== todayStr();
  }
  // Si la quête de rédemption elle-même n'a pas été faite à temps (2 jours pleins ratés
  // après la dernière séance), la série est définitivement perdue : on la remet à 0.
  function checkAndApplyStreakBreak() {
    var today = todayStr();
    if (!profile.lastCompletedDate) return false;
    if (profile.streak <= 0) return false;
    var diff = daysBetween(profile.lastCompletedDate, today);
    if (diff >= 3) {
      profile = Object.assign({}, profile, { streak: 0 });
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch (e) { /* ignore */ }
      return true;
    }
    return false;
  }
  function getActiveOverlay() {
    if (!profile.onboarded) return "onboarding";
    if (profile.lastSeenVersion !== CHANGELOG_VERSION) return "changelog";
    if (ui.justBroken) return "streak-broken";
    if (shouldShowWelcome()) return "welcome";
    if (getMode() === "redemption" && !ui.redemptionAck) return "redemption-penalty";
    if (ui.timerExoId) return "timer";
    if (ui.showFeedback) return "feedback";
    return null;
  }
  function pseudo() {
    return profile.pseudo || "Chasseur";
  }
  function ackChangelog() {
    saveProfile(Object.assign({}, profile, { lastSeenVersion: CHANGELOG_VERSION }));
  }

  // ---------- actions : onboarding ----------
  function onboardNameNext() {
    ui.onboardStep = 2;
    render();
  }
  function onboardNameSkip() {
    ui.onboardName = "";
    ui.onboardStep = 2;
    render();
  }
  function setOnboardName(v) {
    ui.onboardName = v;
  }
  function chooseDifficulty(key) {
    if (key === "custom") {
      ui.onboardMode = "custom";
      render();
      return;
    }
    finalizeOnboarding(PRESETS[key]);
  }
  function setOnboardCustom(key, raw) {
    var val = parseFloat(raw);
    ui.onboardCustom[key] = isNaN(val) ? null : val;
  }
  function finishCustomOnboarding() {
    var keys = BUILTIN_POOL.map(function (e) { return e.id; });
    var v = ui.onboardCustom;
    var complete = keys.every(function (k) { return typeof v[k] === "number" && v[k] > 0; });
    if (!complete) {
      ui.onboardCustomError = true;
      render();
      return;
    }
    finalizeOnboarding(v);
  }
  function finalizeOnboarding(targets) {
    var name = ui.onboardName && ui.onboardName.trim() ? ui.onboardName.trim().slice(0, 20) : "Chasseur";
    var today = todayStr();
    var next = Object.assign({}, profile, {
      pseudo: name,
      onboarded: true,
      targets: Object.assign({}, targets),
      lastWelcomeDate: today,
      lastSeenVersion: CHANGELOG_VERSION,
    });
    ui.onboardStep = 1;
    ui.onboardMode = "choose";
    ui.onboardName = "";
    ui.onboardCustom = {};
    ui.onboardCustomError = false;
    saveProfile(next);
  }
  function dismissWelcome() {
    saveProfile(Object.assign({}, profile, { lastWelcomeDate: todayStr() }));
  }
  function ackRedemption() {
    ui.redemptionAck = true;
    render();
  }
  function ackBroken() {
    ui.justBroken = false;
    render();
  }
  function savePseudo(raw) {
    var name = raw && raw.trim() ? raw.trim().slice(0, 20) : "Chasseur";
    saveProfile(Object.assign({}, profile, { pseudo: name }));
  }

  // ---------- actions : quête ----------
  function toggleSelectionExo(id) {
    var count = Object.keys(ui.selectionChoice).filter(function (k) { return ui.selectionChoice[k]; }).length;
    if (ui.selectionChoice[id]) ui.selectionChoice[id] = false;
    else if (count < 4) ui.selectionChoice[id] = true;
    render();
  }
  function submitSelection() {
    var ids = Object.keys(ui.selectionChoice).filter(function (k) { return ui.selectionChoice[k]; });
    if (ids.length !== 4) return;
    ui.selectionChoice = {};
    saveProfile(Object.assign({}, profile, { todaySelection: { date: todayStr(), ids: ids } }));
  }

  function toggleTask(key) {
    var mode = getMode();
    if (mode !== "normal" && mode !== "redemption") return;
    ui.checked[key] = !ui.checked[key];
    if (ui.checked[key]) fxCheck();
    render();
  }
  function openFeedback() {
    var ids = Object.keys(ui.checked);
    var vals = ids.map(function (k) { return ui.checked[k]; });
    if (vals.indexOf(false) !== -1) return;
    var fc = {};
    ids.forEach(function (id) { fc[id] = null; });
    ui.feedbackChoice = fc;
    ui.showFeedback = true;
    render();
  }
  function setFeedback(key, value) {
    ui.feedbackChoice[key] = value;
    render();
  }
  function finishSession() {
    var keys = Object.keys(ui.feedbackChoice);
    var complete = keys.every(function (k) { return ui.feedbackChoice[k] !== null; });
    if (!complete) return;

    var mode = getMode();
    var today = todayStr();
    var targets = mode === "redemption" ? redemptionTargets(profile.targets, keys) : profile.targets;
    var wasRank = getRank(profile.streak).name;
    var newStreak = profile.streak + 1; // la rédemption conserve la streak
    var newBest = Math.max(profile.best, newStreak);

    var newTargets = Object.assign({}, profile.targets);
    var exercises = keys.map(function (k) {
      var exo = getExoMeta(k);
      var easy = ui.feedbackChoice[k] === "facile";
      newTargets[k] = easy ? Math.min(exo.cap, profile.targets[k] + exo.step) : profile.targets[k];
      return { id: k, label: exo.label, unit: exo.unit, value: targets[k], feedback: ui.feedbackChoice[k] };
    });

    var entry = {
      date: today,
      mode: mode,
      exercises: exercises,
      rank: getRank(newStreak).name,
      completedAt: new Date().toISOString(),
    };
    var next = Object.assign({}, profile, {
      streak: newStreak,
      best: newBest,
      lastCompletedDate: today,
      targets: newTargets,
      history: [entry].concat(profile.history),
    });
    ui.showFeedback = false;
    ui.checked = {};
    ui.feedbackChoice = {};
    ui.redemptionAck = false;
    var newRank = getRank(newStreak).name;
    saveProfile(next);
    fxValidate();
    flashRankUp(wasRank, newRank);
  }

  function answerReeval(value) {
    ui.reevalAnswered = { date: todayStr(), answer: value };
    if (value === "yes") {
      ui.reevalValues = {};
      ui.reevalError = false;
      saveProfile(Object.assign({}, profile, { reevalYesStreak: profile.reevalYesStreak + 1 }));
    } else {
      saveProfile(Object.assign({}, profile, { reevalYesStreak: 0 }));
    }
  }
  function setReevalValue(key, raw) {
    var val = parseFloat(raw);
    ui.reevalValues[key] = isNaN(val) ? null : val;
  }
  function submitReeval() {
    var keys = profile.exercisePool.map(function (e) { return e.id; });
    var v = ui.reevalValues;
    var complete = keys.every(function (k) { return typeof v[k] === "number" && v[k] > 0; });
    if (!complete) {
      ui.reevalError = true;
      render();
      return;
    }
    ui.reevalError = false;

    var today = todayStr();
    var wasRank = getRank(profile.streak).name;
    var newStreak = profile.streak + 1;
    var newBest = Math.max(profile.best, newStreak);

    var newTargets = Object.assign({}, profile.targets);
    var exercises = keys.map(function (k) {
      var exo = getExoMeta(k);
      var isTimeBased = exo.unit === "s";
      var bump = reevalBump(v[k], profile.targets[k], isTimeBased);
      newTargets[k] = Math.min(exo.cap, profile.targets[k] + bump);
      return { id: k, label: exo.label, unit: exo.unit, value: v[k], feedback: null };
    });

    var entry = {
      date: today,
      mode: "reeval",
      exercises: exercises,
      rank: getRank(newStreak).name,
    };
    var next = Object.assign({}, profile, {
      streak: newStreak,
      best: newBest,
      lastCompletedDate: today,
      targets: newTargets,
      history: [entry].concat(profile.history),
    });
    ui.reevalValues = {};
    var newRank = getRank(newStreak).name;
    saveProfile(next);
    fxValidate();
    flashRankUp(wasRank, newRank);
  }
  function flashRankUp(wasRank, newRank) {
    if (newRank === wasRank) return;
    fxRankUp();
    ui.rankUpFlash = newRank;
    render();
    setTimeout(function () {
      ui.rankUpFlash = null;
      render();
    }, 3200);
  }

  // ---------- joker : jour de repos ----------
  function jokerDaysLeft() {
    if (!profile.lastJokerDate) return 0;
    var diff = daysBetween(profile.lastJokerDate, todayStr());
    return Math.max(0, 7 - diff);
  }
  function jokerAvailable() {
    return jokerDaysLeft() === 0;
  }
  function useJoker() {
    if (!jokerAvailable()) return;
    if (!window.confirm(pseudo() + ", utiliser ton joker aujourd'hui compte comme une séance réussie sans exercice. Tu ne pourras en reprendre un que dans 7 jours. Confirmer ?")) return;
    var today = todayStr();
    var wasRank = getRank(profile.streak).name;
    var newStreak = profile.streak + 1;
    var newBest = Math.max(profile.best, newStreak);
    var entry = {
      date: today,
      mode: "joker",
      pushups: 0,
      squats: 0,
      abdos: 0,
      plank: 0,
      feedback: null,
      rank: getRank(newStreak).name,
    };
    var next = Object.assign({}, profile, {
      streak: newStreak,
      best: newBest,
      lastCompletedDate: today,
      lastJokerDate: today,
      history: [entry].concat(profile.history),
    });
    var newRank = getRank(newStreak).name;
    saveProfile(next);
    fxValidate();
    flashRankUp(wasRank, newRank);
  }

  // ---------- installation PWA ----------
  var deferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    ui.installAvailable = true;
    render();
  });
  window.addEventListener("appinstalled", function () {
    deferredInstallPrompt = null;
    ui.installAvailable = false;
    render();
  });
  function installApp() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(function () {
      deferredInstallPrompt = null;
      ui.installAvailable = false;
      render();
    });
  }

  // ---------- son & vibration ----------
  var audioCtx = null;
  function getAudioCtx() {
    if (!("AudioContext" in window || "webkitAudioContext" in window)) return null;
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }
  function playTones(freqs, durations, waveType) {
    if (!profile.fx || !profile.fx.enabled) return;
    var ctx = getAudioCtx();
    if (!ctx) return;
    var t = ctx.currentTime;
    freqs.forEach(function (f, i) {
      var d = durations[i] || durations[0] || 0.1;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = waveType || "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + d + 0.02);
      t += d * 0.85;
    });
  }
  function vibrate(pattern) {
    if (!profile.fx || !profile.fx.enabled) return;
    if ("vibrate" in navigator) {
      try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    }
  }
  function fxCheck() {
    vibrate(12);
    playTones([720], [0.05], "sine");
  }
  function fxValidate() {
    vibrate([15, 40, 15]);
    playTones([520, 780], [0.09, 0.16], "sine");
  }
  function fxRankUp() {
    vibrate([20, 60, 20, 60, 40]);
    playTones([440, 660, 880], [0.12, 0.12, 0.24], "triangle");
  }
  function toggleFx() {
    saveProfile(Object.assign({}, profile, { fx: { enabled: !profile.fx.enabled } }));
  }
  function handleRankBadgeClick() {
    if (profile.hiddenFlags && profile.hiddenFlags.easterEgg) return;
    var now = Date.now();
    ui.rankClickTimes = ui.rankClickTimes.filter(function (t) { return now - t < 5000; });
    ui.rankClickTimes.push(now);
    if (ui.rankClickTimes.length >= 10) {
      ui.rankClickTimes = [];
      saveProfile(Object.assign({}, profile, { hiddenFlags: Object.assign({}, profile.hiddenFlags, { easterEgg: true }) }));
    }
  }

  // ---------- export / import ----------
  function exportData() {
    var blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "solo-fitness-" + todayStr() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function handleImportFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var data;
      try {
        data = JSON.parse(ev.target.result);
      } catch (e) {
        alert("Fichier invalide ou corrompu.");
        return;
      }
      if (!data || typeof data.streak !== "number") {
        alert("Ce fichier ne ressemble pas à une sauvegarde valide.");
        return;
      }
      if (!window.confirm("Importer ce fichier remplacera ta progression actuelle sur cet appareil. Continuer ?")) return;
      var def = defaultProfile();
      var merged = Object.assign({}, def, data, {
        targets: Object.assign({}, DEFAULT_TARGETS, data.targets),
        fx: Object.assign({}, def.fx, data.fx),
        exercisePool: data.exercisePool && data.exercisePool.length >= 4 ? data.exercisePool : def.exercisePool,
        hiddenFlags: Object.assign({}, def.hiddenFlags, data.hiddenFlags),
        todaySelection: Object.assign({}, def.todaySelection, data.todaySelection),
      });
      ui.view = "quest";
      saveProfile(merged);
      alert("Import réussi. Bon retour, " + (merged.pseudo || "Chasseur") + ".");
    };
    reader.readAsText(file);
  }
  function resetApp() {
    if (!window.confirm(pseudo() + ", ceci va effacer définitivement toute ta progression (streak, historique, objectifs). Cette action est irréversible. Continuer ?")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    profile = defaultProfile();
    ui.view = "quest";
    ui.checked = {};
    ui.showFeedback = false;
    ui.feedbackChoice = {};
    ui.reevalAnswered = { date: null, answer: null };
    ui.reevalValues = {};
    ui.reevalError = false;
    ui.redemptionAck = false;
    ui.justBroken = false;
    ui.onboardStep = 1;
    ui.onboardMode = "choose";
    ui.onboardName = "";
    ui.onboardCustom = {};
    ui.onboardCustomError = false;
    ui.selectionChoice = {};
    ui.selectionChoiceDate = null;
    ui.newExoName = "";
    ui.newExoUnit = "reps";
    ui.newExoError = false;
    ui.rankUpFlash = null;
    ui.error = false;
    applyTheme();
    render();
  }

  // ---------- templates : onboarding ----------
  function onboardingTpl() {
    if (ui.onboardStep === 1) {
      return (
        '<div class="slf-overlay"><div class="slf-modal" data-stop="1">' +
          '<p class="slf-mono slf-eyebrow">◈ NOUVEAU JOUEUR DÉTECTÉ ◈</p>' +
          '<h2 class="slf-modaltitle">Le Système t\'a repéré, inconnu.</h2>' +
          '<p class="slf-dim" style="margin-bottom:14px">Avant de commencer ton ascension, décline ton nom.</p>' +
          '<input type="text" maxlength="20" class="slf-textinput" placeholder="Ton pseudo de chasseur" data-action="set-onboard-name" value="' + esc(ui.onboardName || "") + '" />' +
          '<button class="slf-cta" style="margin-top:14px" data-action="onboard-name-next">Confirmer l\'Éveil</button>' +
          '<button class="slf-togglebtn" style="margin-top:8px" data-action="onboard-name-skip">Passer</button>' +
        "</div></div>"
      );
    }
    var cards = [
      { key: "tranquille", title: "Tranquille", desc: "10 / 10 / 10 reps · 30s de gainage" },
      { key: "normal", title: "Normal", desc: "20 / 20 / 20 reps · 60s de gainage" },
      { key: "custom", title: "Personnalisé", desc: "Choisis toi-même tes valeurs de départ" },
    ].map(function (c) {
      return (
        '<button class="slf-diffcard' + (ui.onboardMode === "custom" && c.key === "custom" ? " active" : "") + '" data-action="onboard-difficulty" data-value="' + c.key + '">' +
          '<p class="slf-fbtitle">' + c.title + "</p><p class=\"slf-fbsub\">" + c.desc + "</p>" +
        "</button>"
      );
    }).join("");

    var customForm = "";
    if (ui.onboardMode === "custom") {
      var rows = BUILTIN_POOL.map(function (exo) { return numberRowTpl(exo, "onboard-custom-set", ui.onboardCustom); }).join("");
      customForm =
        '<div style="margin-top:12px">' +
          rows +
          (ui.onboardCustomError ? '<p class="slf-settingsnote danger">Renseigne un nombre supérieur à 0 pour chaque exercice.</p>' : "") +
          '<button class="slf-cta" style="margin-top:6px" data-action="onboard-finish-custom">Valider ces valeurs</button>' +
        "</div>";
    }

    return (
      '<div class="slf-overlay"><div class="slf-modal" data-stop="1">' +
        '<p class="slf-mono slf-eyebrow">◈ CALIBRAGE INITIAL ◈</p>' +
        '<h2 class="slf-modaltitle">Choisis ton niveau d\'entrée, Chasseur.</h2>' +
        '<p class="slf-dim" style="margin-bottom:14px">Le Système évalue ton point de départ.</p>' +
        cards +
        customForm +
      "</div></div>"
    );
  }

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function pickVariant(arr, seed) {
    return arr[hashStr(seed) % arr.length];
  }

  // ---------- Gate Raid ----------
  function gateRaidSchedule(year, month) {
    var lastDay = new Date(year, month + 1, 0).getDate();
    var day1 = 1 + (hashStr("gateraid1-" + year + "-" + month) % 15);
    var day2 = 16 + (hashStr("gateraid2-" + year + "-" + month) % (lastDay - 15));
    return { day1: day1, day2: day2 };
  }
  function getActiveGateRaid() {
    var now = Date.now();
    var d = new Date();
    var year = d.getFullYear(), month = d.getMonth();
    for (var offset = -1; offset <= 1; offset++) {
      var m = month + offset, y = year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      var sched = gateRaidSchedule(y, m);
      var days = [sched.day1, sched.day2];
      for (var i = 0; i < days.length; i++) {
        var start = new Date(y, m, days[i], 0, 0, 0).getTime();
        var end = new Date(y, m, days[i] + 2, 0, 0, 0).getTime();
        if (now >= start && now < end) {
          var raidId = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(days[i]).padStart(2, "0");
          return { id: raidId, start: start, end: end };
        }
      }
    }
    return null;
  }
  function gateRaidChallenge() {
    var mult = 4;
    return profile.exercisePool.map(function (exo) {
      return { id: exo.id, label: exo.label, unit: exo.unit, icon: exo.icon, target: Math.max(1, Math.round(profile.targets[exo.id] * mult)) };
    });
  }
  function formatCountdown(ms) {
    if (ms <= 0) return "00:00:00";
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    function pad(n) { return String(n).padStart(2, "0"); }
    return pad(h) + ":" + pad(m) + ":" + pad(s);
  }
  function toggleRaidExo(id) {
    ui.raidChecked[id] = !ui.raidChecked[id];
    fxCheck();
    render();
  }
  function submitRaid() {
    var raid = getActiveGateRaid();
    if (!raid) return;
    var ids = Object.keys(ui.raidChecked);
    var allChecked = ids.every(function (k) { return ui.raidChecked[k]; });
    if (!allChecked) return;
    var challenge = gateRaidChallenge();
    var entry = {
      date: todayStr(),
      mode: "gateraid",
      raidId: raid.id,
      exercises: challenge.map(function (c) { return { id: c.id, label: c.label, unit: c.unit, value: c.target, feedback: null }; }),
      rank: getRank(profile.streak).name,
    };
    var next = Object.assign({}, profile, { history: [entry].concat(profile.history) });
    ui.raidChecked = {};
    ui.raidCheckedForId = null;
    saveProfile(next);
    fxValidate();
  }

  // ---------- système d'élimination des points faibles ----------
  function detectWeakPoint() {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 21);
    var cutoffStr = todayStr(cutoff);
    var tally = {};
    profile.history.forEach(function (h) {
      if (h.date < cutoffStr) return;
      if (h.mode !== "normal" && h.mode !== "redemption") return;
      if (!h.exercises) return;
      h.exercises.forEach(function (e) {
        if (!tally[e.id]) tally[e.id] = { essouffle: 0, total: 0 };
        tally[e.id].total++;
        if (e.feedback === "essouffle") tally[e.id].essouffle++;
      });
    });
    var worst = null;
    Object.keys(tally).forEach(function (id) {
      var t = tally[id];
      if (t.total >= 5 && t.essouffle / t.total >= 0.7) {
        var ratio = t.essouffle / t.total;
        if (!worst || ratio > worst.ratio) worst = { id: id, ratio: ratio };
      }
    });
    return worst;
  }
  function weakPointAvailable() {
    var w = detectWeakPoint();
    if (!w) return null;
    if (profile.weakPointClearedAt && daysBetween(profile.weakPointClearedAt, todayStr()) < 14) return null;
    if (!profile.exercisePool.some(function (e) { return e.id === w.id; })) return null;
    return w;
  }
  function toggleWeakPoint() {
    ui.weakPointChecked = !ui.weakPointChecked;
    fxCheck();
    render();
  }
  function submitWeakPoint() {
    var w = weakPointAvailable();
    if (!w || !ui.weakPointChecked) return;
    var exo = getExoMeta(w.id);
    var target = Math.max(1, Math.round(profile.targets[w.id] * 1.5));
    var entry = {
      date: todayStr(),
      mode: "weakpoint",
      exercises: [{ id: w.id, label: exo.label, unit: exo.unit, value: target, feedback: null }],
      rank: getRank(profile.streak).name,
    };
    var next = Object.assign({}, profile, {
      history: [entry].concat(profile.history),
      weakPointClearedAt: todayStr(),
    });
    ui.weakPointChecked = false;
    ui.weakPointCheckedFor = null;
    saveProfile(next);
    fxValidate();
  }

  setInterval(function () {
    var el = document.getElementById("slf-raid-countdown");
    if (!el) return;
    var raid = getActiveGateRaid();
    if (!raid || raid.end - Date.now() <= 0) { render(); return; }
    el.textContent = formatCountdown(raid.end - Date.now());
  }, 1000);

  // ---------- chrono d'exercice (gainage & Cie) ----------
  function formatTimer(s) {
    s = Math.max(0, Math.round(s));
    var m = Math.floor(s / 60), sec = s % 60;
    return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  }
  function openTimer(exoId) {
    var mode = getMode();
    var ids = todayExerciseIds();
    var targets = mode === "redemption" && ids ? redemptionTargets(profile.targets, ids) : profile.targets;
    ui.timerExoId = exoId;
    ui.timerTarget = targets[exoId] || profile.targets[exoId];
    ui.timerRemaining = ui.timerTarget;
    ui.timerRunning = false;
    render();
  }
  function startTimer() {
    ui.timerRunning = true;
    render();
  }
  function pauseTimer() {
    ui.timerRunning = false;
    render();
  }
  function resetTimer() {
    ui.timerRemaining = ui.timerTarget;
    ui.timerRunning = false;
    render();
  }
  function closeTimer() {
    ui.timerExoId = null;
    ui.timerRunning = false;
    render();
  }
  setInterval(function () {
    if (!ui.timerRunning || !ui.timerExoId) return;
    ui.timerRemaining--;
    var el = document.getElementById("slf-timer-display");
    if (el) el.textContent = formatTimer(ui.timerRemaining);
    if (ui.timerRemaining <= 0) {
      ui.timerRunning = false;
      var id = ui.timerExoId;
      ui.timerExoId = null;
      ui.checked[id] = true;
      fxValidate();
      render();
    }
  }, 1000);
  function messageModalTpl(variant, actionAttr, danger) {
    return (
      '<div class="slf-overlay"><div class="slf-modal' + (danger ? " slf-modal-danger" : "") + '" data-stop="1">' +
        '<p class="slf-mono slf-eyebrow"' + (danger ? ' style="color:var(--danger)"' : "") + '>' + (danger ? icon("alert", 13, { color: "var(--danger)" }) + " " : "") + variant.eyebrow + "</p>" +
        '<h2 class="slf-modaltitle">' + variant.title.replace("{p}", esc(pseudo())) + "</h2>" +
        '<p class="slf-dim" style="margin-bottom:16px">' + variant.body.replace("{p}", esc(pseudo())) + "</p>" +
        '<button class="slf-cta" data-action="' + actionAttr + '">' + variant.cta + "</button>" +
      "</div></div>"
    );
  }

  var WELCOME_VARIANTS = [
    { eyebrow: "◈ CONNEXION ÉTABLIE ◈", title: "Bon retour, {p}.", body: "Le Système t'attendait. Prêt pour les quêtes du jour ?", cta: "Entrer" },
    { eyebrow: "◈ SYSTÈME ACTIF ◈", title: "{p} a rejoint le donjon.", body: "Une nouvelle journée d'ascension commence. Le Système observe.", cta: "Commencer" },
    { eyebrow: "◈ ÉVEIL QUOTIDIEN ◈", title: "Le Système te salue, {p}.", body: "Chaque jour est une chance de monter en rang. Ne la gaspille pas.", cta: "J'y vais" },
    { eyebrow: "◈ NOUVELLE JOURNÉE ◈", title: "{p}, ton donjon quotidien t'attend.", body: "Les faibles restent chez eux. Les chasseurs répondent à l'appel.", cta: "Répondre à l'appel" },
    { eyebrow: "◈ CONNEXION ◈", title: "Ravi de te revoir, {p}.", body: "Ta légende ne s'écrit pas seule. Aujourd'hui, un chapitre de plus.", cta: "Continuer" },
  ];
  var REDEMPTION_VARIANTS = [
    { eyebrow: "◈ ALERTE SYSTÈME ◈", title: "{p}, ta série a été brisée.", body: "Mais rien n'est perdu : réussis la quête de rédemption et ta légende continue.", cta: "J'affronte la rédemption" },
    { eyebrow: "◈ DERNIÈRE CHANCE ◈", title: "{p}, le Système t'accorde un sursis.", body: "Un jour a été manqué. Complète la quête de rédemption maintenant, ou tout sera perdu demain.", cta: "Je saisis ma chance" },
    { eyebrow: "◈ AVERTISSEMENT ◈", title: "Ta série vacille, {p}.", body: "Ce n'est pas encore fini. Une quête de rédemption t'attend — relève-toi avant qu'il ne soit trop tard.", cta: "Je me relève" },
    { eyebrow: "◈ ÉPREUVE ◈", title: "{p}, le Système te teste.", body: "Une faille est apparue dans ta série. Referme-la aujourd'hui, ou elle s'effondrera.", cta: "Refermer la faille" },
  ];
  var BROKEN_VARIANTS = [
    { eyebrow: "◈ SÉRIE PERDUE ◈", title: "{p}, ta série est brisée.", body: "Le délai de rédemption est passé. Ton compteur repart de zéro — mais chaque grand chasseur a connu une chute. Relève-toi.", cta: "Je me relève" },
    { eyebrow: "◈ CHUTE ◈", title: "{p}, la série s'est effondrée.", body: "Le Système efface le compteur. Ce n'est pas la fin de ton ascension — seulement un nouveau départ.", cta: "Je recommence" },
    { eyebrow: "◈ RÉINITIALISATION ◈", title: "{p}, ton compteur repart à zéro.", body: "Même les plus grands chasseurs rechutent. Ce qui compte, c'est de te relever aujourd'hui.", cta: "Debout, Chasseur" },
    { eyebrow: "◈ ÉCHEC DE LA RÉDEMPTION ◈", title: "{p}, la fenêtre s'est refermée.", body: "Ta série est tombée à zéro. Le Système ne juge pas les chutes — seulement ceux qui restent à terre.", cta: "Je me relève" },
  ];

  function changelogTpl() {
    var items = CHANGELOG_ITEMS.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("");
    return (
      '<div class="slf-overlay"><div class="slf-modal" data-stop="1">' +
        '<p class="slf-mono slf-eyebrow">◈ MISE À JOUR ◈</p>' +
        '<h2 class="slf-modaltitle">Nouveautés</h2>' +
        '<ul class="slf-changelist">' + items + "</ul>" +
        '<button class="slf-cta" style="margin-top:6px" data-action="ack-changelog">J\'ai compris</button>' +
      "</div></div>"
    );
  }

  function welcomeModalTpl() {
    return messageModalTpl(pickVariant(WELCOME_VARIANTS, "welcome-" + todayStr()), "dismiss-welcome", false);
  }
  function redemptionPenaltyTpl() {
    return messageModalTpl(pickVariant(REDEMPTION_VARIANTS, "redemption-" + todayStr()), "ack-redemption", true);
  }
  function streakBrokenTpl() {
    return messageModalTpl(pickVariant(BROKEN_VARIANTS, "broken-" + todayStr()), "ack-broken", true);
  }

  // ---------- templates : quête ----------
  function headerTpl() {
    var today = todayStr();
    var rank = getRank(profile.streak);
    return (
      '<header class="slf-header">' +
        '<div class="slf-rankbadge" style="--glow:' + rank.glow + '" data-action="click-rankbadge">' + icon("hexagon", 40) + '<span class="slf-rankletter">' + rank.name + "</span></div>" +
        '<div class="slf-headerinfo">' +
          '<p class="slf-mono slf-eyebrow">' + esc(rank.label.toUpperCase()) + " · RANG " + rank.name + "</p>" +
          '<div class="slf-streakrow">' + icon("flame", 16, { color: "#ff9d4d" }) + '<span class="slf-mono slf-streaknum">' + profile.streak + '</span><span class="slf-dim">jours</span></div>' +
        "</div>" +
        '<div class="slf-headerright">' +
          '<div class="slf-datebadge slf-mono">' + esc(today.slice(5).replace("-", "/")) + "</div>" +
          '<button class="slf-bellbtn" data-action="nav" data-view="settings" aria-label="Réglages">' +
            icon("gear", 16) +
          "</button>" +
        "</div>" +
      "</header>"
    );
  }

  function pageHeaderTpl(title) {
    return '<header class="slf-pageheader"><span class="slf-mono slf-eyebrow slf-pagetitle">' + esc(title) + "</span></header>";
  }
  function backArrowTpl() {
    return '<button class="slf-backarrow" data-action="nav" data-view="quest" aria-label="Retour à la quête">' + icon("arrowLeft", 18) + "</button>";
  }

  function taskRowTpl(exo, targets, mode) {
    var key = exo.id;
    var isChecked = ui.checked[key];
    var disabled = mode === "done";
    var isTimeBased = exo.unit === "s";
    var timerBtn = isTimeBased && !disabled ? '<button class="slf-timerbtn" data-action="open-timer" data-key="' + key + '" aria-label="Chrono">' + icon("stopwatch", 16) + "</button>" : "";
    return (
      '<div class="slf-taskrow' + (isChecked ? " done" : "") + '" ' + (disabled ? "" : 'data-action="toggle-task" data-key="' + key + '"') + '>' +
        '<div class="slf-taskicon">' + icon(exo.icon, 18) + "</div>" +
        '<div class="slf-taskinfo"><p class="slf-tasklabel">' + esc(exo.label) + '</p><p class="slf-mono slf-tasktarget">' + targets[key] + esc(exo.unit) + "</p></div>" +
        timerBtn +
        (isChecked ? icon("checkCircle", 22, { color: "#2fd7ff" }) : icon("circle", 22, { color: "#28425e" })) +
      "</div>"
    );
  }

  function numberRowTpl(exo, action, valuesObj) {
    var key = exo.id;
    var val = valuesObj[key];
    return (
      '<div class="slf-taskrow">' +
        '<div class="slf-taskicon">' + icon(exo.icon, 18) + "</div>" +
        '<div class="slf-taskinfo"><p class="slf-tasklabel">' + esc(exo.label) + "</p></div>" +
        '<input type="number" min="0" inputmode="numeric" class="slf-numinput" placeholder="' + (exo.unit === "s" ? "sec" : "reps") + '" data-action="' + action + '" data-key="' + key + '" value="' + (typeof val === "number" ? val : "") + '" />' +
      "</div>"
    );
  }

  function rankProgressTpl() {
    var info = nextRankInfo(profile.streak);
    return (
      '<div class="slf-rankprogress">' +
        '<div class="slf-rankprogresstop">' +
          '<span class="slf-mono" style="color:' + info.current.glow + '">RANG ' + info.current.name + "</span>" +
          (info.next ? '<span class="slf-dim">RANG ' + info.next.name + " dans " + Math.max(0, info.next.min - profile.streak) + "j</span>" : '<span class="slf-dim">Rang maximal</span>') +
        "</div>" +
        '<div class="slf-progressbar"><div class="slf-progressfill" style="width:' + (info.progress * 100) + "%;background:" + info.current.glow + '"></div></div>' +
      "</div>"
    );
  }

  function exerciseSelectionTpl() {
    var rows = profile.exercisePool.map(function (exo) {
      var checked = !!ui.selectionChoice[exo.id];
      return (
        '<button class="slf-taskrow' + (checked ? " done" : "") + '" data-action="toggle-selection" data-key="' + exo.id + '">' +
          '<div class="slf-taskicon">' + icon(exo.icon, 18) + "</div>" +
          '<div class="slf-taskinfo"><p class="slf-tasklabel">' + esc(exo.label) + '</p><p class="slf-mono slf-tasktarget">' + profile.targets[exo.id] + esc(exo.unit) + "</p></div>" +
          (checked ? icon("checkCircle", 22, { color: "#2fd7ff" }) : icon("circle", 22, { color: "#28425e" })) +
        "</button>"
      );
    }).join("");
    var count = Object.keys(ui.selectionChoice).filter(function (k) { return ui.selectionChoice[k]; }).length;
    return (
      '<div class="slf-window"><div class="slf-windowhead"><span class="slf-mono">◈ CHOISIS TES 4 EXERCICES ◈</span></div>' +
      '<div class="slf-windowbody">' +
        '<p class="slf-dim" style="margin-bottom:12px">Ton pool contient plus de 4 exercices. Sélectionne ceux d\'aujourd\'hui.</p>' +
        rows +
        '<p class="slf-dim" style="text-align:center;margin:10px 0">' + count + "/4 sélectionnés</p>" +
        '<button class="slf-cta" ' + (count === 4 ? 'data-action="submit-selection"' : "disabled") + ">Lancer la quête</button>" +
      "</div></div>"
    );
  }

  function reevalPromptTpl() {
    return (
      '<div class="slf-window"><div class="slf-windowhead"><span class="slf-mono">◈ REEVALUATION DAY ◈</span></div>' +
      '<div class="slf-windowbody slf-donebody">' +
        icon("trendingUp", 34, { color: "#ffd76a" }) +
        '<p class="slf-donetext">C\'est dimanche, ' + esc(pseudo()) + ". Veux-tu être réévalué aujourd'hui ?</p>" +
        '<p class="slf-dim">Tu noteras ton max sur chaque exercice, et tes objectifs seront ajustés en conséquence.</p>' +
        '<div style="width:100%;margin-top:14px;display:flex;flex-direction:column;gap:8px">' +
          '<button class="slf-cta" data-action="reeval-answer" data-value="yes">Oui, réévalue-moi</button>' +
          '<button class="slf-togglebtn" data-action="reeval-answer" data-value="no">Non, quête normale</button>' +
        "</div>" +
      "</div></div>"
    );
  }

  function reevalFormTpl() {
    var rows = profile.exercisePool.map(function (exo) { return numberRowTpl(exo, "reeval-set", ui.reevalValues); }).join("");
    return (
      '<div class="slf-window"><div class="slf-windowhead"><span class="slf-mono">◈ RÉÉVALUATION ◈</span></div>' +
      '<div class="slf-windowbody">' +
        '<p class="slf-redemptionnote" style="color:#ffe9b3;background:rgba(255,215,106,0.08);border-color:rgba(255,215,106,0.35)">Note le maximum de répétitions (ou de secondes pour le gainage) que tu peux vraiment faire, en une seule série.</p>' +
        rows +
        (ui.reevalError ? '<p class="slf-settingsnote danger">Renseigne un nombre supérieur à 0 pour chaque exercice.</p>' : "") +
        '<button class="slf-cta" data-action="submit-reeval">Valider ma réévaluation</button>' +
      "</div></div>"
    );
  }

  function questTpl() {
    return questContentTpl() + gateRaidTpl() + weakPointTpl() + trophiesTpl() + hiddenAchievementsTpl();
  }
  function weakPointTpl() {
    var w = weakPointAvailable();
    if (!w) return "";
    if (ui.weakPointCheckedFor !== w.id) {
      ui.weakPointChecked = false;
      ui.weakPointCheckedFor = w.id;
    }
    var exo = getExoMeta(w.id);
    var target = Math.max(1, Math.round(profile.targets[w.id] * 1.5));
    var checked = ui.weakPointChecked;
    return (
      '<div class="slf-window slf-weakwindow" style="margin-top:16px">' +
        '<div class="slf-windowhead weak"><span class="slf-mono">◈ ÉRADICATION DE FAIBLESSE ◈</span></div>' +
        '<div class="slf-windowbody">' +
          '<p class="slf-dim" style="margin-bottom:10px">Le Système a détecté un déséquilibre récurrent : ' + esc(exo.label) + ". Corrige-le.</p>" +
          '<div class="slf-taskrow' + (checked ? " done" : "") + '" data-action="toggle-weakpoint">' +
            '<div class="slf-taskicon">' + icon(exo.icon, 18) + "</div>" +
            '<div class="slf-taskinfo"><p class="slf-tasklabel">' + esc(exo.label) + '</p><p class="slf-mono slf-tasktarget">' + target + esc(exo.unit) + "</p></div>" +
            (checked ? icon("checkCircle", 22, { color: "#7ed957" }) : icon("circle", 22, { color: "#28425e" })) +
          "</div>" +
          '<button class="slf-cta" ' + (checked ? 'data-action="submit-weakpoint"' : "disabled") + ">Corriger le déséquilibre</button>" +
        "</div>" +
      "</div>"
    );
  }
  function gateRaidTpl() {
    var raid = getActiveGateRaid();
    if (!raid) return "";
    var alreadyDone = profile.history.some(function (h) { return h.mode === "gateraid" && h.raidId === raid.id; });
    if (alreadyDone) return "";

    if (ui.raidCheckedForId !== raid.id) {
      var fresh = {};
      profile.exercisePool.forEach(function (exo) { fresh[exo.id] = false; });
      ui.raidChecked = fresh;
      ui.raidCheckedForId = raid.id;
    }
    var challenge = gateRaidChallenge();
    var rows = challenge.map(function (c) {
      var checked = ui.raidChecked[c.id];
      return (
        '<button class="slf-taskrow' + (checked ? " done" : "") + '" data-action="toggle-raid" data-key="' + c.id + '">' +
          '<div class="slf-taskicon">' + icon(c.icon, 18) + "</div>" +
          '<div class="slf-taskinfo"><p class="slf-tasklabel">' + esc(c.label) + '</p><p class="slf-mono slf-tasktarget">' + c.target + esc(c.unit) + "</p></div>" +
          (checked ? icon("checkCircle", 22, { color: "#2fd7ff" }) : icon("circle", 22, { color: "#28425e" })) +
        "</button>"
      );
    }).join("");
    var doneCount = Object.keys(ui.raidChecked).filter(function (k) { return ui.raidChecked[k]; }).length;
    var allChecked = doneCount === Object.keys(ui.raidChecked).length;

    return (
      '<div class="slf-window slf-raidwindow" style="margin-top:16px">' +
        '<div class="slf-windowhead raid"><span class="slf-mono">◈ GATE RAID — PORTAIL D\'INCURSION ◈</span></div>' +
        '<div class="slf-windowbody">' +
          '<p class="slf-dim" style="margin-bottom:8px">Un portail instable s\'est ouvert. Referme-le avant l\'effondrement.</p>' +
          '<p class="slf-mono slf-raidcountdown" id="slf-raid-countdown">' + formatCountdown(raid.end - Date.now()) + "</p>" +
          rows +
          '<button class="slf-cta" ' + (allChecked ? 'data-action="submit-raid"' : "disabled") + ">Refermer le Portail</button>" +
        "</div>" +
      "</div>"
    );
  }
  function questContentTpl() {
    var mode = getMode();

    if (mode === "reeval-prompt") return reevalPromptTpl();
    if (mode === "reeval") return reevalFormTpl();

    var todayIds = null;
    if (mode === "normal" || mode === "redemption") {
      todayIds = todayExerciseIds();
      if (todayIds === null) {
        if (ui.selectionChoiceDate !== todayStr()) {
          ui.selectionChoice = {};
          ui.selectionChoiceDate = todayStr();
        }
        return exerciseSelectionTpl();
      }
    }

    var targets = mode === "redemption" ? redemptionTargets(profile.targets, todayIds) : profile.targets;

    if (mode === "done") {
      var last = profile.history[0];
      var chips = profile.exercisePool.map(function (exo) {
        return '<div class="slf-targetchip">' + icon(exo.icon, 14) + '<span class="slf-mono">' + profile.targets[exo.id] + esc(exo.unit) + '</span><span class="slf-dim">' + esc(exo.label) + "</span></div>";
      }).join("");
      var subMsg = "";
      if (last) {
        if (last.mode === "reeval") {
          subMsg = "Nouveaux objectifs définis après réévaluation.";
        } else if (last.mode === "joker") {
          subMsg = "Jour de repos utilisé. Objectifs inchangés pour demain.";
        } else {
          var lastList = last.exercises || legacyExosFromEntry(last);
          var anyEasy = lastList.some(function (e) { return e.feedback === "facile"; });
          subMsg = anyEasy ? "Objectifs ajustés selon ton ressenti par exercice." : "Même intensité demain.";
        }
      }
      return (
        '<div class="slf-window"><div class="slf-windowhead"><span class="slf-mono">◈ QUÊTE ACCOMPLIE ◈</span></div>' +
        '<div class="slf-windowbody slf-donebody">' +
          icon("checkCircle", 40, { color: "#2fd7ff" }) +
          '<p class="slf-donetext">Séance validée pour aujourd\'hui, ' + esc(pseudo()) + ".</p>" +
          (subMsg ? '<p class="slf-dim">' + subMsg + "</p>" : "") +
          '<div class="slf-nexttargets"><p class="slf-mono slf-eyebrow">TES OBJECTIFS</p><div class="slf-targetrow">' + chips + "</div></div>" +
          rankProgressTpl() +
        "</div></div>"
      );
    }

    var isRedemption = mode === "redemption";
    syncCheckedToIds(todayIds);
    var rows = todayIds.map(function (id) { return taskRowTpl(getExoMeta(id), targets, mode); }).join("");
    var doneCount = Object.keys(ui.checked).filter(function (k) { return ui.checked[k]; }).length;
    var allChecked = doneCount === Object.keys(ui.checked).length;

    var jokerBlock = "";
    if (!isRedemption) {
      if (jokerAvailable()) {
        jokerBlock = '<button class="slf-togglebtn" style="margin-top:8px" data-action="use-joker">' + icon("moon", 16) + " Utiliser mon joker (jour de repos)</button>";
      } else {
        jokerBlock = '<p class="slf-dim" style="text-align:center;margin-top:10px">Joker disponible dans ' + jokerDaysLeft() + "j</p>";
      }
    }

    return (
      '<div class="slf-window' + (isRedemption ? " danger" : "") + '">' +
        '<div class="slf-windowhead"><span class="slf-mono">' + (isRedemption ? "◈ QUÊTE DE RÉDEMPTION ◈" : "◈ QUÊTE QUOTIDIENNE ◈") + "</span></div>" +
        '<div class="slf-windowbody">' +
          (isRedemption ? '<p class="slf-redemptionnote">Pénalité : +50% de reps. Complète cette quête pour continuer ta série.</p>' : "") +
          rows +
          '<div class="slf-progressbar"><div class="slf-progressfill" style="width:' + ((doneCount / 4) * 100) + '%"></div></div>' +
          '<button class="slf-cta" ' + (allChecked ? 'data-action="open-feedback"' : "disabled") + ">Terminer la séance</button>" +
          jokerBlock +
        "</div>" +
      "</div>"
    );
  }

  // Palier infini pour la streak : jours (7) -> mois de 30j (jusqu'à 11) -> 1 an (365j) -> tous les ans ensuite
  function nextStreakTier(v) {
    if (v < 7) return 7;
    if (v < 30) return 30;
    if (v < 365) {
      var months = Math.floor(v / 30) + 1;
      if (months >= 12) return 365;
      return months * 30;
    }
    var years = Math.floor(v / 365) + 1;
    return years * 365;
  }
  function currentStreakTier(v) {
    if (v < 7) return null;
    if (v < 30) return 7;
    if (v < 365) {
      var months = Math.floor(v / 30);
      if (months > 11) months = 11;
      return months * 30;
    }
    var years = Math.floor(v / 365);
    return years * 365;
  }
  function streakTierLabel(days) {
    if (days < 30) return days + " jours d'affilée";
    if (days < 365) return Math.round(days / 30) + " mois d'affilée";
    var years = Math.round(days / 365);
    return years + " an" + (years > 1 ? "s" : "") + " d'affilée";
  }
  function infiniteBadge(id, iconName, firstThreshold, nextTierFn, currentTierFn, labelFn, currentValue) {
    var unlocked = currentValue >= firstThreshold;
    var target = nextTierFn(currentValue);
    var displayTier = unlocked ? currentTierFn(currentValue) : firstThreshold;
    return {
      id: id,
      icon: iconName,
      label: labelFn(displayTier),
      unlocked: unlocked,
      progress: Math.min(currentValue, target) + "/" + target,
    };
  }

  function tierBadge(id, iconName, tiers, tierLabel, currentValue) {
    var achievedIdx = -1;
    for (var i = 0; i < tiers.length; i++) { if (currentValue >= tiers[i]) achievedIdx = i; }
    var unlocked = achievedIdx >= 0;
    var maxed = achievedIdx === tiers.length - 1;
    var displayTier = unlocked ? tiers[achievedIdx] : tiers[0];
    var nextTier = maxed ? null : tiers[achievedIdx + 1];
    return {
      id: id,
      icon: iconName,
      label: tierLabel(displayTier),
      unlocked: unlocked,
      progress: maxed ? null : Math.min(currentValue, nextTier) + "/" + nextTier,
    };
  }

  function computeTrophies() {
    var sessions = profile.history.length;
    var daysAtS = profile.history.filter(function (h) { return h.rank === "S"; }).length;

    var streakBadge = infiniteBadge("streak", "flame", 7, nextStreakTier, currentStreakTier, streakTierLabel, profile.best);

    var rankTiers = [3, 7, 14, 30, 60];
    var rankNames = { 3: "D", 7: "C", 14: "B", 30: "A", 60: "S" };
    var rankBadge = tierBadge("rank", "hexagon", rankTiers, function (v) { return "Rang " + rankNames[v] + " atteint"; }, profile.best);
    if (profile.best >= 60) rankBadge.sub = daysAtS + " jour" + (daysAtS > 1 ? "s" : "") + " en Rang S";

    var sessionTiers = [10, 50, 100];
    var next = 150;
    while (next <= sessions) { sessionTiers.push(next); next += 50; }
    sessionTiers.push(next);
    var sessionsBadge = tierBadge("sessions", "scroll", sessionTiers, function (v) { return v + " séances"; }, sessions);

    var raidCount = profile.history.filter(function (h) { return h.mode === "gateraid"; }).length;
    var raidTiers = [1, 5];
    var rn = 10;
    while (rn <= raidCount) { raidTiers.push(rn); rn += 5; }
    raidTiers.push(rn);
    var raidBadge = tierBadge("gateraid", "sword", raidTiers, function () { return "Briseur de Portail"; }, raidCount);

    return [
      streakBadge,
      rankBadge,
      sessionsBadge,
      raidBadge,
      { id: "joker1", icon: "moon", label: "Premier jour de repos", unlocked: profile.history.some(function (h) { return h.mode === "joker"; }) },
      { id: "reeval1", icon: "trendingUp", label: "Première réévaluation", unlocked: profile.history.some(function (h) { return h.mode === "reeval"; }) },
      { id: "redemption1", icon: "zap", label: "Première rédemption réussie", unlocked: profile.history.some(function (h) { return h.mode === "redemption"; }) },
      { id: "harmonieux", icon: "checkCircle", label: "Profil Harmonieux", unlocked: profile.history.some(function (h) { return h.mode === "weakpoint"; }) },
    ];
  }

  // ---------- hauts faits cachés ----------
  function isPerfectNormalDay(dateStr) {
    var h = profile.history.filter(function (e) { return e.date === dateStr; })[0];
    if (!h || h.mode !== "normal" || !h.exercises || h.exercises.length === 0) return false;
    return h.exercises.every(function (e) { return e.feedback === "facile"; });
  }
  function hasConsecutivePerfectDays(n, mustStartMonday) {
    var seen = {};
    profile.history.forEach(function (h) { seen[h.date] = true; });
    for (var i = 0; i < profile.history.length; i++) {
      var start = new Date(profile.history[i].date + "T00:00:00");
      if (mustStartMonday && start.getDay() !== 1) continue;
      var ok = true;
      for (var d = 0; d < n; d++) {
        var day = new Date(start);
        day.setDate(day.getDate() + d);
        if (!isPerfectNormalDay(todayStr(day))) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }
  function computeHiddenAchievements() {
    var earlyBird = profile.history.some(function (h) {
      if (!h.completedAt) return false;
      var t = new Date(h.completedAt);
      return t.getHours() >= 4 && t.getHours() < 7;
    });
    var nightOwl = profile.history.some(function (h) {
      if (!h.completedAt) return false;
      var t = new Date(h.completedAt);
      var mins = t.getHours() * 60 + t.getMinutes();
      return mins >= 23 * 60 + 30 || mins < 4 * 60;
    });
    var mastery = hasConsecutivePerfectDays(7, false);
    var perfectWeek = hasConsecutivePerfectDays(7, true);
    var revenant = profile.history.filter(function (h) { return h.mode === "redemption"; }).length >= 5;
    var forgeron = profile.totalCustomExercisesAdded >= 5;
    var assidu = profile.reevalYesStreak >= 10;
    var sansFin = profile.appOpenDaysCount >= 100;
    var clicker = !!(profile.hiddenFlags && profile.hiddenFlags.easterEgg);

    return [
      { id: "earlybird", label: "Lève-toi, Ombre", hint: "Valide ta quête très tôt le matin.", unlocked: earlyBird },
      { id: "nightowl", label: "Nuit Blanche", hint: "Valide ta quête en pleine nuit.", unlocked: nightOwl },
      { id: "mastery", label: "La Voie du Perfectionniste", hint: "7 jours d'affilée en \"Facile\", sans joker ni rédemption.", unlocked: mastery },
      { id: "perfectweek", label: "Semaine Parfaite", hint: "Une semaine calendaire (lundi à dimanche) parfaite.", unlocked: perfectWeek },
      { id: "revenant", label: "Le Revenant", hint: "Réussis 5 quêtes de rédemption.", unlocked: revenant },
      { id: "forgeron", label: "Le Forgeron", hint: "Ajoute 5 exercices personnalisés à ton pool.", unlocked: forgeron },
      { id: "assidu", label: "L'Assidu", hint: "Réponds \"oui\" au Reevaluation Day 10 dimanches d'affilée.", unlocked: assidu },
      { id: "sansfin", label: "Un Jour Sans Fin", hint: "Ouvre l'app 100 jours différents.", unlocked: sansFin },
      { id: "clicker", label: "L'Effet Papillon", hint: "???", unlocked: clicker },
    ];
  }
  function showHint(id) {
    var a = computeHiddenAchievements().filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    var text = a.hint;
    ui.hintText = text;
    render();
    setTimeout(function () {
      if (ui.hintText === text) {
        ui.hintText = null;
        render();
      }
    }, 4000);
  }

  function hiddenAchievementsTpl() {
    var list = computeHiddenAchievements();
    var cells = list.map(function (a) {
      if (a.unlocked) {
        return (
          '<div class="slf-trophy unlocked">' +
            '<div class="slf-trophyicon">' + icon("checkCircle", 20, { color: "var(--cyan)" }) + "</div>" +
            '<p class="slf-trophylabel">' + esc(a.label) + "</p>" +
          "</div>"
        );
      }
      return (
        '<button class="slf-trophy slf-trophy-hidden" data-action="show-hint" data-key="' + a.id + '">' +
          '<div class="slf-trophyicon">' + icon("circle", 20, { color: "var(--dim)" }) + "</div>" +
          '<p class="slf-trophylabel">???</p>' +
        "</button>"
      );
    }).join("");
    return (
      '<div class="slf-window" style="margin-top:16px"><div class="slf-windowhead"><span class="slf-mono">◈ HAUTS FAITS ◈</span></div>' +
        '<div class="slf-windowbody">' +
          '<p class="slf-dim" style="margin-bottom:10px">Des succès secrets. Appuie sur un "???" pour un indice.</p>' +
          '<div class="slf-trophygrid">' + cells + "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function trophiesTpl() {
    var trophies = computeTrophies();
    var cells = trophies.map(function (t) {
      var cls = "slf-trophy" + (t.unlocked ? " unlocked" : "");
      var iconColor = t.unlocked ? "var(--cyan)" : "var(--dim)";
      return (
        '<div class="' + cls + '" title="' + esc(t.label) + '">' +
          '<div class="slf-trophyicon">' + icon(t.icon, 20, { color: iconColor }) + "</div>" +
          '<p class="slf-trophylabel">' + esc(t.label) + "</p>" +
          (t.progress ? '<p class="slf-trophyprogress">' + esc(t.progress) + "</p>" : "") +
          (t.sub ? '<p class="slf-trophyprogress">' + esc(t.sub) + "</p>" : "") +
        "</div>"
      );
    }).join("");
    return (
      '<div class="slf-window" style="margin-top:16px"><div class="slf-windowhead"><span class="slf-mono">◈ TROPHÉES ◈</span></div>' +
        '<div class="slf-windowbody">' +
          '<div class="slf-trophygrid">' + cells + "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function heatmapTpl() {
    var days = [];
    var base = new Date();
    for (var i = 29; i >= 0; i--) {
      var d = new Date(base);
      d.setDate(d.getDate() - i);
      var ds = todayStr(d);
      var entry = null;
      for (var j = 0; j < profile.history.length; j++) {
        if (profile.history[j].date === ds) { entry = profile.history[j]; break; }
      }
      days.push({ date: ds, entry: entry, isToday: ds === todayStr() });
    }
    var cells = days.map(function (d) {
      var cls = "slf-heatcell";
      var label = d.date;
      if (d.entry) {
        if (d.entry.mode === "redemption") { cls += " heat-redemption"; label += " · Rédemption"; }
        else if (d.entry.mode === "reeval") { cls += " heat-reeval"; label += " · Réévaluation"; }
        else if (d.entry.mode === "joker") { cls += " heat-joker"; label += " · Repos"; }
        else { cls += " heat-normal"; label += " · Séance"; }
      } else {
        cls += " heat-empty";
        label += " · Manqué";
      }
      if (d.isToday) cls += " heat-today";
      return '<div class="' + cls + '" title="' + esc(label) + '"></div>';
    }).join("");

    return (
      '<div class="slf-heatmapsection">' +
        '<p class="slf-mono slf-eyebrow" style="margin-bottom:8px">30 DERNIERS JOURS</p>' +
        '<div class="slf-heatgrid">' + cells + "</div>" +
        '<div class="slf-heatlegend">' +
          '<span><i class="slf-heatdot heat-normal"></i>Séance</span>' +
          '<span><i class="slf-heatdot heat-redemption"></i>Rédemption</span>' +
          '<span><i class="slf-heatdot heat-reeval"></i>Réévaluation</span>' +
          '<span><i class="slf-heatdot heat-joker"></i>Repos</span>' +
          '<span><i class="slf-heatdot heat-empty"></i>Manqué</span>' +
        "</div>" +
      "</div>"
    );
  }

  function historyTpl() {
    var rows = profile.history.map(function (h) {
      var rank = RANKS.find(function (r) { return r.name === h.rank; }) || RANKS[0];
      var modePill = "";
      if (h.mode === "redemption") modePill = '<span class="slf-pill danger">RÉDEMPTION</span>';
      else if (h.mode === "reeval") modePill = '<span class="slf-pill reeval">RÉÉVALUATION</span>';
      else if (h.mode === "joker") modePill = '<span class="slf-pill joker">REPOS</span>';
      else if (h.mode === "gateraid") modePill = '<span class="slf-pill gateraid">GATE RAID</span>';
      else if (h.mode === "weakpoint") modePill = '<span class="slf-pill weakpoint">CIBLÉE</span>';

      var exoList = h.exercises || (h.mode !== "joker" ? legacyExosFromEntry(h) : []);

      var rightIcons;
      if (h.mode === "reeval") {
        rightIcons = icon("trendingUp", 14, { color: "#ffd76a" });
      } else if (h.mode === "joker") {
        rightIcons = icon("moon", 14, { color: "#7ed957" });
      } else if (h.mode === "gateraid") {
        rightIcons = icon("sword", 14, { color: "#a78bfa" });
      } else if (h.mode === "weakpoint") {
        rightIcons = icon("checkCircle", 14, { color: "#7ed957" });
      } else {
        rightIcons = exoList.map(function (e) {
          var easy = e.feedback === "facile";
          return icon(easy ? "zap" : "wind", 12, { color: easy ? "#2fd7ff" : "#8b9fb5" });
        }).join("");
      }

      var exoLine = h.mode === "joker" ? "Jour de repos (joker)" : exoList.map(function (e) { return e.value + (e.unit || "") + " " + e.label; }).join(" · ");

      return (
        '<div class="slf-histrow2">' +
          '<div class="slf-histtop">' +
            '<span class="slf-mono">' + esc(h.date.slice(5).replace("-", "/")) + "</span>" +
            modePill +
            '<span class="slf-rankpill" style="color:' + rank.glow + ";border-color:" + rank.glow + ';margin-left:auto">' + h.rank + "</span>" +
          "</div>" +
          '<div class="slf-histbottom">' +
            '<span class="slf-mono slf-dim">' + esc(exoLine) + "</span>" +
            '<div class="slf-histicons">' + rightIcons + "</div>" +
          "</div>" +
        "</div>"
      );
    }).join("");

    return (
      '<div class="slf-window"><div class="slf-windowhead"><span class="slf-mono">◈ HISTORIQUE ◈</span></div>' +
      '<div class="slf-windowbody">' +
        '<div class="slf-statsrow">' +
          '<div class="slf-statchip">' + icon("trendingUp", 14) + '<span class="slf-mono">' + profile.streak + '</span><span class="slf-dim">actuelle</span></div>' +
          '<div class="slf-statchip">' + icon("flame", 14, { color: "#ff9d4d" }) + '<span class="slf-mono">' + profile.best + '</span><span class="slf-dim">record</span></div>' +
          '<div class="slf-statchip">' + icon("scroll", 14) + '<span class="slf-mono">' + profile.history.length + '</span><span class="slf-dim">séances</span></div>' +
        "</div>" +
        heatmapTpl() +
        (profile.history.length === 0
          ? '<div class="slf-empty"><p class="slf-donetext">Aucune quête accomplie.</p><p class="slf-dim">Commence ton ascension, ' + esc(pseudo()) + ".</p></div>"
          : '<div class="slf-histlist">' + rows + "</div>") +
      "</div></div>"
    );
  }

  function navTpl() {
    return (
      '<nav class="slf-nav">' +
        '<button class="slf-navbtn' + (ui.view === "quest" ? " active" : "") + '" data-action="nav" data-view="quest">' + icon("sword", 18) + "<span>Quête</span></button>" +
        '<button class="slf-navbtn' + (ui.view === "history" ? " active" : "") + '" data-action="nav" data-view="history">' + icon("scroll", 18) + "<span>Voir mes stats</span></button>" +
      "</nav>"
    );
  }

  function timerModalTpl() {
    var exo = getExoMeta(ui.timerExoId);
    return (
      '<div class="slf-overlay"><div class="slf-modal" data-stop="1">' +
        '<p class="slf-mono slf-eyebrow">CHRONO — ' + esc(exo.label.toUpperCase()) + "</p>" +
        '<p class="slf-timerdisplay" id="slf-timer-display">' + formatTimer(ui.timerRemaining) + "</p>" +
        '<div style="display:flex;gap:8px;margin-top:6px">' +
          '<button class="slf-cta" style="flex:1" data-action="' + (ui.timerRunning ? "pause-timer" : "start-timer") + '">' + (ui.timerRunning ? "Pause" : "Démarrer") + "</button>" +
          '<button class="slf-togglebtn" style="flex:1" data-action="reset-timer">Réinitialiser</button>' +
        "</div>" +
        '<button class="slf-togglebtn" style="margin-top:8px;width:100%" data-action="close-timer">Fermer</button>' +
      "</div></div>"
    );
  }

  function feedbackModalTpl() {
    var ids = Object.keys(ui.feedbackChoice);
    var rows = ids.map(function (k) {
      var exo = getExoMeta(k);
      var choice = ui.feedbackChoice[k];
      return (
        '<div class="slf-fbrow">' +
          '<div class="slf-fbrowlabel">' + icon(exo.icon, 16) + "<span>" + esc(exo.label) + "</span></div>" +
          '<div class="slf-fbrowbtns">' +
            '<button class="slf-fbtoggle easy' + (choice === "facile" ? " active" : "") + '" data-action="set-feedback" data-key="' + k + '" data-value="facile">' + icon("zap", 14) + "<span>Facile</span></button>" +
            '<button class="slf-fbtoggle hard' + (choice === "essouffle" ? " active" : "") + '" data-action="set-feedback" data-key="' + k + '" data-value="essouffle">' + icon("wind", 14) + "<span>Essoufflé</span></button>" +
          "</div>" +
        "</div>"
      );
    }).join("");
    var complete = ids.every(function (k) { return ui.feedbackChoice[k] !== null; });
    return (
      '<div class="slf-overlay" data-action="close-feedback"><div class="slf-modal" data-stop="1">' +
        '<p class="slf-mono slf-eyebrow">FIN DE SÉANCE</p><h2 class="slf-modaltitle">Comment t\'es-tu senti, exercice par exercice ?</h2>' +
        '<p class="slf-dim" style="margin-bottom:6px">Facile = tu augmentes cet exercice demain. Essoufflé = tu gardes le même niveau.</p>' +
        rows +
        '<button class="slf-cta" style="margin-top:14px" ' + (complete ? 'data-action="submit-feedback"' : "disabled") + ">Valider</button>" +
      "</div></div>"
    );
  }

  function exercisePoolListTpl() {
    var rows = profile.exercisePool.map(function (exo) {
      return (
        '<div class="slf-exorow">' +
          '<div class="slf-taskicon">' + icon(exo.icon, 16) + "</div>" +
          '<div class="slf-taskinfo"><p class="slf-tasklabel">' + esc(exo.label) + '</p><p class="slf-mono slf-tasktarget">' + profile.targets[exo.id] + esc(exo.unit) + "</p></div>" +
          (!exo.builtin ? '<button class="slf-exoremove" data-action="remove-exercise" data-key="' + exo.id + '" aria-label="Retirer">' + icon("x", 14) + "</button>" : '<span class="slf-exobuiltin">DE BASE</span>') +
        "</div>"
      );
    }).join("");
    return '<div class="slf-exolist">' + rows + "</div>";
  }

  function addExerciseFormTpl() {
    return (
      '<div class="slf-addexo">' +
        '<input type="text" maxlength="24" id="slf-newexo-name" class="slf-textinput" placeholder="Nom de l\'exercice (ex: Tractions)" data-action="set-newexo-name" value="' + esc(ui.newExoName) + '" />' +
        '<div class="slf-addexorow">' +
          '<div class="slf-unittoggle">' +
            '<button class="slf-unitbtn' + (ui.newExoUnit === "reps" ? " active" : "") + '" data-action="set-newexo-unit" data-value="reps">Répétitions</button>' +
            '<button class="slf-unitbtn' + (ui.newExoUnit === "seconds" ? " active" : "") + '" data-action="set-newexo-unit" data-value="seconds">Secondes</button>' +
          "</div>" +
          '<input type="number" min="1" inputmode="numeric" id="slf-newexo-start" class="slf-numinput" placeholder="Début" />' +
        "</div>" +
        (ui.newExoError ? '<p class="slf-settingsnote danger">Donne un nom et une valeur de départ supérieure à 0.</p>' : "") +
        '<button class="slf-togglebtn" style="margin-top:8px" data-action="add-exercise">' + icon("checkCircle", 16) + " Ajouter à mon pool</button>" +
      "</div>"
    );
  }

  function settingsTpl() {
    var installBlock = "";
    if (ui.installAvailable) {
      installBlock =
        '<p class="slf-mono slf-eyebrow" style="margin-bottom:8px">INSTALLATION</p>' +
        '<p class="slf-dim slf-settingsnote">Installe l\'app sur cet appareil pour l\'ouvrir comme une vraie application, en plein écran.</p>' +
        '<button class="slf-togglebtn on" data-action="install-app">' + icon("download2", 16) + " Installer l'application</button>" +
        '<div class="slf-settingsdivider"></div>';
    }
    return (
      '<div class="slf-window"><div class="slf-windowbody">' +

        installBlock +

        '<p class="slf-mono slf-eyebrow" style="margin-bottom:8px">PROFIL</p>' +
        '<input type="text" maxlength="20" id="slf-pseudo-input" class="slf-textinput" placeholder="Ton pseudo" value="' + esc(profile.pseudo) + '" />' +
        '<button class="slf-togglebtn" style="margin-top:8px" data-action="save-pseudo">Enregistrer le pseudo</button>' +

        '<div class="slf-settingsdivider"></div>' +
        '<p class="slf-mono slf-eyebrow" style="margin-bottom:8px">APPARENCE</p>' +
        '<p class="slf-dim slf-settingsnote">Couleur d\'accent de l\'interface.</p>' +
        '<div class="slf-themerow">' +
          THEMES.map(function (t) {
            var active = (profile.theme || "blue") === t.key;
            return '<button class="slf-themeswatch' + (active ? " active" : "") + '" data-action="set-theme" data-value="' + t.key + '" style="--swatch:' + t.color + '" aria-label="' + t.label + '"></button>';
          }).join("") +
        "</div>" +

        '<div class="slf-settingsdivider"></div>' +
        '<p class="slf-mono slf-eyebrow" style="margin-bottom:8px">EXERCICES</p>' +
        '<p class="slf-dim slf-settingsnote">Ton pool actuel. Tant qu\'il en compte 4, la quête reste automatique ; au-delà, tu choisis chaque jour lesquels faire.</p>' +
        exercisePoolListTpl() +
        addExerciseFormTpl() +

        '<div class="slf-settingsdivider"></div>' +
        '<p class="slf-mono slf-eyebrow" style="margin-bottom:8px">SON & VIBRATION</p>' +
        '<p class="slf-dim slf-settingsnote">Retour sonore/haptique quand tu coches un exercice, valides une séance ou montes de rang.</p>' +
        '<button class="slf-togglebtn' + (profile.fx.enabled ? " on" : "") + '" data-action="toggle-fx">' +
          icon(profile.fx.enabled ? "volume" : "volumeOff", 16) +
          (profile.fx.enabled ? " Activés" : " Désactivés") +
        "</button>" +

        '<div class="slf-settingsdivider"></div>' +
        '<p class="slf-mono slf-eyebrow" style="margin-bottom:8px">DONNÉES</p>' +
        '<p class="slf-dim slf-settingsnote">Sauvegarde ta progression dans un fichier, ou restaure-la sur un autre appareil.</p>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="slf-togglebtn" style="flex:1" data-action="export-data">' + icon("download", 16) + " Exporter</button>" +
          '<button class="slf-togglebtn" style="flex:1" data-action="trigger-import">' + icon("upload", 16) + " Importer</button>" +
        "</div>" +
        '<input type="file" accept="application/json" id="slf-import-input" data-action="import-file" style="display:none" />' +

        '<div class="slf-settingsdivider"></div>' +
        '<p class="slf-mono slf-eyebrow" style="margin-bottom:8px;color:var(--danger)">ZONE DANGER</p>' +
        '<p class="slf-dim slf-settingsnote">Efface streak, historique, objectifs et pseudo. Repart de zéro, comme une première installation.</p>' +
        '<button class="slf-togglebtn slf-danger-btn" data-action="reset-app">' + icon("alert", 16) + " Réinitialiser l'application</button>" +

        '<p class="slf-versiontag slf-mono">' + esc(APP_VERSION) + "</p>" +
      "</div></div>"
    );
  }

  function rankUpTpl() {
    if (!ui.rankUpFlash) return "";
    return '<div class="slf-rankup"><p class="slf-mono slf-eyebrow">◈ ASCENSION ◈</p><p class="slf-rankuptext">RANG ' + ui.rankUpFlash + " ATTEINT</p></div>";
  }

  function errorToastTpl() {
    return ui.error ? '<div class="slf-errortoast slf-mono">Sauvegarde impossible — réessaie.</div>' : "";
  }
  function hintToastTpl() {
    return ui.hintText ? '<div class="slf-hinttoast"><span class="slf-mono slf-eyebrow">INDICE</span><p>' + esc(ui.hintText) + "</p></div>" : "";
  }

  // ---------- render ----------
  function render() {
    var root = document.getElementById("root");
    var prevMain = root.querySelector(".slf-main");
    var prevScroll = prevMain ? prevMain.scrollTop : 0;
    var overlay = getActiveOverlay();
    var overlayHtml = "";
    if (overlay === "onboarding") overlayHtml = onboardingTpl();
    else if (overlay === "changelog") overlayHtml = changelogTpl();
    else if (overlay === "streak-broken") overlayHtml = streakBrokenTpl();
    else if (overlay === "welcome") overlayHtml = welcomeModalTpl();
    else if (overlay === "redemption-penalty") overlayHtml = redemptionPenaltyTpl();
    else if (overlay === "timer") overlayHtml = timerModalTpl();
    else if (overlay === "feedback") overlayHtml = feedbackModalTpl();

    var isSettings = ui.view === "settings";
    var isHistory = ui.view === "history";
    var headHtml = isSettings ? pageHeaderTpl("RÉGLAGES") : isHistory ? pageHeaderTpl("HISTORIQUE") : headerTpl();
    var mainHtml = isSettings ? settingsTpl() : isHistory ? historyTpl() : questTpl();
    var navHtml = ui.view === "quest" ? navTpl() : "";
    var backHtml = ui.view !== "quest" ? backArrowTpl() : "";

    root.innerHTML =
      '<div class="slf-phone">' +
        headHtml +
        backHtml +
        '<main class="slf-main">' + mainHtml + "</main>" +
        navHtml +
      "</div>" +
      overlayHtml +
      rankUpTpl() +
      errorToastTpl() +
      hintToastTpl();

    var newMain = root.querySelector(".slf-main");
    if (newMain && prevScroll) newMain.scrollTop = prevScroll;
  }

  // ---------- event delegation ----------
  document.addEventListener("click", function (e) {
    var overlay = e.target.closest(".slf-overlay");
    if (overlay && !e.target.closest("[data-stop]")) {
      var overlayAction = overlay.getAttribute("data-action");
      if (overlayAction === "close-feedback") ui.showFeedback = false;
      render();
      return;
    }
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");
    switch (action) {
      case "nav":
        ui.view = el.getAttribute("data-view");
        render();
        break;
      case "toggle-selection":
        toggleSelectionExo(el.getAttribute("data-key"));
        break;
      case "submit-selection":
        submitSelection();
        break;
      case "toggle-weakpoint":
        toggleWeakPoint();
        break;
      case "submit-weakpoint":
        submitWeakPoint();
        break;
      case "toggle-raid":
        toggleRaidExo(el.getAttribute("data-key"));
        break;
      case "submit-raid":
        submitRaid();
        break;
      case "open-timer":
        openTimer(el.getAttribute("data-key"));
        break;
      case "start-timer":
        startTimer();
        break;
      case "pause-timer":
        pauseTimer();
        break;
      case "reset-timer":
        resetTimer();
        break;
      case "close-timer":
        closeTimer();
        break;
      case "toggle-task":
        toggleTask(el.getAttribute("data-key"));
        break;
      case "open-feedback":
        openFeedback();
        break;
      case "set-feedback":
        setFeedback(el.getAttribute("data-key"), el.getAttribute("data-value"));
        break;
      case "submit-feedback":
        finishSession();
        break;
      case "use-joker":
        useJoker();
        break;
      case "install-app":
        installApp();
        break;
      case "reeval-answer":
        answerReeval(el.getAttribute("data-value"));
        break;
      case "submit-reeval":
        submitReeval();
        break;
      case "toggle-fx":
        toggleFx();
        break;
      case "click-rankbadge":
        handleRankBadgeClick();
        break;
      case "show-hint":
        showHint(el.getAttribute("data-key"));
        break;
      case "set-theme":
        setTheme(el.getAttribute("data-value"));
        break;
      case "set-newexo-unit":
        setNewExoUnit(el.getAttribute("data-value"));
        break;
      case "add-exercise":
        addExercise();
        break;
      case "remove-exercise":
        removeExercise(el.getAttribute("data-key"));
        break;
      case "export-data":
        exportData();
        break;
      case "trigger-import":
        var fi = document.getElementById("slf-import-input");
        if (fi) fi.click();
        break;
      case "save-pseudo":
        var pInput = document.getElementById("slf-pseudo-input");
        savePseudo(pInput ? pInput.value : "");
        break;
      case "reset-app":
        resetApp();
        break;
      case "onboard-name-next":
        onboardNameNext();
        break;
      case "onboard-name-skip":
        onboardNameSkip();
        break;
      case "onboard-difficulty":
        chooseDifficulty(el.getAttribute("data-value"));
        break;
      case "onboard-finish-custom":
        finishCustomOnboarding();
        break;
      case "dismiss-welcome":
        dismissWelcome();
        break;
      case "ack-changelog":
        ackChangelog();
        break;
      case "ack-redemption":
        ackRedemption();
        break;
      case "ack-broken":
        ackBroken();
        break;
    }
  });
  document.addEventListener("change", function (e) {
    var action = e.target.getAttribute("data-action");
    if (action === "reeval-set") setReevalValue(e.target.getAttribute("data-key"), e.target.value);
    if (action === "set-onboard-name") setOnboardName(e.target.value);
    if (action === "onboard-custom-set") setOnboardCustom(e.target.getAttribute("data-key"), e.target.value);
    if (action === "set-newexo-name") setNewExoName(e.target.value);
    if (action === "import-file") handleImportFile(e.target.files[0]);
  });
  // Surbrillance directe (sans re-render, pour ne pas perdre le curseur pendant la frappe)
  document.addEventListener("input", function (e) {
    if (e.target.id === "slf-pseudo-input") {
      var changed = e.target.value.trim() !== (profile.pseudo || "");
      e.target.classList.toggle("dirty", changed);
    }
  });

  ui.justBroken = checkAndApplyStreakBreak();
  if (profile.onboarded && profile.lastOpenCountedDate !== todayStr()) {
    profile = Object.assign({}, profile, {
      appOpenDaysCount: profile.appOpenDaysCount + 1,
      lastOpenCountedDate: todayStr(),
    });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch (e) { /* ignore */ }
  }
  applyTheme();
  updateAppBadge();
  render();
})();
