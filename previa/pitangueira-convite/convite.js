/* =====================================================================
   Veja um convite por dentro · Pitangueira
   ---------------------------------------------------------------------
   COMO TROCAR AS ILUSTRAÇÕES POR FOTOS DE VERDADE
   Cada peça abaixo (PECAS) diz o que mostrar em cada face, no modo
   "rascunho" e no modo "final". Uma face pode ser:
     - "#arte-..."  → um <template> de index.html (ilustração em SVG).
                      No rascunho, o mesmo desenho ganha o efeito de lápis.
     - "fotos/convites/<id>-frente.jpg" → uma foto (caminho a partir desta
                      pasta, ou "/fotos/..." a partir da raiz do site).
   Sugestão de nomes, dentro de public/convite-por-dentro/fotos/convites/:
     convite-principal-frente.jpg  convite-principal-verso.jpg
     convite-portas-capa.jpg  convite-portas-interno.jpg  convite-portas-portas.jpg
     livreto-1.jpg … livreto-4.jpg  livreto-verso.jpg
     rsvp-frente.jpg  rsvp-verso.jpg  tag-frente.png  tag-verso.png
   Para o rascunho, use a foto/scan do desenho a lápis
   (ex.: "fotos/convites/rsvp-frente-rascunho.jpg"). Se o rascunho de uma
   face ficar vazio (null), a foto final aparece em cinza.
   Fotos precisam ter a mesma proporção da peça (campo "proporcao":
   largura / altura). Para a tag, use PNG com fundo transparente.
   A capa do convite de portas é UMA imagem inteira: o site corta ao meio,
   uma metade em cada porta.
   ===================================================================== */

// WhatsApp da Pitangueira (o mesmo do site)
const WHATSAPP = "5541987112437";
const MENSAGEM = "Oi, Pétala e Isa! Vi o convite por dentro no site e quero o meu convite assim.";

const PECAS = [
  {
    id: "convite-portas", tipo: "portas", cor: "var(--laranja)",
    titulo: "Convite de portas",
    texto: "Duas portas que se abrem e revelam o convite.",
    proporcao: 500 / 700,
    faces: {
      rascunho: { capa: "#arte-portas-capa", portas: "#arte-portas-verso", interno: "#arte-portas-interno" },
      final:    { capa: "#arte-portas-capa", portas: "#arte-portas-verso", interno: "#arte-portas-interno" },
    },
    vistas: [
      { face: "capa", legenda: "Capa", texto: "As duas portas fechadas, com o monograma A & P." },
      { face: "interno", legenda: "Por dentro", texto: "O convite com a programação do dia." },
      { face: "portas", legenda: "Verso das portas", texto: "Papel areia com mini corações.", proporcao: 250 / 700 },
    ],
  },
  {
    id: "convite-principal", tipo: "flip", cor: "var(--coral)", classe: "convite",
    titulo: "Convite principal",
    texto: "Frente com os nomes; no verso, as informações para guardar.",
    proporcao: 500 / 700,
    faces: {
      rascunho: { frente: "#arte-convite-frente", verso: "#arte-convite-verso" },
      final:    { frente: "#arte-convite-frente", verso: "#arte-convite-verso" },
    },
    vistas: [
      { face: "frente", legenda: "Frente", texto: "Ana & Pedro, 14 de março de 2027." },
      { face: "verso", legenda: "Verso", texto: "Monograma e informações da festa." },
    ],
  },
  {
    id: "rsvp", tipo: "flip", cor: "var(--bordo)", classe: "rsvp",
    titulo: "Cartão de RSVP",
    texto: "Borda recortada; no verso, as linhas para confirmar presença.",
    proporcao: 600 / 420,
    faces: {
      rascunho: { frente: "#arte-rsvp-frente", verso: "#arte-rsvp-verso" },
      final:    { frente: "#arte-rsvp-frente", verso: "#arte-rsvp-verso" },
    },
    vistas: [
      { face: "frente", legenda: "Frente", texto: "Você vem? Confirme até 10 de fevereiro." },
      { face: "verso", legenda: "Verso", texto: "Nome, presença, restrições e a música que não pode faltar." },
    ],
  },
  {
    id: "tag", tipo: "girar", cor: "var(--laranja)", classe: "tag",
    titulo: "Tag do envelope",
    texto: "A etiqueta que vai amarrada no envelope, com o nome de quem recebe.",
    proporcao: 240 / 490,
    faces: {
      rascunho: { frente: "#arte-tag-frente", verso: "#arte-tag-verso" },
      final:    { frente: "#arte-tag-frente", verso: "#arte-tag-verso" },
    },
    vistas: [
      { face: "frente", legenda: "Frente", texto: "Ana & Pedro, com fitilho." },
      { face: "verso", legenda: "Verso", texto: "Para quem é, com carinho." },
    ],
  },
  {
    id: "livreto", tipo: "sanfona", largo: true, cor: "var(--bordo-escuro)",
    titulo: "Livreto sanfonado",
    texto: "O guia dos convidados, dobrado em quatro partes.",
    proporcao: 300 / 520,
    faces: {
      rascunho: { paineis: ["#arte-livreto-1", "#arte-livreto-2", "#arte-livreto-3", "#arte-livreto-4"], verso: "#arte-livreto-verso" },
      final:    { paineis: ["#arte-livreto-1", "#arte-livreto-2", "#arte-livreto-3", "#arte-livreto-4"], verso: "#arte-livreto-verso" },
    },
    vistas: [
      { face: "paineis.0", legenda: "1 · Capa", texto: "Nosso grande dia, guia dos convidados." },
      { face: "paineis.1", legenda: "2 · Programação", texto: "Do sim às 16h até a pista." },
      { face: "paineis.2", legenda: "3 · Como chegar", texto: "Mapa ilustrado do sítio." },
      { face: "paineis.3", legenda: "4 · Dicas", texto: "Traje, sapato confortável e pousadas." },
    ],
  },
];

