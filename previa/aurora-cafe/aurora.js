/* Aurora Café — prévia. Selo "aberto agora", dia de hoje na tabela e chips do cardápio. */
(function () {
  "use strict";
  var TZ = "America/Sao_Paulo";
  var OPEN = 10 * 60, CLOSE = 19 * 60;            // minutos desde 0h
  var DAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function nowInTZ() {
    var parts = {};
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
      var wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
      if (wd < 0) throw 0;
      return { d: wd, m: (+parts.hour % 24) * 60 + (+parts.minute) };
    } catch (e) {
      var n = new Date(Date.now() - 3 * 3600e3); // Brasília: UTC-3 (sem horário de verão)
      return { d: n.getUTCDay(), m: n.getUTCHours() * 60 + n.getUTCMinutes() };
    }
  }
  var isOpenDay = function (d) { return d >= 1 && d <= 6; };

  function statusText(t) {
    if (isOpenDay(t.d) && t.m >= OPEN && t.m < CLOSE) {
      return { open: true, text: CLOSE - t.m <= 60 ? "Aberto agora · fecha às 19h" : "Aberto agora · até as 19h" };
    }
    if (isOpenDay(t.d) && t.m < OPEN) return { open: false, text: "Fechado · abre hoje às 10h" };
    var next = (t.d + 1) % 7;
    while (!isOpenDay(next)) next = (next + 1) % 7;
    var when = next === 1 ? "segunda" : next === (t.d + 1) % 7 ? "amanhã" : DAYS[next];
    return { open: false, text: "Fechado · abre " + when + " às 10h" };
  }

  function update() {
    var t = nowInTZ(), s = statusText(t);
    var el = document.getElementById("status"), tx = document.getElementById("status-t");
    if (el && tx) { el.setAttribute("data-state", s.open ? "open" : "closed"); tx.textContent = s.text; }
    var rows = document.querySelectorAll("#htable tr[data-d]");
    for (var i = 0; i < rows.length; i++) {
      var today = +rows[i].getAttribute("data-d") === t.d;
      rows[i].classList.toggle("today", today);
      if (today) rows[i].setAttribute("aria-current", "date"); else rows[i].removeAttribute("aria-current");
    }
  }
  update();
  setInterval(update, 60e3);

  // categoria ativa conforme a rolagem
  var box = document.getElementById("chips");
  if (box && "IntersectionObserver" in window) {
    var chips = box.querySelectorAll("a");
    var setActive = function (id) {
      var a = box.querySelector('a[href="#cat-' + id + '"]');
      if (!a || a.getAttribute("aria-current") === "true") return;
      for (var i = 0; i < chips.length; i++) chips[i].setAttribute("aria-current", "false");
      a.setAttribute("aria-current", "true");
      var left = a.offsetLeft - box.clientWidth / 2 + a.clientWidth / 2;
      if (box.scrollTo) box.scrollTo({ left: left, behavior: reduce ? "auto" : "smooth" }); else box.scrollLeft = left;
    };
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) setActive(e.target.getAttribute("data-cat")); });
    }, { rootMargin: "-35% 0px -60% 0px" });
    document.querySelectorAll(".mcat").forEach(function (c) { spy.observe(c); });
  }
})();
