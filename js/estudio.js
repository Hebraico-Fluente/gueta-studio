/* Gueta Studio · páginas de trabalhos. Sem dependências; a página funciona igual sem JS. */
(() => {
  const $$ = s => [...document.querySelectorAll(s)];
  $$("[data-year]").forEach(e => e.textContent = new Date().getFullYear());
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* vídeos: só baixam e tocam quando aparecem; com "reduzir movimento" ficam parados, com controles */
  const vids = $$("[data-v]");
  if (reduceMotion) vids.forEach(v => { v.controls = true; });
  else {
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        const v = e.target;
        if (e.isIntersecting) { if (v.dataset.hold === "1") return; if (v.preload === "none") { v.preload = "auto"; v.load(); } v.play().catch(() => {}); }
        else v.pause();
      }), {threshold: .25});
      vids.forEach(v => io.observe(v));
    }
    /* cada vídeo ganha um botão de pausar (os loops passam de 5 segundos) */
    const ICON = {pause: '<svg viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor"/></svg>', play: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>'};
    vids.forEach(v => {
      const b = document.createElement("button"); b.type = "button"; b.className = "vbtn";
      const paint = () => { const on = !v.paused; b.innerHTML = on ? ICON.pause : ICON.play; b.setAttribute("aria-label", on ? "Pausar vídeo" : "Tocar vídeo"); };
      b.addEventListener("click", () => { if (v.paused) { v.dataset.hold = ""; if (v.preload === "none") { v.preload = "auto"; v.load(); } v.play().catch(() => {}); } else { v.dataset.hold = "1"; v.pause(); } });
      v.addEventListener("play", paint); v.addEventListener("pause", paint); paint();
      v.parentElement.append(b);
    });
  }

  /* o topo acompanha o tom da seção que passa por baixo dele (claro ou escuro) */
  const hd = document.querySelector(".top");
  if (hd && "IntersectionObserver" in window) {
    const hio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) hd.dataset.tone = e.target.dataset.tone || "light"; }), {rootMargin: "-36px 0px -96% 0px"});
    $$("[data-tone]:not(.top)").forEach(t => hio.observe(t));
  }
  if (hd) {
    const s = () => hd.classList.toggle("scrolled", scrollY > 20);
    addEventListener("scroll", s, {passive: true}); s();
  }
})();