/* =====================================================================
   A PARTIR DAQUI É O FUNCIONAMENTO — não precisa mexer.
   ===================================================================== */

const $ = (s, el = document) => el.querySelector(s);
const semMovimento = matchMedia("(prefers-reduced-motion: reduce)");
const limita = (v, a, b) => Math.min(b, Math.max(a, v));
const suave = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  filhos.flat().forEach(f => f && e.append(f));
  return e;
}

/* Lê "paineis.2" dentro de faces.final, por exemplo */
function fonte(peca, modo, caminho) {
  return caminho.split(".").reduce((o, k) => (o == null ? o : o[k]), peca.faces[modo]);
}

/* Uma camada: SVG de um <template> ou uma foto */
function camada(src, modo, reserva) {
  const c = el("div", { class: `camada camada-${modo}` });
  let usar = src, cinza = false;
  if (!usar && modo === "rascunho") { usar = reserva; cinza = true; }
  if (!usar) return c;
  if (usar.startsWith("#")) {
    const t = document.querySelector(`template${usar}`);
    if (!t) return c;
    const svg = t.content.firstElementChild.cloneNode(true);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    if (modo === "rascunho") svg.classList.add("lapis");
    c.append(svg);
  } else {
    const img = el("img", { src: usar, alt: "", loading: "lazy", decoding: "async", draggable: "false" });
    if (cinza || (modo === "rascunho" && usar === reserva)) img.classList.add("foto-lapis");
    c.append(img);
  }
  return c;
}
function arte(peca, caminho) {
  const final = fonte(peca, "final", caminho);
  return el("div", { class: "arte" }, camada(fonte(peca, "final", caminho), "final"), camada(fonte(peca, "rascunho", caminho), "rascunho", final));
}
const face = (peca, caminho, lado) => el("div", { class: `face ${lado}` }, arte(peca, caminho));

/* Animação de um número (slider, giro). Sem animação com "reduzir movimento". */
function animador() {
  let id = 0;
  return (de, para, ms, passo, fim) => {
    cancelAnimationFrame(id);
    if (semMovimento.matches || ms <= 0 || de === para) { passo(para); fim && fim(); return; }
    const t0 = performance.now();
    const quadro = agora => {
      const t = limita((agora - t0) / ms, 0, 1);
      passo(de + (para - de) * suave(t));
      if (t < 1) id = requestAnimationFrame(quadro); else fim && fim();
    };
    id = requestAnimationFrame(quadro);
  };
}

