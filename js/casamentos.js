/* Gueta Studio · /casamentos/: botão fixo de WhatsApp. Aparece depois da abertura e some perto da chamada final. */
(() => {
  const w = document.querySelector(".wa-fix"), end = document.getElementById("contato"); if (!w) return;
  let nearEnd = false;
  const tick = () => w.classList.toggle("on", scrollY > innerHeight * .9 && !nearEnd);
  if ("IntersectionObserver" in window && end) new IntersectionObserver(es => { nearEnd = es[0].isIntersecting; tick(); }, {threshold: 0, rootMargin: "0px 0px -20% 0px"}).observe(end);
  addEventListener("scroll", tick, {passive: true}); tick();
})();
