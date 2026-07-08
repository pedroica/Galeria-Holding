// block_xp.js — s0 (loadScript)
// Motor de XP para gamificação de cadastro de decisores
(function() {
  var KEY = "gh_xp_v1";
  var DAILY_GOAL = 10;

  var LEVELS = [
    { min: 0,    nome: "Prospector",   icon: "🌱" },
    { min: 100,  nome: "Caçador",      icon: "🎯" },
    { min: 300,  nome: "Estrategista", icon: "⚡" },
    { min: 600,  nome: "Deal Maker",   icon: "💼" },
    { min: 1000, nome: "Top Gun",      icon: "🚀" },
    { min: 2000, nome: "Lenda",        icon: "🏆" },
  ];

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function ghXpState() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : { xp: 0, streak: 0, history: [] };
    } catch(e) { return { xp: 0, streak: 0, history: [] }; }
  }

  function saveState(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch(e) {}
  }

  function getLevelInfo(xp) {
    var cur = LEVELS[0]; var curIdx = 0;
    for (var i = 0; i < LEVELS.length; i++) {
      if (xp >= LEVELS[i].min) { cur = LEVELS[i]; curIdx = i; }
    }
    var next = curIdx + 1 < LEVELS.length ? LEVELS[curIdx + 1] : null;
    var prev = LEVELS[curIdx];
    return { cur: cur, next: next, lvIndex: curIdx, prev: prev };
  }

  function ghXpAward(qtd, source) {
    qtd = qtd || 1;
    source = source || "manual";

    var s = ghXpState();
    var d = todayStr();

    if (!s.history) s.history = [];
    if (!s.xp) s.xp = 0;
    if (!s.streak) s.streak = 0;

    // Flush yesterday if new day
    if (!s.today || s.today.date !== d) {
      if (s.today && s.today.count > 0) {
        var old = s.history.find(function(h) { return h.date === s.today.date; });
        if (!old) s.history.push({ date: s.today.date, count: s.today.count, xp: s.today.xpEarned || 0 });
      }
      s.today = { date: d, count: 0, xpEarned: 0 };
    }

    // XP per decisor by source
    var xpTable = { lusha: 10, hunter: 6, csv: 4, crawler: 2, manual: 5 };
    var xpPer = xpTable[source] || 5;
    var earned = qtd * xpPer;

    var prevCount = s.today.count || 0;
    s.today.count = prevCount + qtd;
    s.today.xpEarned = (s.today.xpEarned || 0) + earned;
    s.xp += earned;

    // Daily goal bonus
    var goalBonus = 0;
    if (prevCount < DAILY_GOAL && s.today.count >= DAILY_GOAL) {
      goalBonus = 20;

      var yDate = new Date();
      yDate.setDate(yDate.getDate() - 1);
      var yd = yDate.toISOString().slice(0, 10);

      if (s.lastGoalDate === yd) {
        s.streak = (s.streak || 0) + 1;
      } else if (s.lastGoalDate !== d) {
        s.streak = 1;
      }
      s.lastGoalDate = d;

      // Streak bonus: +5 per consecutive day above 1, max +30
      goalBonus += Math.min((s.streak - 1) * 5, 30);
      s.xp += goalBonus;
      s.today.xpEarned += goalBonus;

      window.dispatchEvent(new CustomEvent("gh:xp:goal", {
        detail: { streak: s.streak, bonus: goalBonus }
      }));
    }

    // Upsert today in history
    var hist = s.history.find(function(h) { return h.date === d; });
    if (hist) {
      hist.count = s.today.count;
      hist.xp = s.today.xpEarned;
    } else {
      s.history.push({ date: d, count: s.today.count, xp: s.today.xpEarned });
    }
    if (s.history.length > 30) s.history = s.history.slice(-30);

    saveState(s);

    window.dispatchEvent(new CustomEvent("gh:xp:update", { detail: Object.assign({}, s) }));
    return s;
  }

  window.ghXpAward       = ghXpAward;
  window.ghXpState       = ghXpState;
  window.GH_XP_DAILY_GOAL = DAILY_GOAL;
  window.ghXpLevels      = LEVELS;
  window.ghXpGetLevelInfo = getLevelInfo;

  // Listen for decisor events dispatched from any module
  window.addEventListener("gh:decisor:added", function(e) {
    var d = e.detail || {};
    ghXpAward(d.qtd || 1, d.source || "manual");
  });
})();