/* Arrastar na "mesa" (mouse e toque). Rolar a página na vertical continua livre. */
function arrastavel(palco, { inicio, mover, fim }) {
  let x0 = null, andou = false;
  palco.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    x0 = e.clientX; andou = false;
    palco.setPointerCapture(e.pointerId);
    palco.classList.add("arrastando");
    inicio && inicio();
  });
  palco.addEventListener("pointermove", e => {
    if (x0 == null) return;
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 4) andou = true;
    if (andou) mover(dx, palco.clientWidth);
  });
  const solta = e => {
    if (x0 == null) return;
    const dx = e.clientX - x0;
    x0 = null;
    palco.classList.remove("arrastando");
    fim && fim(dx, andou);
  };
  palco.addEventListener("pointerup", solta);
  palco.addEventListener("pointercancel", solta);
  palco.addEventListener("lostpointercapture", solta);
}

const icone = {
  abrir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h7v16H3zM14 4l7 2v12l-7 2z"/></svg>',
  virar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>',
  girar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="4"/><path d="M12 8V3l3 2"/></svg>',
  perto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M11 8v6M8 11h6"/></svg>',
};
function botao(classe, iconeHtml, texto, onclick) {
  const b = el("button", { type: "button", class: `btn ${classe}` });
  b.innerHTML = iconeHtml;
  const rotulo = el("span", { text: texto });
  b.append(rotulo);
  b.rotulo = rotulo;
  b.addEventListener("click", onclick);
  return b;
}
function faixa(rotulo, valor, aoMudar) {
  const input = el("input", { type: "range", min: "0", max: "100", step: "1", value: String(valor), "aria-label": rotulo });
  input.addEventListener("input", () => aoMudar(+input.value));
  return { wrap: el("label", { class: "faixa" }, el("span", { text: rotulo }), input), input };
}
const pintaFaixa = input => input.style.setProperty("--v", input.value + "%");

/* ---------- Cada tipo de peça ---------- */

function montarPortas(peca, palco, controles, avisar) {
  const g = el("div", { class: "gatefold" },
    el("div", { class: "interno" }, face(peca, "interno", "frente")),
    el("div", { class: "porta esq" }, face(peca, "capa", "frente"), face(peca, "portas", "verso")),
    el("div", { class: "porta dir" }, face(peca, "capa", "frente"), face(peca, "portas", "verso")));
  palco.append(el("div", { class: "cena" }, g), el("span", { class: "dica", "aria-hidden": "true", text: "arraste para abrir" }));
  let p = 0;
  const anima = animador();
  const { wrap, input } = faixa("Abrir", 0, v => { anima(p, p, 0, () => {}); aplicar(v / 100); });
  const b = botao("btn-bordo", icone.abrir, "Abrir o convite", () => {
    const alvo = p < .5 ? 1 : 0;
    anima(p, alvo, 1500, aplicar, () => avisar(alvo ? "Convite aberto" : "Convite fechado"));
  });
  function aplicar(v) {
    p = limita(v, 0, 1);
    g.style.setProperty("--p", p.toFixed(4));
    input.value = Math.round(p * 100); pintaFaixa(input);
    const pct = Math.round(p * 100);
    input.setAttribute("aria-valuetext", pct === 0 ? "fechado" : pct === 100 ? "totalmente aberto" : `aberto ${pct}%`);
    b.rotulo.textContent = p < .5 ? "Abrir o convite" : "Fechar o convite";
    palco.setAttribute("aria-label", `Ilustração do convite de portas, ${input.getAttribute("aria-valuetext")}`);
  }
  let p0 = 0;
  arrastavel(palco, {
    inicio: () => { p0 = p; anima(p, p, 0, () => {}); },
    mover: (dx, w) => aplicar(p0 + dx / (w * .45)),
    fim: (dx, andou) => { if (!andou) b.click(); },
  });
  controles.append(wrap, b);
  aplicar(0);
}

