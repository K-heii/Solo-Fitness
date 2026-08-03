(function () {
  "use strict";

  var STORAGE_KEY = "solo-fit-profile-v1";

  var RANKS = [
    { name: "E", min: 0, glow: "#3ab6ff", label: "Éveillé" },
    { name: "D", min: 3, glow: "#2fd7ff", label: "Novice" },
    { name: "C", min: 7, glow: "#31e0c8", label: "Confirmé" },
    { name: "B", min: 14, glow: "#8b7bff", label: "Vétéran" },
    { name: "A", min: 30, glow: "#d16bff", label: "Elite" },
    { name: "S", min: 60, glow: "#ffd76a", label: "Monarque" },
  ];

  var DEFAULT_TARGETS = { pushups: 10, squats: 10, abdos: 15, plank: 15 };
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
      streak: 0,
      best: 0,
      lastCompletedDate: null,
      targets: Object.assign({}, DEFAULT_TARGETS),
      history: [],
      reminder: { enabled: false, time: "18:00" },
      lastNotifiedDate: null,
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
    bell: '<path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" fill="none"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0" fill="none"/>',
    bellOff: '<path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" fill="none"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0" fill="none"/><line x1="3" y1="3" x2="21" y2="21"/>',
    x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    checkCircle: '<circle cx="12" cy="12" r="9" fill="none"/><polyline points="8,12.5 11,15.5 16,9" fill="none"/>',
    circle: '<circle cx="12" cy="12" r="9" fill="none"/>',
    zap: '<polygon points="13,2 4,14 11,14 9,22 20,10 13,10" fill="currentColor" stroke="none"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3" fill="none"/><path d="M3 16h15a3 3 0 1 1-3 3" fill="none"/>',
    sword: '<line x1="5" y1="19" x2="16" y2="8"/><polyline points="14,6 18,4 20,6 16,10" fill="none"/><line x1="4" y1="16" x2="7" y2="19"/>',
    scroll: '<rect x="5" y="4" width="14" height="16" rx="2" fill="none"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/>',
    trendingUp: '<polyline points="3,17 9,11 13,15 21,6" fill="none"/><polyline points="15,6 21,6 21,12" fill="none"/>',
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
    rankUpFlash: null,
    error: false,
    notifPermission: "Notification" in window ? Notification.permission : "unsupported",
  };

  function loadProfile() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var loaded = raw ? JSON.parse(raw) : defaultProfile();
      var def = defaultProfile();
      return Object.assign({}, def, loaded, {
        targets: Object.assign({}, DEFAULT_TARGETS, loaded.targets),
        reminder: Object.assign({}, def.reminder, loaded.reminder),
      });
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
    if (profile.lastCompletedDate) {
      var diff = daysBetween(profile.lastCompletedDate, today);
      if (diff > 1) return "redemption";
    }
    return "normal";
  }

  // ---------- actions ----------
  function toggleTask(key) {
    if (getMode() === "done") return;
    ui.checked[key] = !ui.checked[key];
    render();
  }
  function openFeedback() {
    var vals = Object.keys(ui.checked).map(function (k) { return ui.checked[k]; });
    if (vals.indexOf(false) !== -1) return;
    ui.showFeedback = true;
    render();
  }
  function finish(feedback) {
    var mode = getMode();
    var today = todayStr();
    var targets = mode === "redemption" ? redemptionTargets(profile.targets) : profile.targets;
    var wasRank = getRank(profile.streak).name;
    var newStreak = mode === "redemption" ? 1 : profile.streak + 1;
    var newBest = Math.max(profile.best, newStreak);
    var newTargets = profile.targets;
    if (mode === "normal" && feedback === "facile") {
      newTargets = {
        pushups: Math.min(CAPS.pushups, profile.targets.pushups + STEP.pushups),
        squats: Math.min(CAPS.squats, profile.targets.squats + STEP.squats),
        abdos: Math.min(CAPS.abdos, profile.targets.abdos + STEP.abdos),
        plank: Math.min(CAPS.plank, profile.targets.plank + STEP.plank),
      };
    }
    var entry = {
      date: today,
      mode: mode,
      pushups: targets.pushups,
      squats: targets.squats,
      abdos: targets.abdos,
      plank: targets.plank,
      feedback: feedback,
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
    var newRank = getRank(newStreak).name;
    saveProfile(next);
    if (newRank !== wasRank) {
      ui.rankUpFlash = newRank;
      render();
      setTimeout(function () {
        ui.rankUpFlash = null;
        render();
      }, 3200);
    }
  }
  function setReminderTime(t) {
    saveProfile(Object.assign({}, profile, { reminder: Object.assign({}, profile.reminder, { time: t }) }));
  }
  function toggleReminder() {
    saveProfile(Object.assign({}, profile, { reminder: Object.assign({}, profile.reminder, { enabled: !profile.reminder.enabled }) }));
  }
  function requestNotifPermission() {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(function (perm) {
      ui.notifPermission = perm;
      if (perm === "granted") {
        saveProfile(Object.assign({}, profile, { reminder: Object.assign({}, profile.reminder, { enabled: true }) }));
      } else {
        render();
      }
    });
  }
  function checkReminder() {
    if (!profile.reminder || !profile.reminder.enabled) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    var now = new Date();
    var nowTime = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    var today = todayStr();
    var alreadyDone = profile.lastCompletedDate === today;
    var alreadyNotified = profile.lastNotifiedDate === today;
    if (!alreadyDone && !alreadyNotified && nowTime >= profile.reminder.time) {
      try {
        new Notification("Quête en attente, Chasseur", {
          body: "Ta quête quotidienne n'est pas terminée. Ne brise pas ta série.",
          icon: "icon-192.png",
        });
      } catch (e) { /* ignore */ }
      saveProfile(Object.assign({}, profile, { lastNotifiedDate: today }));
    }
  }
  setInterval(checkReminder, 30000);

  // ---------- templates ----------
  function headerTpl() {
    var today = todayStr();
    var rank = getRank(profile.streak);
    var bellActive = profile.reminder.enabled && ui.notifPermission === "granted";
    return (
      '<header class="slf-header">' +
        '<div class="slf-rankbadge" style="--glow:' + rank.glow + '">' + icon("hexagon", 40) + '<span class="slf-rankletter">' + rank.name + "</span></div>" +
        '<div class="slf-headerinfo">' +
          '<p class="slf-mono slf-eyebrow">' + esc(rank.label.toUpperCase()) + " · RANG " + rank.name + "</p>" +
          '<div class="slf-streakrow">' + icon("flame", 16, { color: "#ff9d4d" }) + '<span class="slf-mono slf-streaknum">' + profile.streak + '</span><span class="slf-dim">jours</span></div>' +
        "</div>" +
        '<div class="slf-headerright">' +
          '<div class="slf-datebadge slf-mono">' + esc(today.slice(5).replace("-", "/")) + "</div>" +
          '<button class="slf-bellbtn' + (bellActive ? " active" : "") + '" data-action="open-settings" aria-label="Réglages du rappel">' +
            icon(bellActive ? "bell" : "bellOff", 16) +
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

  function questTpl() {
    var mode = getMode();
    var targets = mode === "redemption" ? redemptionTargets(profile.targets) : profile.targets;

    if (mode === "done") {
      var last = profile.history[0];
      var chips = Object.keys(EXO_META).map(function (k) {
        var meta = EXO_META[k];
        return '<div class="slf-targetchip">' + icon(meta.icon, 14) + '<span class="slf-mono">' + profile.targets[k] + esc(meta.unit) + '</span><span class="slf-dim">' + esc(meta.label) + "</span></div>";
      }).join("");
      return (
        '<div class="slf-window"><div class="slf-windowhead"><span class="slf-mono">◈ QUÊTE ACCOMPLIE ◈</span></div>' +
        '<div class="slf-windowbody slf-donebody">' +
          icon("checkCircle", 40, { color: "#2fd7ff" }) +
          '<p class="slf-donetext">Séance validée pour aujourd\'hui, Chasseur.</p>' +
          (last ? '<p class="slf-dim">' + (last.feedback === "facile" ? "Difficulté augmentée pour demain." : "Même intensité demain.") + "</p>" : "") +
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
          (isRedemption ? '<p class="slf-redemptionnote">Série brisée. Pénalité : +50% de reps. Complète cette quête pour relancer ton streak à 1.</p>' : "") +
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
      return (
        '<div class="slf-histrow">' +
          '<div class="slf-histdate"><span class="slf-mono">' + esc(h.date.slice(5).replace("-", "/")) + "</span>" +
            (h.mode === "redemption" ? '<span class="slf-pill danger">RÉDEMPTION</span>' : "") +
          "</div>" +
          '<div class="slf-histexos"><span class="slf-mono slf-dim">' + h.pushups + "P · " + h.squats + "Sq · " + h.abdos + "Ab · " + h.plank + "s</span></div>" +
          '<div class="slf-histright">' +
            icon(h.feedback === "facile" ? "zap" : "wind", 16, { color: h.feedback === "facile" ? "#2fd7ff" : "#8b9fb5" }) +
            '<span class="slf-rankpill" style="color:' + rank.glow + ";border-color:" + rank.glow + '">' + h.rank + "</span>" +
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
          ? '<div class="slf-empty"><p class="slf-donetext">Aucune quête accomplie.</p><p class="slf-dim">Commence ton ascension, Chasseur.</p></div>'
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
    if (!ui.showFeedback) return "";
    return (
      '<div class="slf-overlay" data-action="close-feedback"><div class="slf-modal" data-stop="1">' +
        '<p class="slf-mono slf-eyebrow">FIN DE SÉANCE</p><h2 class="slf-modaltitle">Comment t\'es-tu senti ?</h2>' +
        '<button class="slf-feedbackbtn easy" data-action="finish" data-feedback="facile">' + icon("zap", 20) +
          '<div><p class="slf-fbtitle">Facile</p><p class="slf-fbsub">Prêt·e pour plus dur</p></div></button>' +
        '<button class="slf-feedbackbtn hard" data-action="finish" data-feedback="essouffle">' + icon("wind", 20) +
          '<div><p class="slf-fbtitle">Essoufflé·e</p><p class="slf-fbsub">Même intensité demain</p></div></button>' +
      "</div></div>"
    );
  }

  function settingsModalTpl() {
    if (!ui.showSettings) return "";
    var perm = ui.notifPermission;
    var body = "";
    if (perm === "unsupported") {
      body = '<p class="slf-dim slf-settingsnote">Les notifications ne sont pas prises en charge dans ce navigateur.</p>';
    } else {
      body =
        '<p class="slf-dim slf-settingsnote">Reçois un rappel si ta quête n\'est pas terminée à l\'heure choisie. Fonctionne tant que cette page reste ouverte ou en arrière-plan sur ton téléphone.</p>' +
        '<div class="slf-settingrow"><span>Heure du rappel</span><input type="time" class="slf-timeinput" data-action="set-time" value="' + esc(profile.reminder.time) + '" /></div>';
      if (perm === "granted") {
        body += '<button class="slf-togglebtn' + (profile.reminder.enabled ? " on" : "") + '" data-action="toggle-reminder">' + icon(profile.reminder.enabled ? "bell" : "bellOff", 16) + (profile.reminder.enabled ? " Rappel activé" : " Rappel désactivé") + "</button>";
      } else if (perm === "denied") {
        body += '<p class="slf-settingsnote danger">Notifications bloquées. Autorise-les dans les réglages de ton navigateur pour ce site.</p>';
      } else {
        body += '<button class="slf-togglebtn" data-action="request-notif">' + icon("bell", 16) + " Autoriser les notifications</button>";
      }
    }
    return (
      '<div class="slf-overlay" data-action="close-settings"><div class="slf-modal" data-stop="1">' +
        '<div class="slf-modalheadrow"><p class="slf-mono slf-eyebrow">RAPPEL QUOTIDIEN</p><button class="slf-closebtn" data-action="close-settings">' + icon("x", 16) + "</button></div>" +
        body +
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
    root.innerHTML =
      '<div class="slf-phone">' +
        headerTpl() +
        '<main class="slf-main">' + (ui.view === "quest" ? questTpl() : historyTpl()) + "</main>" +
        navTpl() +
      "</div>" +
      feedbackModalTpl() +
      settingsModalTpl() +
      rankUpTpl() +
      errorToastTpl();
  }

  // ---------- event delegation ----------
  document.addEventListener("click", function (e) {
    var overlay = e.target.closest(".slf-overlay");
    if (overlay && !e.target.closest("[data-stop]")) {
      var action = overlay.getAttribute("data-action");
      if (action === "close-feedback") ui.showFeedback = false;
      if (action === "close-settings") ui.showSettings = false;
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
      case "finish":
        finish(el.getAttribute("data-feedback"));
        break;
      case "open-settings":
        ui.showSettings = true;
        render();
        break;
      case "close-settings":
        ui.showSettings = false;
        render();
        break;
      case "toggle-reminder":
        toggleReminder();
        break;
      case "request-notif":
        requestNotifPermission();
        break;
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.getAttribute("data-action") === "set-time") {
      setReminderTime(e.target.value);
    }
  });

  render();
})();
