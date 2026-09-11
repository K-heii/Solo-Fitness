(function () {
  "use strict";

  var STORAGE_KEY = "solo-fit-profile-v1";
  var APP_VERSION = "v3.2 — alerte de série définitivement brisée (streak → 0)";

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
  var CAPS = { pushups: 60, squats: 60, abdos: 80, plank: 120 };
  var STEP = { pushups: 2, squats: 2, abdos: 3, plank: 5 };
  var REDEMPTION_MULT = 1.5;

  var EXO_META = {
    pushups: { label: "Pompes", unit: "", icon: "dumbbell" },
    squats: { label: "Squats", unit: "", icon: "activity" },
    abdos: { label: "Abdos", unit: "", icon: "layers" },
    plank: { label: "Gainage", unit: "s", icon: "timer" },
  };

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
  function redemptionTargets(t) {
    return {
      pushups: Math.min(CAPS.pushups, Math.ceil(t.pushups * REDEMPTION_MULT)),
      squats: Math.min(CAPS.squats, Math.ceil(t.squats * REDEMPTION_MULT)),
      abdos: Math.min(CAPS.abdos, Math.ceil(t.abdos * REDEMPTION_MULT)),
      plank: Math.min(CAPS.plank, Math.ceil(t.plank * REDEMPTION_MULT)),
    };
  }
  function defaultProfile() {
    return {
      pseudo: "",
      onboarded: false,
      streak: 0,
      best: 0,
      lastCompletedDate: null,
      lastWelcomeDate: null,
      targets: Object.assign({}, DEFAULT_TARGETS),
      history: [],
      fx: { enabled: true },
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
    checked: { pushups: false, squats: false, abdos: false, plank: false },
    showFeedback: false,
    showSettings: false,
    feedbackChoice: { pushups: null, squats: null, abdos: null, plank: null },
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
    rankUpFlash: null,
    error: false,
  };

  function loadProfile() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var loaded = raw ? JSON.parse(raw) : defaultProfile();
      var def = defaultProfile();
      var merged = Object.assign({}, def, loaded, {
        targets: Object.assign({}, DEFAULT_TARGETS, loaded.targets),
        fx: Object.assign({}, def.fx, loaded.fx),
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
    render();
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
    if (ui.justBroken) return "streak-broken";
    if (shouldShowWelcome()) return "welcome";
    if (getMode() === "redemption" && !ui.redemptionAck) return "redemption-penalty";
    if (ui.showFeedback) return "feedback";
    if (ui.showSettings) return "settings";
    return null;
  }
  function pseudo() {
    return profile.pseudo || "Chasseur";
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
    var keys = Object.keys(EXO_META);
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

  // ---------- actions : quête ----------
  function toggleTask(key) {
    var mode = getMode();
    if (mode !== "normal" && mode !== "redemption") return;
    ui.checked[key] = !ui.checked[key];
    if (ui.checked[key]) fxCheck();
    render();
  }
  function openFeedback() {
    var vals = Object.keys(ui.checked).map(function (k) { return ui.checked[k]; });
    if (vals.indexOf(false) !== -1) return;
    ui.feedbackChoice = { pushups: null, squats: null, abdos: null, plank: null };
    ui.showFeedback = true;
    render();
  }
  function setFeedback(key, value) {
    ui.feedbackChoice[key] = value;
    render();
  }
  function finishSession() {
    var keys = Object.keys(EXO_META);
    var complete = keys.every(function (k) { return ui.feedbackChoice[k] !== null; });
    if (!complete) return;

    var mode = getMode();
    var today = todayStr();
    var targets = mode === "redemption" ? redemptionTargets(profile.targets) : profile.targets;
    var wasRank = getRank(profile.streak).name;
    var newStreak = profile.streak + 1; // la rédemption conserve la streak
    var newBest = Math.max(profile.best, newStreak);

    var newTargets = {};
    keys.forEach(function (k) {
      var easy = ui.feedbackChoice[k] === "facile";
      newTargets[k] = easy ? Math.min(CAPS[k], profile.targets[k] + STEP[k]) : profile.targets[k];
    });

    var entry = {
      date: today,
      mode: mode,
      pushups: targets.pushups,
      squats: targets.squats,
      abdos: targets.abdos,
      plank: targets.plank,
      feedback: Object.assign({}, ui.feedbackChoice),
      rank: getRank(newStreak).name,
    };
    var next = Object.assign({}, profile, {
      streak: newStreak,
      best: newBest,
      lastCompletedDate: today,
      targets: newTargets,
      history: [entry].concat(profile.history),
    });
    ui.showFeedback = false;
    ui.checked = { pushups: false, squats: false, abdos: false, plank: false };
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
    }
    render();
  }
  function setReevalValue(key, raw) {
    var val = parseFloat(raw);
    ui.reevalValues[key] = isNaN(val) ? null : val;
  }
  function submitReeval() {
    var keys = Object.keys(EXO_META);
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

    var newTargets = {};
    keys.forEach(function (k) {
      var isPlank = k === "plank";
      var bump = reevalBump(v[k], profile.targets[k], isPlank);
      newTargets[k] = Math.min(CAPS[k], profile.targets[k] + bump);
    });

    var entry = {
      date: today,
      mode: "reeval",
      pushups: v.pushups,
      squats: v.squats,
      abdos: v.abdos,
      plank: v.plank,
      feedback: null,
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
      });
      ui.showSettings = false;
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
    ui.checked = { pushups: false, squats: false, abdos: false, plank: false };
    ui.showFeedback = false;
    ui.showSettings = false;
    ui.feedbackChoice = { pushups: null, squats: null, abdos: null, plank: null };
    ui.reevalAnswered = { date: null, answer: null };
    ui.reevalValues = {};
    ui.reevalError = false;
    ui.redemptionAck = false;
    ui.onboardStep = 1;
    ui.onboardMode = "choose";
    ui.onboardName = "";
    ui.onboardCustom = {};
    ui.onboardCustomError = false;
    ui.rankUpFlash = null;
    ui.error = false;
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
      var rows = Object.keys(EXO_META).map(function (k) { return numberRowTpl(k, "onboard-custom-set", ui.onboardCustom); }).join("");
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

  function welcomeModalTpl() {
    return (
      '<div class="slf-overlay"><div class="slf-modal" data-stop="1">' +
        '<p class="slf-mono slf-eyebrow">◈ CONNEXION ÉTABLIE ◈</p>' +
        '<h2 class="slf-modaltitle">Bon retour, ' + esc(pseudo()) + ".</h2>" +
        '<p class="slf-dim" style="margin-bottom:16px">Le Système t\'attendait. Prêt pour les quêtes du jour ?</p>' +
        '<button class="slf-cta" data-action="dismiss-welcome">Entrer</button>' +
      "</div></div>"
    );
  }

  function redemptionPenaltyTpl() {
    return (
      '<div class="slf-overlay"><div class="slf-modal slf-modal-danger" data-stop="1">' +
        '<p class="slf-mono slf-eyebrow" style="color:var(--danger)">' + icon("alert", 13, { color: "var(--danger)" }) + " ◈ ALERTE SYSTÈME ◈</p>" +
        '<h2 class="slf-modaltitle">' + esc(pseudo()) + ", ta série a été brisée.</h2>" +
        '<p class="slf-dim" style="margin-bottom:16px">Mais rien n\'est perdu : réussis la quête de rédemption et ta légende continue.</p>' +
        '<button class="slf-cta" data-action="ack-redemption">J\'affronte la rédemption</button>' +
      "</div></div>"
    );
  }

  function streakBrokenTpl() {
    return (
      '<div class="slf-overlay"><div class="slf-modal slf-modal-danger" data-stop="1">' +
        '<p class="slf-mono slf-eyebrow" style="color:var(--danger)">' + icon("alert", 13, { color: "var(--danger)" }) + " ◈ SÉRIE PERDUE ◈</p>" +
        '<h2 class="slf-modaltitle">' + esc(pseudo()) + ", ta série est brisée."  + "</h2>" +
        '<p class="slf-dim" style="margin-bottom:16px">Le délai de rédemption est passé. Ton compteur repart de zéro — mais chaque grand chasseur a connu une chute. Relève-toi.</p>' +
        '<button class="slf-cta" data-action="ack-broken">Je me relève</button>' +
      "</div></div>"
    );
  }

  // ---------- templates : quête ----------
  function headerTpl() {
    var today = todayStr();
    var rank = getRank(profile.streak);
    return (
      '<header class="slf-header">' +
        '<div class="slf-rankbadge" style="--glow:' + rank.glow + '">' + icon("hexagon", 40) + '<span class="slf-rankletter">' + rank.name + "</span></div>" +
        '<div class="slf-headerinfo">' +
          '<p class="slf-mono slf-eyebrow">' + esc(rank.label.toUpperCase()) + " · RANG " + rank.name + "</p>" +
          '<div class="slf-streakrow">' + icon("flame", 16, { color: "#ff9d4d" }) + '<span class="slf-mono slf-streaknum">' + profile.streak + '</span><span class="slf-dim">jours</span></div>' +
        "</div>" +
        '<div class="slf-headerright">' +
          '<div class="slf-datebadge slf-mono">' + esc(today.slice(5).replace("-", "/")) + "</div>" +
          '<button class="slf-bellbtn" data-action="open-settings" aria-label="Réglages">' +
            icon("gear", 16) +
          "</button>" +
        "</div>" +
      "</header>"
    );
  }

  function taskRowTpl(key, targets, mode) {
    var meta = EXO_META[key];
    var isChecked = ui.checked[key];
    var disabled = mode === "done";
    return (
      '<button class="slf-taskrow' + (isChecked ? " done" : "") + '" ' + (disabled ? "" : 'data-action="toggle-task" data-key="' + key + '"') + '>' +
        '<div class="slf-taskicon">' + icon(meta.icon, 18) + "</div>" +
        '<div class="slf-taskinfo"><p class="slf-tasklabel">' + esc(meta.label) + '</p><p class="slf-mono slf-tasktarget">' + targets[key] + esc(meta.unit) + "</p></div>" +
        (isChecked ? icon("checkCircle", 22, { color: "#2fd7ff" }) : icon("circle", 22, { color: "#28425e" })) +
      "</button>"
    );
  }

  function numberRowTpl(key, action, valuesObj) {
    var meta = EXO_META[key];
    var val = valuesObj[key];
    return (
      '<div class="slf-taskrow">' +
        '<div class="slf-taskicon">' + icon(meta.icon, 18) + "</div>" +
        '<div class="slf-taskinfo"><p class="slf-tasklabel">' + esc(meta.label) + "</p></div>" +
        '<input type="number" min="0" inputmode="numeric" class="slf-numinput" placeholder="' + (meta.unit === "s" ? "sec" : "reps") + '" data-action="' + action + '" data-key="' + key + '" value="' + (typeof val === "number" ? val : "") + '" />' +
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
    var rows = Object.keys(EXO_META).map(function (k) { return numberRowTpl(k, "reeval-set", ui.reevalValues); }).join("");
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
    var mode = getMode();

    if (mode === "reeval-prompt") return reevalPromptTpl();
    if (mode === "reeval") return reevalFormTpl();

    var targets = mode === "redemption" ? redemptionTargets(profile.targets) : profile.targets;

    if (mode === "done") {
      var last = profile.history[0];
      var chips = Object.keys(EXO_META).map(function (k) {
        var meta = EXO_META[k];
        return '<div class="slf-targetchip">' + icon(meta.icon, 14) + '<span class="slf-mono">' + profile.targets[k] + esc(meta.unit) + '</span><span class="slf-dim">' + esc(meta.label) + "</span></div>";
      }).join("");
      var subMsg = "";
      if (last) {
        if (last.mode === "reeval") {
          subMsg = "Nouveaux objectifs définis après réévaluation.";
        } else {
          var anyEasy = last.feedback && Object.keys(last.feedback).some(function (k) { return last.feedback[k] === "facile"; });
          subMsg = anyEasy ? "Objectifs ajustés selon ton ressenti par exercice." : "Même intensité demain.";
        }
      }
      return (
        '<div class="slf-window"><div class="slf-windowhead"><span class="slf-mono">◈ QUÊTE ACCOMPLIE ◈</span></div>' +
        '<div class="slf-windowbody slf-donebody">' +
          icon("checkCircle", 40, { color: "#2fd7ff" }) +
          '<p class="slf-donetext">Séance validée pour aujourd\'hui, ' + esc(pseudo()) + ".</p>" +
          (subMsg ? '<p class="slf-dim">' + subMsg + "</p>" : "") +
          '<div class="slf-nexttargets"><p class="slf-mono slf-eyebrow">DEMAIN</p><div class="slf-targetrow">' + chips + "</div></div>" +
          rankProgressTpl() +
        "</div></div>"
      );
    }

    var isRedemption = mode === "redemption";
    var rows = Object.keys(EXO_META).map(function (k) { return taskRowTpl(k, targets, mode); }).join("");
    var doneCount = Object.keys(ui.checked).filter(function (k) { return ui.checked[k]; }).length;
    var allChecked = doneCount === Object.keys(ui.checked).length;

    return (
      '<div class="slf-window' + (isRedemption ? " danger" : "") + '">' +
        '<div class="slf-windowhead"><span class="slf-mono">' + (isRedemption ? "◈ QUÊTE DE RÉDEMPTION ◈" : "◈ QUÊTE QUOTIDIENNE ◈") + "</span></div>" +
        '<div class="slf-windowbody">' +
          (isRedemption ? '<p class="slf-redemptionnote">Pénalité : +50% de reps. Complète cette quête pour continuer ta série.</p>' : "") +
          rows +
          '<div class="slf-progressbar"><div class="slf-progressfill" style="width:' + ((doneCount / 4) * 100) + '%"></div></div>' +
          '<button class="slf-cta" ' + (allChecked ? 'data-action="open-feedback"' : "disabled") + ">Terminer la séance</button>" +
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

      var rightIcons;
      if (h.mode === "reeval") {
        rightIcons = icon("trendingUp", 14, { color: "#ffd76a" });
      } else if (h.feedback) {
        rightIcons = Object.keys(EXO_META).map(function (k) {
          var easy = h.feedback[k] === "facile";
          return icon(easy ? "zap" : "wind", 12, { color: easy ? "#2fd7ff" : "#8b9fb5" });
        }).join("");
      } else {
        rightIcons = "";
      }

      return (
        '<div class="slf-histrow2">' +
          '<div class="slf-histtop">' +
            '<span class="slf-mono">' + esc(h.date.slice(5).replace("-", "/")) + "</span>" +
            modePill +
            '<span class="slf-rankpill" style="color:' + rank.glow + ";border-color:" + rank.glow + ';margin-left:auto">' + h.rank + "</span>" +
          "</div>" +
          '<div class="slf-histbottom">' +
            '<span class="slf-mono slf-dim">' + h.pushups + "P · " + h.squats + "Sq · " + h.abdos + "Ab · " + h.plank + "s</span>" +
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
        '<button class="slf-navbtn' + (ui.view === "history" ? " active" : "") + '" data-action="nav" data-view="history">' + icon("scroll", 18) + "<span>Historique</span></button>" +
      "</nav>"
    );
  }

  function feedbackModalTpl() {
    var rows = Object.keys(EXO_META).map(function (k) {
      var meta = EXO_META[k];
      var choice = ui.feedbackChoice[k];
      return (
        '<div class="slf-fbrow">' +
          '<div class="slf-fbrowlabel">' + icon(meta.icon, 16) + "<span>" + esc(meta.label) + "</span></div>" +
          '<div class="slf-fbrowbtns">' +
            '<button class="slf-fbtoggle easy' + (choice === "facile" ? " active" : "") + '" data-action="set-feedback" data-key="' + k + '" data-value="facile">' + icon("zap", 14) + "<span>Facile</span></button>" +
            '<button class="slf-fbtoggle hard' + (choice === "essouffle" ? " active" : "") + '" data-action="set-feedback" data-key="' + k + '" data-value="essouffle">' + icon("wind", 14) + "<span>Essoufflé</span></button>" +
          "</div>" +
        "</div>"
      );
    }).join("");
    var complete = Object.keys(EXO_META).every(function (k) { return ui.feedbackChoice[k] !== null; });
    return (
      '<div class="slf-overlay" data-action="close-feedback"><div class="slf-modal" data-stop="1">' +
        '<p class="slf-mono slf-eyebrow">FIN DE SÉANCE</p><h2 class="slf-modaltitle">Comment t\'es-tu senti, exercice par exercice ?</h2>' +
        '<p class="slf-dim" style="margin-bottom:6px">Facile = tu augmentes cet exercice demain. Essoufflé = tu gardes le même niveau.</p>' +
        rows +
        '<button class="slf-cta" style="margin-top:14px" ' + (complete ? 'data-action="submit-feedback"' : "disabled") + ">Valider</button>" +
      "</div></div>"
    );
  }

  function settingsModalTpl() {
    return (
      '<div class="slf-overlay" data-action="close-settings"><div class="slf-modal" data-stop="1">' +
        '<div class="slf-modalheadrow"><p class="slf-mono slf-eyebrow">RÉGLAGES</p><button class="slf-closebtn" data-action="close-settings">' + icon("x", 16) + "</button></div>" +

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

  // ---------- render ----------
  function render() {
    var root = document.getElementById("root");
    var overlay = getActiveOverlay();
    var overlayHtml = "";
    if (overlay === "onboarding") overlayHtml = onboardingTpl();
    else if (overlay === "streak-broken") overlayHtml = streakBrokenTpl();
    else if (overlay === "welcome") overlayHtml = welcomeModalTpl();
    else if (overlay === "redemption-penalty") overlayHtml = redemptionPenaltyTpl();
    else if (overlay === "feedback") overlayHtml = feedbackModalTpl();
    else if (overlay === "settings") overlayHtml = settingsModalTpl();

    root.innerHTML =
      '<div class="slf-phone">' +
        headerTpl() +
        '<main class="slf-main">' + (ui.view === "quest" ? questTpl() : historyTpl()) + "</main>" +
        navTpl() +
      "</div>" +
      overlayHtml +
      rankUpTpl() +
      errorToastTpl();
  }

  // ---------- event delegation ----------
  document.addEventListener("click", function (e) {
    var overlay = e.target.closest(".slf-overlay");
    if (overlay && !e.target.closest("[data-stop]")) {
      var overlayAction = overlay.getAttribute("data-action");
      if (overlayAction === "close-feedback") ui.showFeedback = false;
      if (overlayAction === "close-settings") ui.showSettings = false;
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
      case "reeval-answer":
        answerReeval(el.getAttribute("data-value"));
        break;
      case "submit-reeval":
        submitReeval();
        break;
      case "open-settings":
        ui.showSettings = true;
        render();
        break;
      case "close-settings":
        ui.showSettings = false;
        render();
        break;
      case "toggle-fx":
        toggleFx();
        break;
      case "export-data":
        exportData();
        break;
      case "trigger-import":
        var fi = document.getElementById("slf-import-input");
        if (fi) fi.click();
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
    if (action === "import-file") handleImportFile(e.target.files[0]);
  });

  ui.justBroken = checkAndApplyStreakBreak();
  render();
})();