function montarVirador(peca, palco, controles, avisar, girar) {
  const v = el("div", { class: `virador ${peca.classe || ""}` }, face(peca, "frente", "frente"), face(peca, "verso", "verso"));
  palco.append(el("div", { class: "cena" }, v), el("span", { class: "dica", "aria-hidden": "true", text: girar ? "arraste para girar" : "arraste ou toque para virar" }));
  let ang = 0;
  const anima = animador();
  const mostrandoVerso = () => Math.cos(ang * Math.PI / 180) < 0;
  function aplicar(a, comTransicao) {
    ang = a;
    v.classList.toggle("sem-transicao", !comTransicao);
    v.style.transform = `rotateY(${ang}deg)`;
    const lado = mostrandoVerso() ? "verso" : "frente";
    if (girar) {
      const graus = ((Math.round(ang) % 360) + 360) % 360;
      palco.setAttribute("aria-valuenow", String(graus));
      palco.setAttribute("aria-valuetext", `${graus} graus, mostrando a ${lado}`);
    } else {
      bVirar.setAttribute("aria-pressed", String(lado === "verso"));
      palco.setAttribute("aria-label", `Ilustração: ${peca.titulo.toLowerCase()}, mostrando a ${lado}`);
    }
  }
  let bVirar;
  if (girar) {
    palco.setAttribute("role", "slider");
    palco.setAttribute("tabindex", "0");
    palco.setAttribute("aria-label", `Girar a ${peca.titulo.toLowerCase()} (setas do teclado)`);
    palco.setAttribute("aria-valuemin", "0");
    palco.setAttribute("aria-valuemax", "359");
    palco.addEventListener("keydown", e => {
      const passo = { ArrowRight: 15, ArrowUp: 15, ArrowLeft: -15, ArrowDown: -15, PageUp: 90, PageDown: -90 }[e.key];
      if (e.key === "Home") { e.preventDefault(); anima(ang, 0, 0, a => aplicar(a, true)); return; }
      if (passo == null) return;
      e.preventDefault();
      aplicar(ang + passo, true);
    });
    controles.append(botao("btn-bordo", icone.girar, "Girar", () => {
      const alvo = Math.round(ang / 360) * 360 + 360;
      anima(ang, alvo, 2400, a => aplicar(a, false), () => avisar("Deu uma volta completa"));
    }));
  } else {
    bVirar = botao("btn-bordo", icone.virar, "Virar", () => {
      const alvo = mostrandoVerso() ? Math.round((ang - 180) / 360) * 360 + 360 : Math.round(ang / 360) * 360 + 180;
      aplicar(alvo, true);
      avisar(mostrandoVerso() ? "Mostrando o verso" : "Mostrando a frente");
    });
    controles.append(bVirar);
  }
  let a0 = 0;
  arrastavel(palco, {
    inicio: () => { a0 = ang; anima(ang, ang, 0, () => {}); },
    mover: (dx, w) => aplicar(a0 + dx / w * 220, false),
    fim: (dx, andou) => {
      if (!andou) { if (!girar) bVirar.click(); return; }
      if (!girar) { aplicar(Math.round(ang / 180) * 180, true); avisar(mostrandoVerso() ? "Mostrando o verso" : "Mostrando a frente"); }
    },
  });
  aplicar(0, false);
}

function montarSanfona(peca, palco, controles, avisar) {
  const n = peca.faces.final.paineis.length;
  const paineis = [];
  let pai = null, raiz = null;
  for (let i = 0; i < n; i++) {
    const p = el("div", { class: "painel" }, face(peca, `paineis.${i}`, "frente"), face(peca, "verso", "verso"));
    paineis.push(p);
    if (pai) pai.append(p); else raiz = p;
    pai = p;
  }
  const trilho = el("div", { class: "sanfona" }, raiz);
  const inclina = el("div", { class: "inclina" }, trilho);
  palco.append(el("div", { class: "cena" }, inclina), el("span", { class: "dica", "aria-hidden": "true", text: "arraste para desdobrar" }));
  let p = 0;
  const anima = animador();
  const { wrap, input } = faixa("Desdobrar", 0, v => { anima(p, p, 0, () => {}); aplicar(v / 100); });
  const b = botao("btn-bordo", icone.abrir, "Desdobrar", () => {
    const alvo = p < .5 ? 1 : 0;
    anima(p, alvo, 1800, aplicar, () => avisar(alvo ? "Livreto desdobrado" : "Livreto dobrado"));
  });
  function aplicar(v) {
    p = limita(v, 0, 1);
    const a = (1 - p) * 176;               // ângulo de cada dobra
    const rad = a * Math.PI / 180;
    // Zigue-zague: cada painel dobra para um lado
    let x = 1, dir = 0, xs = [0, 1];
    for (let i = 1; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      paineis[i].style.transform = `rotateY(${s * a}deg)`;
      dir += s * rad;
      x += Math.cos(dir); xs.push(x);
    }
    const min = Math.min(...xs), max = Math.max(...xs);
    const W = trilho.offsetWidth || 1, H = trilho.offsetHeight || 1;
    const largura = (max - min) * W;
    const escala = Math.min(palco.clientWidth * .9 / largura, palco.clientHeight * .82 / H);
    const centro = (min + max) / 2 * W;
    // No meio do caminho, a peça inclina um pouco para mostrar as dobras
    const meio = Math.sin(p * Math.PI);
    inclina.style.transform = `rotateX(${(meio * 10).toFixed(2)}deg) rotateY(${(meio * -22).toFixed(2)}deg)`;
    trilho.style.transform = `scale(${escala.toFixed(4)}) translate(${(-centro).toFixed(2)}px, ${(-H / 2).toFixed(2)}px)`;
    input.value = Math.round(p * 100); pintaFaixa(input);
    const pct = Math.round(p * 100);
    input.setAttribute("aria-valuetext", pct === 0 ? "dobrado" : pct === 100 ? "totalmente desdobrado" : `desdobrado ${pct}%`);
    b.rotulo.textContent = p < .5 ? "Desdobrar" : "Dobrar";
    palco.setAttribute("aria-label", `Ilustração do livreto sanfonado, ${input.getAttribute("aria-valuetext")}`);
  }
  let p0 = 0;
  arrastavel(palco, {
    inicio: () => { p0 = p; anima(p, p, 0, () => {}); },
    mover: (dx, w) => aplicar(p0 + dx / (w * .6)),
    fim: (dx, andou) => { if (!andou) b.click(); },
  });
  new ResizeObserver(() => aplicar(p)).observe(palco);
  controles.append(wrap, b);
  aplicar(0);
}

/* ---------- Ver de perto ---------- */
const dialogo = $("#perto");
let quemAbriu = null;
function verDePerto(peca, origem) {
  quemAbriu = origem;
  $("#perto-titulo").textContent = peca.titulo;
  const corpo = $("#perto-corpo");
  corpo.replaceChildren();
  for (const v of peca.vistas) {
    const prop = v.proporcao || peca.proporcao;
    const caixa = el("div", { class: "arte-perto" }, arte(peca, v.face));
    caixa.style.aspectRatio = String(prop);
    caixa.style.width = `min(100%, ${Math.round(prop * 62)}vh)`;
    corpo.append(el("figure", {}, caixa, el("figcaption", {}, el("strong", { text: v.legenda }), v.texto)));
  }
  corpo.append(el("p", { class: "perto-modo", text: document.body.dataset.modo === "rascunho" ? "Você está vendo o rascunho a lápis." : "Você está vendo a arte final." }));
  dialogo.showModal();
  $("#perto-fechar").focus();
}
$("#perto-fechar").addEventListener("click", () => dialogo.close());
dialogo.addEventListener("click", e => { if (e.target === dialogo) dialogo.close(); });
dialogo.addEventListener("close", () => { if (quemAbriu) quemAbriu.focus(); quemAbriu = null; });

/* ---------- Montagem ---------- */
const grade = $("#grade");
PECAS.forEach((peca, i) => {
  const status = el("p", { class: "sr", "aria-live": "polite" });
  const avisar = msg => { status.textContent = ""; setTimeout(() => { status.textContent = msg; }, 30); };
  const palco = el("div", { class: "palco", role: "img" });
  const controles = el("div", { class: "controles" });
  const cartao = el("article", { class: `cartao${peca.largo ? " largo" : ""}`, id: `peca-${peca.id}`, "aria-labelledby": `titulo-${peca.id}` },
    el("div", { class: "cartao-cab" },
      el("span", { class: "num", "aria-hidden": "true", text: String(i + 1).padStart(2, "0") }),
      el("div", {}, el("h2", { id: `titulo-${peca.id}`, text: peca.titulo }), el("p", { text: peca.texto }))),
    palco, controles, status);
  cartao.querySelector(".num").style.setProperty("--cor", peca.cor);
  grade.append(cartao);

  if (peca.tipo === "portas") montarPortas(peca, palco, controles, avisar);
  else if (peca.tipo === "sanfona") montarSanfona(peca, palco, controles, avisar);
  else montarVirador(peca, palco, controles, avisar, peca.tipo === "girar");

  const perto = botao("btn-contorno", icone.perto, "Ver de perto", () => verDePerto(peca, perto));
  perto.setAttribute("aria-haspopup", "dialog");
  controles.append(perto);
});

/* Rascunho / Arte final */
document.querySelectorAll('#modo input[name="modo"]').forEach(r => r.addEventListener("change", () => {
  if (r.checked) document.body.dataset.modo = r.value;
}));
const marcado = $('#modo input:checked');
if (marcado) document.body.dataset.modo = marcado.value;

$("#cta-whats").href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(MENSAGEM)}`;
