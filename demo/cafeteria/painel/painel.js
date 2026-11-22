/* Painel para cafeterias · DEMONSTRAÇÃO com o "Café Modelo", uma cafeteria fictícia.
   É o mesmo painel usado de verdade (pedidos da loja, estoque, cardápio, compras e resumo), mas aqui ele
   roda 100% no navegador: não há servidor, login nem chamada de rede (a CSP da página bloqueia qualquer conexão).
   Os dados são de EXEMPLO, ficam só na memória e voltam ao começo ao recarregar ou em "Recomeçar demonstração".
   O único dado guardado no aparelho é o nome de quem está no balcão (preferência de tela).
   Tudo o que vai para a tela passa por esc(), como no painel real. */
import { CARDAPIO, LOJA, variantes, precoDe, achar } from "./catalogo.js";

const CAFE = "Café Modelo";
const TITULO = "Painel para cafeterias: demonstração ao vivo · Gueta Studio";

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = c => c == null ? "a consultar" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQ = n => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
/** "2,5" → 2.5 · "1.250,5" → 1250.5 · "0.5" → 0.5 */
const parseQ = v => { const s = String(v ?? "").trim(); if (!s) return NaN; const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); return Number.isFinite(n) ? n : NaN; };
const TZ = { timeZone: "America/Sao_Paulo" };
const hora = iso => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", ...TZ });
const dia = iso => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", ...TZ });
const hojeSP = (d = new Date()) => new Intl.DateTimeFormat("en-CA", TZ).format(d);
const dataBR = d => d ? d.split("-").reverse().join("/") : "";
const normTel = v => { let d = String(v || "").replace(/\D/g, ""); if (d.length > 11 && d.startsWith("55")) d = d.slice(2); return /^[1-9]{2}9?\d{8}$/.test(d) ? d : ""; };
const telFmt = t => t ? `(${t.slice(0, 2)}) ${t.slice(2, t.length - 4)}-${t.slice(-4)}` : "";
const linhaNome = i => i.nome + (i.variante ? " · " + i.variante : "");
const primeiro = n => String(n || "").trim().split(/\s+/)[0] || "";
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600); }
async function copiar(txt) { try { await navigator.clipboard.writeText(txt); return true; } catch (e) { return false; } }
/* larguras de barras sem style="" (a CSP do painel não aceita estilo embutido) */
const larguras = root => $$("[data-w]", root).forEach(el => { el.style.width = el.dataset.w + "%"; });
/* só troca o HTML se mudou: a atualização automática não substitui o botão embaixo do dedo */
const setHtml = (el, html) => { if (el.__html !== html) { el.__html = html; el.innerHTML = html; } };
const alturas = root => $$("[data-h]", root).forEach(el => { el.style.height = el.dataset.h + "%"; });
$$("dialog [data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

/* ---------- quem está no balcão (só preferência de tela) ---------- */
const S = { quem: "" };
const CHAVE = "cafe-modelo-demo-quem";
function setQuem(q) {
  S.quem = String(q || "").trim().slice(0, 30); $("#quemTxt").textContent = S.quem || "Quem está aqui?";
  try { localStorage.setItem(CHAVE, S.quem); } catch (e) {}
}

/* Na demonstração não existe servidor: cada "chamada" é respondida por demo(), aqui mesmo no navegador. */
async function call(method, path, body) { return demo(method, path, body ? { ...body, quem: S.quem } : body); }

/* ---------- catálogo ---------- */
const CATS = [...new Set(CARDAPIO.map(i => i.cat))];
const precoTxt = it => Array.isArray(it.p) ? it.p.map(([v, c]) => `${v} ${brl(c)}`).join(" · ") : brl(it.p);
let ESG = new Map();                                   // "loja:mupeco" → {desde, por}
const esgotado = (tipo, id) => ESG.has(tipo + ":" + id);

/* ================= PEDIDOS ================= */
const ETAPA = { novo: "Novo", separando: "Separando", pronto: "Pronto", retirado: "Retirado", cancelado: "Cancelado" };
const NEXT = { novo: ["separando", "Separar", "b-car"], separando: ["pronto", "Pronto para retirar", "b-ocre"], pronto: ["retirado", "Cliente retirou", "b-verde"] };
const PREV = { separando: "novo", pronto: "separando" };
const ABERTOS_D = ["novo", "separando", "pronto"];
const COLS = [["novo", "Novos", "var(--acc)"], ["separando", "Separando", "var(--ocre)"], ["pronto", "Prontos para retirar", "var(--verde)"], ["fim", "Retirados e cancelados", "var(--muted)"]];
let ver = "quadro", col = "novo", conhecidos = null, PEDIDOS = [];
const FRESCOS = new Map();                             // pedido novo → quando chegou (fica destacado por 15 s)

async function loadOrders(silent) {
  try {
    const { pedidos } = await call("GET", "/admin/pedidos?ver=" + ver);
    setLive(true);
    const novos = conhecidos ? pedidos.filter(p => !conhecidos.has(p.id) && p.status === "novo") : [];
    conhecidos = new Set([...(conhecidos || []), ...pedidos.map(p => p.id)]);
    if (novos.length) { beep(); toast(novos.length === 1 ? `Pedido novo: ${novos[0].nome}` : `${novos.length} pedidos novos`); }
    const t = Date.now(); novos.forEach(p => FRESCOS.set(p.id, t)); FRESCOS.forEach((v, k) => { if (t - v > 15000) FRESCOS.delete(k); });
    PEDIDOS = pedidos; renderOrders(new Set(FRESCOS.keys()));
  } catch (e) { setLive(false); if (!silent) toast(e.message); }
}
function avisoTxt(p) { return `Olá, ${primeiro(p.nome)}! Seu pedido ${p.id} do ${CAFE} está pronto para retirar. Te esperamos no café ☕`; }
function orderCard(p, fresh) {
  const nx = NEXT[p.status], fim = ["retirado", "cancelado"].includes(p.status);
  const valor = p.total_final != null ? brl(p.total_final) : p.consultar ? (p.total ? brl(p.total) + " + a consultar" : "a consultar") : brl(p.total);
  const esgs = p.itens.filter(i => i.esgotado && !fim).length;
  return `<article class="ord ${fresh ? "fresh" : ""} ${fim ? "done" : ""}" data-id="${esc(p.id)}">
    <div class="ord-h"><span class="nb" aria-label="Código curto">${esc(p.id.slice(-4))}</span>
      <div class="who"><b>${esc(p.nome)}</b><small>${esc(p.id)} · ${dia(p.criado_em)} ${hora(p.criado_em)}<span class="orig">${p.origem === "site" ? "Site" : "Balcão"}</span></small></div>
      <span class="st ${esc(p.status)}">${ETAPA[p.status] || esc(p.status)}</span></div>
    <ul class="items">${p.itens.map(i => `<li><span><b>${i.qtd}×</b> ${esc(linhaNome(i))}${i.esgotado ? `<span class="tag esg">estava esgotado</span>` : ""}</span><span class="pr">${i.centavos == null ? "consultar" : brl(i.centavos * i.qtd)}</span></li>`).join("")}</ul>
    ${esgs ? `<p class="obs">Atenção: o cliente pediu item marcado como esgotado. Confirme com ele antes de separar.</p>` : ""}
    ${p.obs ? `<p class="obs">${esc(p.obs)}</p>` : ""}
    ${p.tel ? `<small class="sum">Celular: ${esc(telFmt(p.tel))}</small>` : ""}
    ${nx ? `<button class="btn big ${nx[2]}" type="button" data-st="${nx[0]}">${nx[1]}</button>` : ""}
    <div class="ord-f"><span class="total">${valor}${p.total_final != null && p.consultar ? "<small>valor cobrado</small>" : ""}</span>
      ${p.consultar && p.status !== "cancelado" ? `<button class="btn b-line b-sm" type="button" data-valor>${p.total_final != null ? "Mudar valor" : "Valor cobrado"}</button>` : ""}
      ${p.status === "pronto" ? (p.tel ? `<button class="btn b-wa b-sm" type="button" data-aviso-wa>Avisar no WhatsApp</button>` : `<button class="btn b-line b-sm" type="button" data-aviso>Copiar aviso</button>`) : ""}
      ${PREV[p.status] ? `<button class="btn b-line b-sm" type="button" data-st="${PREV[p.status]}" aria-label="Voltar para ${ETAPA[PREV[p.status]]}">↶ Voltar</button>` : ""}
      ${!fim ? `<button class="btn b-ghost b-sm" type="button" data-st="cancelado">Cancelar</button>` : ""}
      ${p.status === "retirado" ? `<button class="btn b-line b-sm" type="button" data-st="pronto">Desfazer retirada</button>` : ""}
      ${p.status === "cancelado" ? `<button class="btn b-line b-sm" type="button" data-st="${esc(p.antes || "novo")}">Desfazer cancelamento</button>` : ""}
    </div></article>`;
}
function renderOrders(fresh = new Set()) {
  const novos = PEDIDOS.filter(p => p.status === "novo").length;
  $("#nNovos").hidden = !novos; $("#nNovos").textContent = novos;
  document.title = (novos ? `(${novos}) ` : "") + TITULO;
  const validos = PEDIDOS.filter(p => p.status !== "cancelado");
  const fat = validos.reduce((s, p) => s + (p.total_final ?? p.total), 0);
  $("#sum").innerHTML = ver === "quadro" ? `<b>${PEDIDOS.filter(p => !["retirado", "cancelado"].includes(p.status)).length}</b> em andamento`
    : `<b>${validos.length}</b> pedido${validos.length === 1 ? "" : "s"} · <b>${brl(fat)}</b>${validos.some(p => p.consultar && p.total_final == null) ? " + a consultar" : ""}`;
  $("#colpick").hidden = ver !== "quadro";
  if (ver !== "quadro") { setHtml($("#orders"), PEDIDOS.length ? `<div class="flat">${PEDIDOS.map(p => orderCard(p, false)).join("")}</div>` : `<div class="empty">Nenhum pedido.</div>`); return; }
  const de = c => c === "fim" ? PEDIDOS.filter(p => ["retirado", "cancelado"].includes(p.status)).sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em))) : PEDIDOS.filter(p => p.status === c);
  setHtml($("#colpick"), COLS.map(([c, t]) => `<button type="button" data-col="${c}" aria-pressed="${c === col}">${t.split(" ")[0]} · ${de(c).length}</button>`).join(""));
  setHtml($("#orders"), `<div class="cols">${COLS.map(([c, t, cor]) => { const l = de(c);
    return `<div class="col ${c === col ? "on" : ""}"><h3><i data-cor="${cor}"></i>${t} · ${l.length}</h3><div class="list">${l.length ? l.map(p => orderCard(p, fresh.has(p.id))).join("")
      : `<div class="empty">${c === "novo" ? "Nenhum pedido novo. Quando chegar, toca um aviso." : "Nada por aqui."}</div>`}</div></div>`; }).join("")}</div>`);
  $$("[data-cor]", $("#orders")).forEach(i => { i.style.background = i.dataset.cor; });
}
$("#colpick").addEventListener("click", e => { const b = e.target.closest("[data-col]"); if (b) { col = b.dataset.col; renderOrders(new Set(FRESCOS.keys())); } });
$("#orders").addEventListener("click", async e => {
  const card = e.target.closest("[data-id]"); if (!card) return;
  const p = PEDIDOS.find(x => x.id === card.dataset.id); if (!p) return;
  if (e.target.closest("[data-valor]")) return openValor(p);
  if (e.target.closest("[data-aviso-wa]")) { $("#avisoMsg").textContent = avisoTxt(p); $("#dlgAviso").showModal(); return; }
  if (e.target.closest("[data-aviso]")) { toast(await copiar(avisoTxt(p)) ? "Aviso copiado. Cole na conversa com o cliente." : avisoTxt(p)); return; }
  const b = e.target.closest("[data-st]"); if (!b) return;
  const st = b.dataset.st;
  if (st === "cancelado" && !confirm(`Cancelar o pedido de ${p.nome}?`)) return;
  b.disabled = true;
  try {
    const r = await call("POST", "/admin/pedido/status", { id: p.id, status: st });
    const est = Array.isArray(r.estoque) && r.estoque.length ? " · estoque baixado" + (r.estoque.some(x => x.acabando) ? ` (acabando: ${r.estoque.filter(x => x.acabando).map(x => x.nome).join(", ")})` : "") : r.estoque === "devolvido" ? " · estoque devolvido" : "";
    toast(ETAPA[st] + est);
    if (st === "pronto" || st === "separando" || st === "novo") col = st;
    if (r.estoque) loadStock(true);
    await loadOrders(true);
  } catch (err) { toast(err.message); b.disabled = false; }
});
$$("[data-ver]").forEach(b => b.addEventListener("click", () => { ver = b.dataset.ver; $$("[data-ver]").forEach(x => x.setAttribute("aria-pressed", x === b)); loadOrders(); }));

/* valor cobrado */
let valorPed = null;
function openValor(p) {
  valorPed = p; const f = $("#valorForm"); f.reset(); $("#valorErr").textContent = "";
  $("#valorSub").innerHTML = `Pedido <b>${esc(p.id)}</b> de ${esc(p.nome)}. Tem item com preço “a consultar”: informe o total cobrado para entrar no resumo.`;
  if (p.total_final != null) f.v.value = (p.total_final / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  $("#valorLimpar").hidden = p.total_final == null; $("#dlgValor").showModal(); f.v.focus();
}
async function salvarValor(centavos) {
  try { await call("POST", "/admin/pedido/valor", { id: valorPed.id, centavos }); $("#dlgValor").close(); toast(centavos == null ? "Valor apagado" : "Valor salvo: " + brl(centavos)); loadOrders(true); }
  catch (x) { $("#valorErr").textContent = x.message; }
}
$("#valorForm").addEventListener("submit", e => { e.preventDefault(); const v = parseQ(e.target.v.value);
  if (!(v >= 0)) { $("#valorErr").textContent = "Digite o valor, por exemplo 89,90."; return; } salvarValor(Math.round(v * 100)); });
$("#valorLimpar").addEventListener("click", () => salvarValor(null));

/* pedido no balcão */
let NOVO = [];
const todos = () => [...LOJA.map(i => ({ tipo: "loja", it: i, grupo: "Loja" })), ...CARDAPIO.map(i => ({ tipo: "cardapio", it: i, grupo: i.cat }))];
function renderPick() {
  const q = $("#novoForm").q.value.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const l = todos().filter(x => !q || (x.it.nome + " " + x.grupo).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q));
  let g = "";
  $("#novoPick").innerHTML = l.length ? l.slice(0, q ? 40 : 12).map(x => `${x.grupo !== g ? `<div class="grp-t">${esc(g = x.grupo)}</div>` : ""}<button type="button" data-add="${x.tipo}:${esc(x.it.id)}"><span>${esc(x.it.nome)}${esgotado(x.tipo, x.it.id) ? `<span class="tag esg">esgotado</span>` : ""}</span><small>${esc(precoTxt(x.it))}</small></button>`).join("")
    + (!q ? `<p class="preview">Digite para ver o cardápio inteiro.</p>` : "") : `<p class="preview">Nada encontrado.</p>`;
}
function renderNovo() {
  $("#novoLines").innerHTML = NOVO.map((l, k) => { const it = achar(l.tipo, l.id), vs = variantes(it);
    return `<div class="ln" data-k="${k}"><div><b>${esc(it.nome)}</b>${vs.length ? `<select class="in" data-var aria-label="Opção de ${esc(it.nome)}">${vs.map(v => `<option ${v === l.variante ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>` : ""}</div>
      <span class="step"><button type="button" data-d="-1" aria-label="Menos um">−</button><output>${l.qtd}</output><button type="button" data-d="1" aria-label="Mais um">+</button></span>
      <span class="num">${brl(precoDe(it, l.variante) == null ? null : precoDe(it, l.variante) * l.qtd)}</span></div>`; }).join("");
  const tot = NOVO.reduce((s, l) => s + (precoDe(achar(l.tipo, l.id), l.variante) || 0) * l.qtd, 0), cons = NOVO.some(l => precoDe(achar(l.tipo, l.id), l.variante) == null);
  $("#novoTotal").innerHTML = NOVO.length ? `Total: <b>${brl(tot)}</b>${cons ? " + itens a consultar" : ""}` : "Escolha os itens acima.";
}
$("#novoPed").addEventListener("click", () => { NOVO = []; const f = $("#novoForm"); f.reset(); $("#novoErr").textContent = ""; renderPick(); renderNovo(); $("#dlgNovo").showModal(); f.q.focus(); });
$("#novoForm").q.addEventListener("input", renderPick);
$("#novoPick").addEventListener("click", e => { const b = e.target.closest("[data-add]"); if (!b) return; const [tipo, id] = b.dataset.add.split(":"), it = achar(tipo, id);
  const variante = variantes(it)[0] || "", l = NOVO.find(x => x.tipo === tipo && x.id === id && x.variante === variante);
  l ? l.qtd++ : NOVO.push({ tipo, id, variante, qtd: 1 }); renderNovo(); });
$("#novoLines").addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (!b) return; const k = +b.closest("[data-k]").dataset.k;
  NOVO[k].qtd += +b.dataset.d; if (NOVO[k].qtd <= 0) NOVO.splice(k, 1); else NOVO[k].qtd = Math.min(50, NOVO[k].qtd); renderNovo(); });
$("#novoLines").addEventListener("change", e => { const s = e.target.closest("[data-var]"); if (s) { NOVO[+s.closest("[data-k]").dataset.k].variante = s.value; renderNovo(); } });
$("#novoForm").addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target, err = $("#novoErr"); err.textContent = "";
  if (!NOVO.length) { err.textContent = "Adicione pelo menos um item."; return; }
  if (f.tel.value.trim() && !normTel(f.tel.value)) { err.textContent = "Confira o celular (com DDD) ou deixe em branco."; return f.tel.focus(); }
  try { const r = await call("POST", "/admin/pedido/balcao", { nome: f.nome.value, tel: f.tel.value.trim() ? normTel(f.tel.value) : "", obs: f.obs.value, itens: NOVO });
    $("#dlgNovo").close(); toast("Pedido " + r.pedido.id.slice(-4) + " criado"); col = "novo"; conhecidos && conhecidos.add(r.pedido.id); loadOrders(true); }
  catch (x) { err.textContent = x.message; }
});

/* aviso sonoro (o navegador só libera som depois de um toque na tela) */
let ac = null;
function ligarSom() { if (!ac) try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} if (ac && ac.state === "suspended") ac.resume(); const b = $("#som"); b.classList.toggle("on", !!ac); b.textContent = ac ? "🔔 Som ligado" : "🔕 Sem som"; }
addEventListener("pointerdown", ligarSom, { once: true });
$("#som").addEventListener("click", () => { ligarSom(); beep(); });
function beep() { if (!ac) return; [0, .2, .4].forEach((t, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = [660, 880, 990][i]; g.gain.setValueAtTime(.0001, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(.25, ac.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + t + .17); o.connect(g).connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .18); }); }
function setLive(on) { $("#live").classList.toggle("off", !on); $("#liveTxt").textContent = on ? "ao vivo" : "sem conexão"; }

/* ================= ESTOQUE ================= */
let STK = { itens: [], unidades: [], categorias: [], venceEmDias: 7 }, stkFiltro = "todos", movItem = null;
const INTEIRO = u => ["un", "g", "ml"].includes(u);
function sugestao(it) { const alvo = it.alvo ?? Math.max(it.minimo * 2, it.minimo + (INTEIRO(it.unidade) ? 1 : 0.5)); const q = Math.max(alvo - it.quantidade, 0);
  return INTEIRO(it.unidade) ? Math.ceil(q) : Math.ceil(q * 10) / 10; }
async function loadStock(silent) { try { STK = await call("GET", "/admin/estoque"); renderStock(); renderShop(); if (!$("#t-cardapio").hidden) renderMenu(); } catch (e) { if (!silent) toast(e.message); } }
const valTag = i => i.vencido ? `<span class="tag red">venceu ${dataBR(i.validade).slice(0, 5)}</span>` : i.vencendo ? `<span class="tag ocre">vence ${dataBR(i.validade).slice(0, 5)}</span>` : "";
function renderStock() {
  const low = STK.itens.filter(i => i.acabando), venc = STK.itens.filter(i => i.vencido || i.vencendo);
  $("#nLow").hidden = !low.length; $("#nLow").textContent = low.length;
  $("#nCompras").hidden = !low.length; $("#nCompras").textContent = low.length;
  $("#stkAlert").innerHTML = (low.length ? `<div class="alert red"><span>${low.length} ite${low.length > 1 ? "ns" : "m"} no mínimo ou abaixo</span><button class="btn b-sm b-m" type="button" data-go="compras">Ver lista de compras</button></div>` : "")
    + (venc.length ? `<div class="alert ocre"><span>${venc.filter(i => i.vencido).length ? venc.filter(i => i.vencido).length + " vencido(s) · " : ""}${venc.filter(i => i.vencendo).length} vencendo em até ${STK.venceEmDias} dias</span><button class="btn b-sm b-line" type="button" data-sf2="validade">Ver</button></div>` : "");
  const q = $("#stkQ").value.trim().toLowerCase();
  const l = STK.itens.filter(i => (stkFiltro === "todos" || (stkFiltro === "baixo" ? i.acabando : (i.vencido || i.vencendo))) && (!q || (i.nome + " " + (i.fornecedor || "")).toLowerCase().includes(q)));
  if (!STK.itens.length) { $("#stkList").innerHTML = `<div class="empty">Nenhum item ainda. Toque em <b>+ Novo item</b> e cadastre o que o café usa e vende: grãos, leite, copos, produtos da loja…</div>`; return; }
  if (!l.length) { $("#stkList").innerHTML = `<div class="empty">Nenhum item encontrado.</div>`; return; }
  const cats = STK.categorias.filter(c => l.some(i => i.categoria === c));
  $("#stkList").innerHTML = cats.map(c => `<h3 class="cat-h">${esc(c)}</h3><div class="stk">${l.filter(i => i.categoria === c).map(i => `
    <div class="it ${i.acabando ? "low" : (i.vencido || i.vencendo) ? "venc" : ""}" data-id="${i.id}">
      <div class="it-n"><button type="button" data-mov>${esc(i.nome)}</button>
        <small>${i.acabando ? `<span class="tag red">acabando</span> ` : ""}${valTag(i)} mínimo ${fmtQ(i.minimo)} ${esc(i.unidade)}${i.fornecedor ? " · " + esc(i.fornecedor) : ""}</small></div>
      <div class="it-q"><b>${fmtQ(i.quantidade)}</b><span>${esc(i.unidade)}</span></div>
      <div class="it-a"><button class="btn b-line b-sm" type="button" data-q="-1" aria-label="Saiu 1 ${esc(i.unidade)} de ${esc(i.nome)}">−1</button><button class="btn b-line b-sm" type="button" data-q="1" aria-label="Entrou 1 ${esc(i.unidade)} de ${esc(i.nome)}">+1</button><button class="btn b-m b-sm" type="button" data-mov>Movimentar</button></div>
    </div>`).join("")}</div>`).join("");
}
async function mov(id, tipo, qtd, motivo) {
  const r = await call("POST", "/admin/estoque/mov", { id, tipo, qtd, motivo });
  const k = STK.itens.findIndex(x => x.id === r.item.id); if (k >= 0) STK.itens[k] = r.item; renderStock(); renderShop(); return r.item;
}
$("#stkList").addEventListener("click", async e => {
  const row = e.target.closest("[data-id]"); if (!row) return; const it = STK.itens.find(x => x.id === +row.dataset.id);
  const q = e.target.closest("[data-q]");
  if (q) { q.disabled = true; try { const n = await mov(it.id, +q.dataset.q > 0 ? "entrada" : "saida", 1, "ajuste rápido"); toast(`${n.nome}: ${fmtQ(n.quantidade)} ${n.unidade}`); } catch (err) { toast(err.message); } q.disabled = false; return; }
  if (e.target.closest("[data-mov]")) openMov(it);
});
$("#stkAlert").addEventListener("click", e => { if (e.target.closest("[data-go]")) tab("compras"); const v = e.target.closest("[data-sf2]"); if (v) $(`[data-sf="${v.dataset.sf2}"]`).click(); });
$("#stkQ").addEventListener("input", renderStock);
$$("[data-sf]").forEach(b => b.addEventListener("click", () => { stkFiltro = b.dataset.sf; $$("[data-sf]").forEach(x => x.setAttribute("aria-pressed", x === b)); renderStock(); }));

function openItem(it) {
  const f = $("#itemForm"); f.reset(); $("#itemErr").textContent = "";
  f.unidade.innerHTML = STK.unidades.map(u => `<option>${esc(u)}</option>`).join("");
  f.categoria.innerHTML = STK.categorias.map(c => `<option>${esc(c)}</option>`).join("");
  $("#fornecedores").innerHTML = [...new Set(STK.itens.map(i => i.fornecedor).filter(Boolean))].map(x => `<option value="${esc(x)}">`).join("");
  $("#itemTitle").textContent = it ? "Editar item" : "Novo item"; $("#itemDel").hidden = !it; $("#qtdWrap").hidden = !!it;
  if (it) { f.nome.value = it.nome; f.unidade.value = it.unidade; f.categoria.value = it.categoria; f.minimo.value = fmtQ(it.minimo); f.alvo.value = it.alvo != null ? fmtQ(it.alvo) : ""; f.fornecedor.value = it.fornecedor || ""; f.validade.value = it.validade || ""; }
  f.dataset.id = it ? it.id : ""; $("#dlgItem").showModal(); f.nome.focus();
}
$("#stkNew").addEventListener("click", () => openItem(null));
$("#itemForm").addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target, err = $("#itemErr"); err.textContent = "";
  const n = v => v.trim() ? parseQ(v) : null, minimo = n(f.minimo.value) ?? 0, quantidade = n(f.quantidade.value) ?? 0, alvo = n(f.alvo.value);
  if (f.nome.value.trim().length < 2) { err.textContent = "Digite o nome do item."; return f.nome.focus(); }
  if (!(minimo >= 0) || !(quantidade >= 0) || (alvo !== null && !(alvo > 0))) { err.textContent = "Use só números, por exemplo 2,5."; return; }
  try {
    await call("POST", "/admin/estoque/item", { id: f.dataset.id ? +f.dataset.id : undefined, nome: f.nome.value, unidade: f.unidade.value, categoria: f.categoria.value, minimo, quantidade, alvo, fornecedor: f.fornecedor.value, validade: f.validade.value || null });
    $("#dlgItem").close(); toast("Item salvo"); loadStock(true);
  } catch (x) { err.textContent = x.message; }
});
$("#itemDel").addEventListener("click", async () => {
  const id = +$("#itemForm").dataset.id, it = STK.itens.find(x => x.id === id);
  if (!confirm(`Remover "${it.nome}" do estoque? O histórico fica guardado e ele sai do consumo dos itens.`)) return;
  try { await call("POST", "/admin/estoque/remover", { id }); $("#dlgItem").close(); toast("Item removido"); loadStock(true); } catch (x) { toast(x.message); }
});

const MOTIVOS = { entrada: ["Compra", "Devolução", "Produção da casa"], saida: ["Uso no café", "Perda / quebra", "Vencido", "Degustação"], ajuste: ["Contagem"] };
const TIPO_TXT = { entrada: "entrada", saida: "saída", ajuste: "ajuste", pedido: "pedido", venda: "vendas do dia", estorno: "devolvido" };
function movPreview() {
  const f = $("#movForm"), it = movItem, q = parseQ(f.qtd.value), t = f.tipo.value;
  $("#movQtdLbl span").textContent = t === "ajuste" ? `Quanto tem agora (${it.unidade})` : t === "entrada" ? `Quanto entrou (${it.unidade})` : `Quanto saiu (${it.unidade})`;
  $("#movQuick").innerHTML = MOTIVOS[t].map(m => `<button type="button" data-m="${esc(m)}">${esc(m)}</button>`).join("");
  if (!(q >= 0)) { $("#movPrev").innerHTML = `Agora: <b>${fmtQ(it.quantidade)} ${esc(it.unidade)}</b>`; return; }
  const n = Math.round((t === "entrada" ? it.quantidade + q : t === "saida" ? it.quantidade - q : q) * 1000) / 1000;
  $("#movPrev").innerHTML = `Agora: <b>${fmtQ(it.quantidade)} ${esc(it.unidade)}</b> → depois: <b>${fmtQ(n)} ${esc(it.unidade)}</b>${n < 0 ? " · não pode ficar negativo" : n <= it.minimo ? " · vai ficar no mínimo ou abaixo" : ""}`;
}
const histLi = (m, nome) => `<li><span>${dia(m.criado_em)} ${hora(m.criado_em)} · ${nome ? `<b>${esc(m.nome)}</b> · ` : ""}${esc(TIPO_TXT[m.tipo] || m.tipo)}${m.motivo ? " · " + esc(m.motivo) : ""}${m.quem ? " · " + esc(m.quem) : ""}</span><span class="d ${m.delta < 0 ? "neg" : "pos"}">${m.delta > 0 ? "+" : ""}${fmtQ(m.delta)} → ${fmtQ(m.saldo)}${nome ? " " + esc(m.unidade) : ""}</span></li>`;
async function openMov(it, tipo = "entrada", qtd = "") {
  movItem = it; const f = $("#movForm"); f.reset(); f.tipo.value = tipo; f.qtd.value = qtd ? fmtQ(qtd) : ""; $("#movErr").textContent = ""; $("#movTitle").textContent = it.nome; movPreview();
  $("#movHist").innerHTML = ""; $("#dlgMov").showModal(); f.qtd.focus();
  try { const { movimentos } = await call("GET", "/admin/estoque/historico?id=" + it.id); $("#movHist").innerHTML = movimentos.map(m => histLi(m)).join(""); } catch (x) {}
}
$("#movForm").addEventListener("input", movPreview);
$("#movQuick").addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (b) $("#movForm").motivo.value = b.dataset.m; });
$("#movEdit").addEventListener("click", () => { $("#dlgMov").close(); openItem(movItem); });
$("#movForm").addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target, q = parseQ(f.qtd.value), err = $("#movErr"); err.textContent = "";
  if (!(q >= 0) || (f.tipo.value !== "ajuste" && q === 0)) { err.textContent = "Digite a quantidade, por exemplo 2,5."; return f.qtd.focus(); }
  try { const n = await mov(movItem.id, f.tipo.value, q, f.motivo.value.trim()); $("#dlgMov").close(); toast(`${n.nome}: ${fmtQ(n.quantidade)} ${n.unidade}${n.acabando ? " · acabando" : ""}`); }
  catch (x) { err.textContent = x.message; }
});
$("#histBtn").addEventListener("click", async () => {
  $("#histList").innerHTML = `<li><span>Carregando…</span></li>`; $("#dlgHist").showModal();
  try { const { movimentos } = await call("GET", "/admin/estoque/historico"); $("#histList").innerHTML = movimentos.length ? movimentos.map(m => histLi(m, true)).join("") : `<li><span>Nenhum movimento ainda.</span></li>`; }
  catch (x) { $("#histList").innerHTML = `<li><span>${esc(x.message)}</span></li>`; }
});

/* ---------- registrar vendas do dia ---------- */
let VEND = new Map();
function renderVList() {
  const q = $("#vendasForm").q.value.trim().toLowerCase();
  const rows = CARDAPIO.flatMap(it => (variantes(it).length ? variantes(it) : [""]).map(v => ({ it, v }))).filter(({ it, v }) => !q || (it.nome + " " + v + " " + it.cat).toLowerCase().includes(q));
  let g = "";
  $("#vList").innerHTML = rows.map(({ it, v }) => { const k = it.id + "|" + v, n = VEND.get(k) || 0, temF = FICHAS[`cardapio:${it.id}`] || (v && FICHAS[`cardapio:${it.id}|${v}`]);
    return `${it.cat !== g ? `<div class="cat-h">${esc(g = it.cat)}</div>` : ""}<div class="vrow ${n ? "has" : ""}" data-k="${esc(k)}"><span>${esc(it.nome)}${v ? " · " + esc(v) : ""}${temF ? "" : ` <span class="tag ocre">sem consumo</span>`}</span>
      <span class="step"><button type="button" data-d="-1" aria-label="Menos um">−</button><output>${n}</output><button type="button" data-d="1" aria-label="Mais um">+</button></span></div>`; }).join("") || `<p class="preview">Nada encontrado.</p>`;
  const tot = [...VEND.values()].reduce((a, b) => a + b, 0);
  $("#vSum").innerHTML = tot ? `<b>${tot}</b> ite${tot > 1 ? "ns" : "m"} para lançar.` : "Toque em + nos itens vendidos.";
}
async function loadLotes() {
  try { const { vendas } = await call("GET", "/admin/vendas");
    $("#vLotes").innerHTML = vendas.length ? vendas.map(v => `<li class="${v.desfeita_em ? "off" : ""}"><span>${dia(v.criado_em)} ${hora(v.criado_em)}${v.quem ? " · " + esc(v.quem) : ""} · ${v.itens.map(i => `${i.qtd}× ${esc(linhaNome(i))}`).join(", ")}</span>${v.desfeita_em ? "<small>desfeito</small>" : `<button class="btn b-ghost b-sm" type="button" data-desf="${v.id}">Desfazer</button>`}</li>`).join("") : `<li><span>Nenhum lançamento nos últimos 7 dias.</span></li>`;
  } catch (x) {}
}
$("#vendasBtn").addEventListener("click", async () => { VEND = new Map(); $("#vendasForm").reset(); $("#vErr").textContent = ""; await loadFichas(true); renderVList(); $("#dlgVendas").showModal(); loadLotes(); });
$("#vendasForm").q.addEventListener("input", renderVList);
$("#vList").addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (!b) return; const k = b.closest("[data-k]").dataset.k; const n = Math.max(0, Math.min(500, (VEND.get(k) || 0) + +b.dataset.d)); n ? VEND.set(k, n) : VEND.delete(k); renderVList(); });
$("#vendasForm").addEventListener("submit", async e => {
  e.preventDefault(); $("#vErr").textContent = "";
  const itens = [...VEND].map(([k, qtd]) => { const [id, variante] = k.split("|"); return { id, variante, qtd }; });
  if (!itens.length) { $("#vErr").textContent = "Toque em + nos itens vendidos."; return; }
  try { const r = await call("POST", "/admin/vendas", { itens });
    toast(`Vendas registradas · ${r.baixa.length} ite${r.baixa.length === 1 ? "m" : "ns"} do estoque baixado${r.baixa.length === 1 ? "" : "s"}` + (r.semFicha.length ? ` · sem consumo: ${r.semFicha.join(", ")}` : ""));
    VEND = new Map(); renderVList(); loadLotes(); loadStock(true); }
  catch (x) { $("#vErr").textContent = x.message; }
});
$("#vLotes").addEventListener("click", async e => { const b = e.target.closest("[data-desf]"); if (!b || !confirm("Desfazer este lançamento? O estoque volta.")) return;
  try { await call("POST", "/admin/vendas/desfazer", { id: +b.dataset.desf }); toast("Lançamento desfeito · estoque devolvido"); loadLotes(); loadStock(true); } catch (x) { toast(x.message); } });

/* ================= CARDÁPIO ================= */
let FICHAS = {};
async function loadFichas(silent) { try { FICHAS = (await call("GET", "/admin/fichas")).fichas; } catch (e) { if (!silent) toast(e.message); } }
async function loadDisp() { try { const { esgotados } = await call("GET", "/admin/disponibilidade"); ESG = new Map(esgotados.map(e => [e.tipo + ":" + e.item_id, e])); renderEsgCount(); } catch (e) {} }
function renderEsgCount() { $("#nEsg").hidden = !ESG.size; $("#nEsg").textContent = ESG.size; $("#liberar").hidden = !ESG.size; }
function consumoTxt(tipo, it) {
  const ks = [`${tipo}:${it.id}`, ...variantes(it).map(v => `${tipo}:${it.id}|${v}`)].filter(k => FICHAS[k]);
  if (!ks.length) return `sem baixa no estoque`;
  return `<span class="baixa">baixa: ${ks.map(k => (k.includes("|") ? k.split("|")[1] + ": " : "") + FICHAS[k].map(f => `${fmtQ(f.qtd)} ${esc(f.unidade)} ${esc(f.nome)}`).join(", ")).join(" · ")}</span>`;
}
function menuRow(tipo, it) {
  const off = esgotado(tipo, it.id), e = ESG.get(tipo + ":" + it.id);
  return `<div class="mi ${off ? "off" : ""}" data-t="${tipo}" data-i="${esc(it.id)}"><div class="mi-n"><b>${esc(it.nome)}</b><small>${esc(precoTxt(it))}${off && e ? ` · esgotado desde ${dia(e.desde)} ${hora(e.desde)}${e.por ? " (" + esc(e.por) + ")" : ""}` : ""}</small><small>${consumoTxt(tipo, it)}</small></div>
    <button class="btn b-line b-sm cons" type="button" data-ficha>Consumo</button>
    <button class="sw" type="button" role="switch" aria-checked="${!off}" data-sw aria-label="${esc(it.nome)}: ${off ? "esgotado" : "disponível"}"><span>${off ? "Esgotado" : "Disponível"}</span><i></i></button></div>`;
}
function renderMenu() {
  const q = $("#menuQ").value.trim().toLowerCase(), m = it => !q || it.nome.toLowerCase().includes(q);
  const loja = LOJA.filter(m);
  $("#menuList").innerHTML = (loja.length ? `<h3 class="menu-cat">Loja <small>retirada no café</small></h3>${loja.map(it => menuRow("loja", it)).join("")}` : "")
    + CATS.map(c => { const l = CARDAPIO.filter(i => i.cat === c && m(i)); return l.length ? `<h3 class="menu-cat">${esc(c)}</h3>${l.map(it => menuRow("cardapio", it)).join("")}` : ""; }).join("")
    || `<div class="empty">Nada encontrado.</div>`;
}
$("#menuQ").addEventListener("input", renderMenu);
$("#menuList").addEventListener("click", async e => {
  const row = e.target.closest("[data-t]"); if (!row) return; const tipo = row.dataset.t, it = achar(tipo, row.dataset.i);
  if (e.target.closest("[data-ficha]")) return openFicha(tipo, it);
  const sw = e.target.closest("[data-sw]"); if (!sw) return;
  const vaiEsgotar = !esgotado(tipo, it.id); sw.disabled = true;
  try { const r = await call("POST", "/admin/disponibilidade", { tipo, id: it.id, esgotado: vaiEsgotar }); ESG = new Map(r.esgotados.map(x => [x.tipo + ":" + x.item_id, x]));
    renderEsgCount(); renderMenu(); toast(`${it.nome}: ${vaiEsgotar ? "esgotado" : "disponível"} no site`); }
  catch (x) { toast(x.message); sw.disabled = false; }
});
$("#liberar").addEventListener("click", async () => { if (!confirm("Voltar todos os itens para disponível?")) return;
  try { const r = await call("POST", "/admin/disponibilidade", { liberarTudo: true }); ESG = new Map(r.esgotados.map(x => [x.tipo + ":" + x.item_id, x])); renderEsgCount(); renderMenu(); toast("Tudo disponível no site"); } catch (x) { toast(x.message); } });

/* consumo por venda (ficha) */
let fxItem = null;
function fRow(vs, l = {}) {
  const d = document.createElement("div"); d.className = "frow" + (vs.length ? "" : " nov");
  d.innerHTML = `${vs.length ? `<select class="in v" aria-label="Vale para"><option value="">Todas as opções</option>${vs.map(v => `<option ${v === l.variante ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>` : ""}
    <select class="in it" aria-label="Item do estoque">${STK.itens.map(i => `<option value="${i.id}" ${i.id === l.item_id ? "selected" : ""}>${esc(i.nome)}</option>`).join("")}</select>
    <input class="in q" inputmode="decimal" aria-label="Quantidade por venda" placeholder="0,018" value="${l.qtd != null ? esc(fmtQ(l.qtd)) : ""}"><span class="u"></span><button class="x" type="button" aria-label="Tirar linha">×</button>`;
  const u = () => { d.querySelector(".u").textContent = (STK.itens.find(i => i.id === +d.querySelector(".it").value) || {}).unidade || ""; };
  d.querySelector(".it").addEventListener("change", u); u(); return d;
}
async function openFicha(tipo, it) {
  if (!STK.itens.length) await loadStock(true);
  if (!STK.itens.length) return toast("Cadastre primeiro os itens do estoque (aba Estoque).");
  fxItem = { tipo, it }; const vs = variantes(it), rows = $("#frows"); rows.innerHTML = ""; $("#fichaErr").textContent = "";
  $("#fichaTitle").textContent = it.nome;
  $("#fichaSub").innerHTML = `Quanto sai do estoque em <b>uma</b> venda${tipo === "loja" ? " (o pedido da loja baixa quando você toca em “Cliente retirou”)" : " (baixa no pedido do balcão e em “Registrar vendas do dia”)"}. Use a unidade do item: 18 g de um item em kg = 0,018.${vs.length ? " “Todas as opções” vale para qualquer opção; as linhas de uma opção somam a ela." : ""}`;
  for (const k of [`${tipo}:${it.id}`, ...vs.map(v => `${tipo}:${it.id}|${v}`)]) (FICHAS[k] || []).forEach(f => rows.append(fRow(vs, { ...f, variante: k.split("|")[1] || "" })));
  if (!rows.children.length) rows.append(fRow(vs));
  $("#dlgFicha").showModal();
}
$("#fAdd").addEventListener("click", () => { const r = fRow(variantes(fxItem.it)); $("#frows").append(r); r.querySelector(".q").focus(); });
$("#frows").addEventListener("click", e => { if (e.target.closest(".x")) e.target.closest(".frow").remove(); });
$("#fichaForm").addEventListener("submit", async e => {
  e.preventDefault(); const err = $("#fichaErr"); err.textContent = "";
  const linhas = $$("#frows .frow").map(r => ({ variante: r.querySelector(".v") ? r.querySelector(".v").value : "", item_id: +r.querySelector(".it").value, qtd: parseQ(r.querySelector(".q").value), el: r.querySelector(".q") }));
  const ruim = linhas.find(l => !(l.qtd > 0)); if (ruim) { err.textContent = "Digite quanto sai em uma venda, por exemplo 0,018."; return ruim.el.focus(); }
  try { await call("POST", "/admin/ficha", { tipo: fxItem.tipo, id: fxItem.it.id, linhas: linhas.map(({ variante, item_id, qtd }) => ({ variante, item_id, qtd })) });
    $("#dlgFicha").close(); toast("Consumo salvo"); await loadFichas(true); renderMenu(); }
  catch (x) { err.textContent = x.message; }
});

/* ================= COMPRAS ================= */
function compras() {
  const low = STK.itens.filter(i => i.acabando), g = new Map();
  for (const i of low) { const f = i.fornecedor || "Sem fornecedor"; (g.get(f) || g.set(f, []).get(f)).push(i); }
  return [...g].sort((a, b) => a[0] === "Sem fornecedor" ? 1 : b[0] === "Sem fornecedor" ? -1 : a[0].localeCompare(b[0]));
}
const QTD = new Map();                                 // quantidade editada na lista (id → número)
const qtdCompra = i => QTD.has(i.id) ? QTD.get(i.id) : sugestao(i);
function textoCompra(grupos) {
  return [`*Lista de compras · ${CAFE}*`, `_${new Date().toLocaleDateString("pt-BR", TZ)}_`,
    ...grupos.flatMap(([f, l]) => ["", `*${f}*`, ...l.filter(i => qtdCompra(i) > 0).map(i => `• ${i.nome}: ${fmtQ(qtdCompra(i))} ${i.unidade}`)])].join("\n");
}
function renderShop() {
  const gs = compras();
  if (!gs.length) { $("#shop").innerHTML = STK.itens.length ? `<div class="empty">Nada no mínimo. Quando um item chegar ao mínimo, ele aparece aqui.</div>` : `<div class="empty">Cadastre os itens na aba <b>Estoque</b> com o mínimo de cada um. Os que chegarem ao mínimo aparecem aqui.</div>`; return; }
  $("#shop").innerHTML = gs.map(([f, l], k) => `<div class="grp" data-g="${k}"><div class="grp-h"><h3>${esc(f)}</h3><button class="btn b-line b-sm" type="button" data-copy="${k}">Copiar para o WhatsApp</button></div>
    ${l.map(i => `<div class="cl" data-id="${i.id}"><div><b>${esc(i.nome)}</b><small>tem ${fmtQ(i.quantidade)} ${esc(i.unidade)} · mínimo ${fmtQ(i.minimo)}</small></div>
      <label class="q"><input class="in" inputmode="decimal" value="${esc(fmtQ(qtdCompra(i)))}" aria-label="Quanto comprar de ${esc(i.nome)}"><span>${esc(i.unidade)}</span></label>
      <button class="btn b-verde b-sm" type="button" data-chegou>Chegou</button></div>`).join("")}</div>`).join("")
    + `<div class="foot-acts"><button class="btn b-line" type="button" data-copy="all">Copiar a lista inteira</button><a class="btn b-wa" id="shopWa" target="_blank" rel="noopener">Abrir no WhatsApp</a></div>`;
  $("#shopWa").href = "https://wa.me/?text=" + encodeURIComponent(textoCompra(gs));
}
$("#shop").addEventListener("input", e => { const r = e.target.closest("[data-id]"); if (!r) return; const v = parseQ(e.target.value); if (v >= 0) QTD.set(+r.dataset.id, v); $("#shopWa").href = "https://wa.me/?text=" + encodeURIComponent(textoCompra(compras())); });
$("#shop").addEventListener("click", async e => {
  const c = e.target.closest("[data-copy]");
  if (c) { const gs = compras(), sel = c.dataset.copy === "all" ? gs : [gs[+c.dataset.copy]]; toast(await copiar(textoCompra(sel)) ? "Lista copiada. Cole no WhatsApp do fornecedor." : "Não deu para copiar. Use “Abrir no WhatsApp”."); return; }
  const ch = e.target.closest("[data-chegou]"); if (!ch) return;
  const it = STK.itens.find(x => x.id === +ch.closest("[data-id]").dataset.id); openMov(it, "entrada", qtdCompra(it)); $("#movForm").motivo.value = "Compra";
});

/* ================= RESUMO ================= */
let dias = 1;
async function loadResumo() {
  let r; try { r = await call("GET", "/admin/resumo?dias=" + dias); } catch (e) { return toast(e.message); }
  $("#resPer").textContent = dias === 1 ? "Hoje, " + dataBR(r.ate) : `De ${dataBR(r.de).slice(0, 5)} a ${dataBR(r.ate).slice(0, 5)}`;
  const max = Math.max(1, ...r.porDia.map(d => d.receita)), maxT = Math.max(1, ...r.top.map(t => t.pedidos + t.vendas));
  const DS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  $("#resumo").innerHTML = `<div class="tiles">
      <div class="tile"><span>Pedidos</span><b>${r.pedidos}</b><small>${r.origem.site || 0} pelo site · ${r.origem.balcao || 0} no balcão${r.cancelados ? ` · ${r.cancelados} cancelado${r.cancelados > 1 ? "s" : ""}` : ""}</small></div>
      <div class="tile"><span>Receita dos pedidos</span><b>${brl(r.receita)}</b><small>${r.semValor ? `${r.semValor} pedido${r.semValor > 1 ? "s" : ""} “a consultar” sem valor informado` : "pedidos não cancelados"}</small></div>
      <div class="tile ${r.estoque.acabando ? "warn" : ""}"><span>Estoque acabando</span><b>${r.estoque.acabando}</b><small>de ${r.estoque.itens} itens cadastrados</small></div>
      <div class="tile ${r.estoque.vencidos ? "warn" : ""}"><span>Validade</span><b>${r.estoque.vencendo + r.estoque.vencidos}</b><small>${r.estoque.vencidos} vencido${r.estoque.vencidos === 1 ? "" : "s"} · ${r.estoque.vencendo} vencendo</small></div>
    </div>
    ${dias > 1 ? `<div class="card"><h3>Receita por dia</h3><div class="days">${r.porDia.map(d => `<div class="day ${d.dia === r.ate ? "today" : ""}"><span class="v">${d.receita ? brl(d.receita).replace(/,00$/, "") : "—"}</span><span class="b" data-h="${Math.round(d.receita / max * 100)}"></span><span class="d">${DS[new Date(d.dia + "T12:00:00-03:00").getUTCDay()]}</span></div>`).join("")}</div>
      <p class="note">${r.porDia.map(d => d.pedidos).reduce((a, b) => a + b, 0)} pedidos na semana. A receita conta só os pedidos (site e balcão), não o caixa inteiro do café.</p></div>` : ""}
    <div class="card"><h3>Mais vendidos</h3>${r.top.length ? `<ul class="rank">${r.top.map(t => `<li><b>${esc(t.nome)}</b><span>${t.pedidos + t.vendas}${t.vendas && t.pedidos ? ` (${t.pedidos} em pedidos)` : ""}</span><span class="bar2"><i data-w="${Math.round((t.pedidos + t.vendas) / maxT * 100)}"></i></span></li>`).join("")}</ul>
      <p class="note">Somando os pedidos e o que foi lançado em “Registrar vendas do dia”.</p>` : `<div class="empty">Ainda sem vendas no período.</div>`}</div>`;
  larguras($("#resumo")); alturas($("#resumo"));
}
$$("[data-dias]").forEach(b => b.addEventListener("click", () => { dias = +b.dataset.dias; $$("[data-dias]").forEach(x => x.setAttribute("aria-pressed", x === b)); loadResumo(); }));

/* ================= abas, entrar e sair ================= */
const TABS = ["pedidos", "estoque", "cardapio", "compras", "resumo"];
async function tab(t) {
  $$(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t)); TABS.forEach(x => { $("#t-" + x).hidden = x !== t; });
  scrollTo(0, 0);
  if (t === "pedidos") loadOrders(true);
  if (t === "estoque" || t === "compras") loadStock();
  if (t === "cardapio") { renderMenu(); await Promise.all([loadDisp(), loadFichas(true), STK.itens.length ? null : loadStock(true)]); renderMenu(); }
  if (t === "resumo") loadResumo();
}
$$(".tabs button").forEach(b => b.addEventListener("click", () => tab(b.dataset.tab)));
let timer = null;
function start() {
  setQuem((() => { try { return localStorage.getItem(CHAVE); } catch (e) { return ""; } })() || "Equipe");
  loadOrders(); loadStock(true); loadDisp(); loadFichas(true);
  clearInterval(timer); timer = setInterval(() => { if (!document.hidden) loadOrders(true); }, 5000);
  agendarChegada();
}
function openQuem() { $("#quemForm").quem.value = S.quem; $("#dlgQuem").showModal(); $("#quemForm").quem.focus(); }
$("#quemBtn").addEventListener("click", openQuem);
$("#quemForm").addEventListener("submit", e => { e.preventDefault(); setQuem(e.target.quem.value); $("#dlgQuem").close(); toast(S.quem ? `Olá, ${S.quem}!` : "Nome apagado"); });

/* um pedido de cliente "chega pelo site" a cada 45 s, e também na hora, pelo botão "Simular pedido de cliente" */
let chegada = null;
function agendarChegada() { clearInterval(chegada); chegada = setInterval(() => { if (demo.db && demo.db.pedidos.filter(p => p.status === "novo").length < 4) demo.db.novoSite(); }, 45000); }
async function simular() {
  const D = demo.db || (demo.db = demoDb());
  if (!D.novoSite()) { toast("Todos os produtos da loja estão esgotados. Libere algum na aba Cardápio."); return; }
  agendarChegada(); ligarSom();
  col = "novo"; if ($("#t-pedidos").hidden) await tab("pedidos"); else await loadOrders(true);
}
$$("[data-simular]").forEach(b => b.addEventListener("click", simular));

/* recomeçar: tudo volta aos dados de exemplo do início */
$("#recomecar").addEventListener("click", () => {
  if (!confirm("Recomeçar a demonstração? Os pedidos, o estoque e o cardápio voltam aos dados de exemplo do início.")) return;
  $$("dialog[open]").forEach(d => d.close());
  demo.db = demoDb(); conhecidos = null; PEDIDOS = []; FRESCOS.clear(); ESG = new Map(); FICHAS = {}; QTD.clear(); VEND = new Map();
  ver = "quadro"; col = "novo"; stkFiltro = "todos"; dias = 1;
  $$("[data-ver]").forEach(x => x.setAttribute("aria-pressed", x.dataset.ver === ver));
  $$("[data-sf]").forEach(x => x.setAttribute("aria-pressed", x.dataset.sf === stkFiltro));
  $$("[data-dias]").forEach(x => x.setAttribute("aria-pressed", +x.dataset.dias === dias));
  ["#stkQ", "#menuQ"].forEach(s => { $(s).value = ""; });
  start(); tab("pedidos"); toast("Demonstração recomeçada");
});
start();

/* ================= o "servidor" da demonstração (tudo no navegador, dados de EXEMPLO) ================= */
function demo(method, path, body) {
  const D = demo.db || (demo.db = demoDb());
  const u = new URL("https://x" + path), p = u.pathname, out = o => Promise.resolve(JSON.parse(JSON.stringify(o))), erro = m => Promise.reject(new Error(m));
  const agora = () => new Date().toISOString(), r3 = n => Math.round(n * 1000) / 1000;
  const aviso = i => { const hoje = hojeSP(), lim = hojeSP(new Date(Date.now() + 7.5 * 864e5)); return { ...i, acabando: i.quantidade <= i.minimo, vencido: !!i.validade && i.validade < hoje, vencendo: !!i.validade && i.validade >= hoje && i.validade <= lim }; };
  const movim = (i, saldo, tipo, motivo, ref) => { const delta = r3(saldo - i.quantidade); i.quantidade = saldo; i.atualizado_em = agora(); D.movs.push({ item_id: i.id, delta, saldo, tipo, motivo, ref, quem: body && body.quem, criado_em: agora() }); return delta; };
  const baixa = (ref, linhas, tipo, motivo) => { if (D.baixas.has(ref)) return []; D.baixas.add(ref); const uso = new Map();
    linhas.forEach(l => [l.tipo + ":" + l.id, l.variante && l.tipo + ":" + l.id + "|" + l.variante].forEach(k => (D.ficha[k] || []).forEach(([id, q]) => uso.set(id, (uso.get(id) || 0) + q * l.qtd))));
    return [...uso].map(([id, q]) => { const i = D.itens.find(x => x.id === id); if (!i) return null; const saldo = r3(Math.max(0, i.quantidade - q)), delta = movim(i, saldo, tipo, motivo, ref); return { nome: i.nome, delta, saldo, acabando: saldo <= i.minimo }; }).filter(Boolean); };
  const devolve = (ref, motivo) => { if (!D.baixas.delete(ref)) return false; const m = new Map(); D.movs.filter(x => x.ref === ref).forEach(x => m.set(x.item_id, (m.get(x.item_id) || 0) + x.delta));
    m.forEach((d, id) => { const i = D.itens.find(x => x.id === id); if (i && r3(d)) movim(i, r3(i.quantidade - d), "estorno", motivo, ref); }); return [...m.values()].some(d => r3(d)); };
  const linha = (l, tipoPadrao) => { const tipo = l.tipo || tipoPadrao, it = achar(tipo, l.id); if (!it) throw new Error("item desconhecido"); return { tipo, id: it.id, nome: it.nome, variante: l.variante || "", qtd: l.qtd, centavos: precoDe(it, l.variante || "") ?? null }; };
  const fichasOut = () => { const f = {}; Object.entries(D.ficha).forEach(([k, l]) => { const v = l.map(([id, qtd]) => { const i = D.itens.find(x => x.id === id); return i && { chave: k, item_id: id, qtd, nome: i.nome, unidade: i.unidade }; }).filter(Boolean); if (v.length) f[k] = v; }); return f; };
  try {
    if (p === "/admin/pedidos") { const v = u.searchParams.get("ver"), h0 = new Date(hojeSP() + "T00:00:00-03:00").toISOString();
      const l = v === "todos" ? D.pedidos.slice().reverse() : v === "hoje" ? D.pedidos.filter(x => x.criado_em >= h0).reverse() : D.pedidos.filter(x => ABERTOS_D.includes(x.status) || x.atualizado_em > new Date(Date.now() - 432e5).toISOString());
      return out({ pedidos: l }); }
    if (p === "/admin/pedido/status") { const o = D.pedidos.find(x => x.id === body.id), antes = o.status; if (antes === body.status) return out({ ok: true });
      o.status = body.status; o.antes = body.status === "cancelado" ? antes : null; o.atualizado_em = agora(); let estoque = null;
      if (body.status === "retirado") estoque = baixa(o.id, o.itens, "pedido", "Pedido " + o.id); else if (antes === "retirado" && devolve(o.id, "Pedido " + o.id + " desfeito")) estoque = "devolvido";
      return out({ ok: true, estoque }); }
    if (p === "/admin/pedido/balcao") { const itens = body.itens.map(l => linha(l, "loja")); const o = D.mk(String(body.nome || "").trim() || "Balcão", normTel(body.tel) || null, itens, "novo", Date.now(), "balcao", body.obs); D.pedidos.push(o); return out({ ok: true, pedido: o }); }
    if (p === "/admin/pedido/valor") { const o = D.pedidos.find(x => x.id === body.id); o.total_final = body.centavos; return out({ ok: true, total_final: body.centavos }); }
    if (p === "/admin/disponibilidade") { if (method === "POST") { if (body.liberarTudo) D.esg.clear(); else if (body.esgotado) D.esg.set(body.tipo + ":" + body.id, { tipo: body.tipo, item_id: body.id, desde: agora(), por: body.quem }); else D.esg.delete(body.tipo + ":" + body.id); }
      return out({ ok: true, esgotados: [...D.esg.values()] }); }
    if (p === "/admin/estoque") return out({ unidades: ["g", "kg", "un", "L", "ml"], categorias: D.C, venceEmDias: 7, itens: D.itens.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(aviso) });
    if (p === "/admin/estoque/item") { const nome = String(body.nome || "").trim(); if (nome.length < 2) return erro("Confira: nome do item");
      if (D.itens.some(x => x.nome.toLowerCase() === nome.toLowerCase() && x.id !== body.id)) return erro("Já existe um item com esse nome.");
      const campos = { nome, unidade: body.unidade, categoria: body.categoria, minimo: +body.minimo || 0, alvo: body.alvo ?? null, fornecedor: String(body.fornecedor || "").trim() || null, validade: body.validade || null, atualizado_em: agora() };
      if (body.id) { const i = D.itens.find(x => x.id === body.id); Object.assign(i, campos); return out({ ok: true, item: aviso(i) }); }
      const i = { id: ++D.sid, quantidade: 0, ...campos }; D.itens.push(i); if (+body.quantidade) movim(i, +body.quantidade, "ajuste", "cadastro", null); return out({ ok: true, item: aviso(i) }); }
    if (p === "/admin/estoque/mov") { const i = D.itens.find(x => x.id === body.id), q = +body.qtd, n = r3(body.tipo === "entrada" ? i.quantidade + q : body.tipo === "saida" ? i.quantidade - q : q);
      if (n < 0) return erro(`Só há ${fmtQ(i.quantidade)} ${i.unidade} de ${i.nome}.`); movim(i, n, body.tipo, body.motivo || "", null); return out({ ok: true, item: aviso(i) }); }
    if (p === "/admin/estoque/remover") { D.itens = D.itens.filter(x => x.id !== body.id); return out({ ok: true }); }
    if (p === "/admin/estoque/historico") { const id = +u.searchParams.get("id"); return out({ movimentos: D.movs.filter(m => !id || m.item_id === id).slice(-100).reverse().map(m => { const i = D.itens.find(x => x.id === m.item_id) || {}; return { ...m, nome: i.nome || "(removido)", unidade: i.unidade || "" }; }) }); }
    if (p === "/admin/fichas") return out({ fichas: fichasOut() });
    if (p === "/admin/ficha") { const vs = variantes(achar(body.tipo, body.id)); [body.tipo + ":" + body.id, ...vs.map(v => body.tipo + ":" + body.id + "|" + v)].forEach(k => delete D.ficha[k]);
      body.linhas.forEach(l => { const k = body.tipo + ":" + body.id + (l.variante ? "|" + l.variante : ""); (D.ficha[k] = D.ficha[k] || []).push([l.item_id, l.qtd]); }); return out({ ok: true }); }
    if (p === "/admin/vendas" && method === "GET") return out({ vendas: D.vendas.slice().reverse() });
    if (p === "/admin/vendas") { const linhas = body.itens.map(l => linha(l, "cardapio")), v = { id: D.vendas.length + 1, itens: linhas, quem: body.quem, criado_em: agora(), desfeita_em: null }; D.vendas.push(v);
      const b = baixa("V" + v.id, linhas, "venda", "Vendas do dia"), f = fichasOut();
      return out({ ok: true, id: v.id, baixa: b, semFicha: linhas.filter(l => !f[l.tipo + ":" + l.id] && !f[l.tipo + ":" + l.id + "|" + l.variante]).map(l => l.nome) }); }
    if (p === "/admin/vendas/desfazer") { const v = D.vendas.find(x => x.id === body.id); v.desfeita_em = agora(); devolve("V" + v.id, "Vendas do dia desfeitas"); return out({ ok: true }); }
    if (p === "/admin/resumo") { const n = +u.searchParams.get("dias") || 1, hoje = hojeSP();
      const lista = Array.from({ length: n }, (_, i) => hojeSP(new Date(Date.now() - i * 864e5))).reverse(), porDia = Object.fromEntries(lista.map(d => [d, { dia: d, pedidos: 0, receita: 0 }]));
      const top = new Map(), conta = (i, c) => { const k = i.nome + (i.variante ? ` (${i.variante})` : ""), t = top.get(k) || { nome: k, pedidos: 0, vendas: 0 }; t[c] += i.qtd; top.set(k, t); };
      let pedidos = 0, receita = 0, cancelados = 0, semValor = 0; const origem = { site: 0, balcao: 0 };
      D.pedidos.forEach(x => { const d = porDia[hojeSP(new Date(x.criado_em))]; if (!d) return; if (x.status === "cancelado") { cancelados++; return; } const v = x.total_final ?? x.total;
        pedidos++; receita += v; origem[x.origem]++; d.pedidos++; d.receita += v; if (x.consultar && x.total_final == null) semValor++; x.itens.forEach(i => conta(i, "pedidos")); });
      D.vendas.filter(v => !v.desfeita_em && porDia[hojeSP(new Date(v.criado_em))]).forEach(v => v.itens.forEach(i => conta(i, "vendas")));
      const e = D.itens.map(aviso);
      return out({ dias: n, de: lista[0], ate: hoje, pedidos, cancelados, receita, semValor, origem, porDia: lista.map(d => porDia[d]), top: [...top.values()].sort((a, b) => b.pedidos + b.vendas - a.pedidos - a.vendas).slice(0, 8),
        estoque: { itens: e.length, acabando: e.filter(x => x.acabando).length, vencendo: e.filter(x => x.vencendo).length, vencidos: e.filter(x => x.vencido).length } }); }
  } catch (x) { return erro(x.message); }
  return erro("não encontrado");
}
function demoDb() {
  /* sorteio com semente fixa: a demonstração começa sempre parecida (os pedidos que chegam depois usam Math.random) */
  let seed = 20261122; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = (l, r = rnd) => l[Math.floor(r() * l.length)];
  const agora = Date.now(), ago = m => new Date(agora - m * 60000).toISOString(), A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const cod = (pre, ms, r = rnd) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { ...TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return `${pre}${p.day}${p.month}-${p.hour}${p.minute}-${Array.from({ length: 4 }, () => A[Math.floor(r() * A.length)]).join("")}`; };
  const L = (tipo, id, variante, qtd) => { const it = achar(tipo, id); return { tipo, id, nome: it.nome, variante, qtd, centavos: precoDe(it, variante) ?? null }; };
  /* um pedido de EXEMPLO; ms = quando foi feito */
  const mk = (nome, tel, itens, status, ms, origem = "site", obs = "", r = rnd) => ({ id: cod(origem === "site" ? "S" : "C", ms, r), origem, nome, tel, itens, total: itens.reduce((s, i) => s + (i.centavos || 0) * i.qtd, 0), consultar: itens.some(i => i.centavos == null), total_final: null, obs: obs || "", status, antes: null, criado_em: new Date(ms).toISOString(), atualizado_em: new Date(Math.min(agora, ms + 3 * 60000)).toISOString() });
  const min = m => agora - m * 60000;

  /* ---- pedidos de hoje, em andamento (nomes inventados, celulares 41 9 0000-000x que não são de ninguém) ---- */
  const pedidos = [
    mk("Júlia (exemplo)", "41900000004", [L("loja", "graos-250", "Moído para filtro", 2)], "pronto", min(35)),
    mk("Marcos (exemplo)", null, [L("loja", "caneca", "", 1), L("loja", "graos-250", "Em grãos", 1)], "separando", min(18), "site", "Vou buscar depois das 16h"),
    mk("Balcão", null, [L("loja", "kit-presente", "", 1), L("loja", "drip-10", "", 1)], "novo", min(11), "balcao", "Embalar para presente"),
    mk("Carla (exemplo)", "41900000006", [L("loja", "graos-250", "Moído para espresso", 1), L("loja", "drip-10", "", 1)], "novo", min(4)),
  ];

  /* ---- histórico: uma semana de pedidos já retirados, para o Resumo ter barras ---- */
  const NOMES = ["Ana", "Bruno", "Camila", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Larissa", "Mateus", "Natália", "Otávio", "Paula", "Renato"].map(n => n + " (exemplo)");
  const BALCAO = [["cafes-cappuccino", "300 ml"], ["cafes-latte", "200 ml"], ["cafes-espresso", "Duplo"], ["cafes-coado-v60", "300 ml"], ["comer-pao-de-queijo", "Porção com 3"], ["comer-croissant", ""], ["doces-bolo-do-dia", ""], ["gelados-cold-brew", ""], ["doces-cookie", ""]];
  const loja = () => { const l = [L("loja", "graos-250", pick(["Em grãos", "Moído para filtro", "Moído para espresso"]), rnd() < .25 ? 2 : 1)]; if (rnd() < .35) l.push(L("loja", pick(["drip-10", "caneca"]), "", 1)); return l; };
  const balcao = () => { const n = 1 + Math.floor(rnd() * 3), l = []; for (let k = 0; k < n; k++) { const [id, v] = pick(BALCAO); if (!l.some(x => x.id === id)) l.push(L("cardapio", id, v, 1 + Math.floor(rnd() * 2))); } return l; };
  const passado = (ms) => { const site = rnd() < .5, o = site ? mk(pick(NOMES), null, loja(), "retirado", ms) : mk("Balcão", null, balcao(), "retirado", ms, "balcao");
    o.atualizado_em = new Date(Math.min(agora - 60000, ms + (25 + rnd() * 90) * 60000)).toISOString(); if (rnd() < .07) { o.status = "cancelado"; o.antes = "novo"; } return o; };
  const hist = [];
  for (let d = 6; d >= 1; d--) {
    const dia = hojeSP(new Date(agora - d * 864e5)), n = 3 + Math.floor(rnd() * 4) + (d === 1 || d === 6 ? 2 : 0);
    for (let k = 0; k < n; k++) { const h = 8 + Math.floor(rnd() * 10), m = Math.floor(rnd() * 60); hist.push(passado(Date.parse(`${dia}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`))); }
  }
  [150, 95].forEach(m => { if (hojeSP(new Date(min(m))) === hojeSP()) { const o = passado(min(m)); o.status = "retirado"; o.atualizado_em = ago(m - 30); hist.push(o); } });
  const kit = mk("Beatriz (exemplo)", null, [L("loja", "kit-presente", "", 1)], "retirado", Date.parse(`${hojeSP(new Date(agora - 2 * 864e5))}T15:20:00-03:00`)); kit.total_final = 12900; hist.push(kit);
  hist.sort((a, b) => a.criado_em.localeCompare(b.criado_em)); pedidos.unshift(...hist);

  /* ---- chegada de um pedido de cliente pelo site (automática a cada 45 s ou pelo botão) ---- */
  const CHEGAM = ["Pedro", "Luiza", "Rafael", "Beatriz", "Thiago", "Mariana", "Gustavo", "Helena", "Vinícius", "Sofia"].map(n => n + " (exemplo)"); let extra = 0;
  const novoSite = () => { const r = Math.random, disp = LOJA.filter(i => i.p != null && !db.esg.has("loja:" + i.id)); if (!disp.length) return null;
    const a = pick(disp, r), l = [L("loja", a.id, variantes(a).length ? pick(variantes(a), r) : "", r() < .3 ? 2 : 1)];
    const b = pick(disp, r); if (r() < .45 && b.id !== a.id) l.push(L("loja", b.id, variantes(b).length ? pick(variantes(b), r) : "", 1));
    const o = mk(CHEGAM[extra++ % CHEGAM.length], r() < .5 ? "4190000" + String(1000 + Math.floor(r() * 9000)) : null, l, "novo", Date.now(), "site", r() < .3 ? pick(["Passo aí na hora do almoço", "Pode deixar separado até as 18h?", "É para presente"], r) : "", r);
    db.pedidos.push(o); return o; };

  /* ---- estoque de EXEMPLO: nomes genéricos, quantidades e fornecedores inventados ---- */
  const C = ["Grãos e café", "Laticínios", "Cozinha", "Embalagens", "Produtos da loja", "Outros"];
  let sid = 0; const em = d => hojeSP(new Date(agora + d * 864e5));
  const it = (nome, unidade, quantidade, minimo, categoria, fornecedor, validade = null, alvo = null) => ({ id: ++sid, nome, unidade, quantidade, minimo, alvo, categoria, fornecedor, validade, atualizado_em: ago(60 * 24 * (sid % 4) + 30) });
  const TORRA = "Torrefação (exemplo)", LAT = "Laticínio (exemplo)", EMB = "Embalagens (exemplo)", PAD = "Padaria parceira (exemplo)", EMP = "Empório (exemplo)";
  const itens = [
    it("Café em grãos, blend espresso", "kg", 2.4, 3, C[0], TORRA, null, 8),            // 1 acabando
    it("Café em grãos, filtrado (V60)", "kg", 1.6, 1, C[0], TORRA, null, 3),            // 2
    it("Café 250 g para a loja (pacotes)", "un", 14, 8, C[4], TORRA, null, 24),         // 3
    it("Drip coffee, caixas com 10", "un", 5, 6, C[4], TORRA, null, 15),                // 4 acabando
    it("Leite integral", "L", 18, 12, C[1], LAT, em(2), 36),                            // 5 vence em 2 dias
    it("Leite de aveia", "L", 4, 6, C[1], "Distribuidor (exemplo)", em(60), 12),        // 6 acabando
    it("Croissant congelado", "un", 26, 20, C[2], PAD, em(20), 60),                     // 7
    it("Pão de queijo congelado", "kg", 3.5, 2, C[2], PAD, em(45)),                     // 8
    it("Cacau em pó", "kg", 0.8, 0.5, C[2], EMP),                                       // 9
    it("Chá em sachês", "un", 40, 30, C[2], EMP),                                       // 10
    it("Copo 300 ml para viagem", "un", 140, 150, C[3], EMB, null, 500),                // 11 acabando
    it("Tampa para copo 300 ml", "un", 90, 150, C[3], EMB, null, 500),                  // 12 acabando
    it("Saquinho kraft para doces", "un", 210, 100, C[3], EMB),                         // 13
    it("Caneca de cerâmica", "un", 3, 3, C[4], "Ateliê de cerâmica (exemplo)", null, 10), // 14 no mínimo
    it("Bolo do dia (fatias)", "un", 6, 4, C[2], "Cozinha da casa"),                    // 15
  ];
  /* consumo por venda de EXEMPLO (id do item do estoque, quanto sai) */
  const ficha = {
    "loja:graos-250": [[3, 1]], "loja:drip-10": [[4, 1]], "loja:caneca": [[14, 1]],
    "cardapio:cafes-espresso|Simples": [[1, 0.009]], "cardapio:cafes-espresso|Duplo": [[1, 0.018]],
    "cardapio:cafes-coado-v60|200 ml": [[2, 0.015]], "cardapio:cafes-coado-v60|300 ml": [[2, 0.022]],
    "cardapio:cafes-cappuccino|200 ml": [[1, 0.018], [5, 0.12]], "cardapio:cafes-cappuccino|300 ml": [[1, 0.018], [5, 0.2]],
    "cardapio:cafes-latte|200 ml": [[1, 0.018], [5, 0.15]], "cardapio:cafes-latte|300 ml": [[1, 0.018], [5, 0.24]],
    "cardapio:gelados-cold-brew": [[2, 0.03], [11, 1], [12, 1]],
    "cardapio:comer-croissant": [[7, 1]], "cardapio:comer-croissant-recheado": [[7, 1]],
    "cardapio:comer-pao-de-queijo|1 unidade": [[8, 0.035]], "cardapio:comer-pao-de-queijo|Porção com 3": [[8, 0.105]],
    "cardapio:semcafe-chocolate-quente": [[9, 0.025], [5, 0.2]], "cardapio:semcafe-cha": [[10, 1]], "cardapio:doces-bolo-do-dia": [[15, 1]],
  };

  /* ---- vendas do dia lançadas nos dias anteriores (entram em "Mais vendidos") ---- */
  const VEND = [["cafes-espresso", "Simples", 14], ["cafes-cappuccino", "300 ml", 10], ["cafes-latte", "200 ml", 8], ["cafes-coado-v60", "300 ml", 5], ["comer-pao-de-queijo", "1 unidade", 16], ["comer-croissant", "", 6], ["doces-bolo-do-dia", "", 5], ["gelados-cold-brew", "", 3]];
  const vendas = [];
  for (let d = 6; d >= 1; d--) vendas.push({ id: vendas.length + 1, quem: pick(["Ana (exemplo)", "Bruno (exemplo)"]), criado_em: new Date(Date.parse(`${hojeSP(new Date(agora - d * 864e5))}T19:10:00-03:00`)).toISOString(), desfeita_em: null,
    itens: VEND.map(([id, v, q]) => L("cardapio", id, v, Math.max(1, Math.round(q * (.6 + rnd() * .8))))) });

  /* ---- alguns movimentos antigos, para o Histórico não começar vazio (terminam na quantidade de hoje) ---- */
  const movs = [];
  [[1, 5, 1.6, "Compra", 3], [5, 24, 9, "Compra", 2], [7, 30, 8, "Compra", 4], [11, 300, 95, "Compra", 5], [12, 300, 60, "Compra", 5], [3, 12, 4, "Compra", 6], [6, 6, 3, "Compra", 3]].forEach(([id, entrou, saiu, motivo, d]) => {
    const i = itens.find(x => x.id === id), antes = Math.round((i.quantidade + saiu - entrou) * 1000) / 1000;
    movs.push({ item_id: id, delta: entrou, saldo: Math.round((antes + entrou) * 1000) / 1000, tipo: "entrada", motivo, ref: null, quem: "Ana (exemplo)", criado_em: ago(60 * 24 * d + 600) });
    movs.push({ item_id: id, delta: -saiu, saldo: i.quantidade, tipo: "venda", motivo: "Vendas do dia", ref: null, quem: "Bruno (exemplo)", criado_em: ago(60 * 24 + 300 + id) });
  });
  movs.sort((a, b) => a.criado_em.localeCompare(b.criado_em));

  const db = { pedidos, mk: (nome, tel, itens, status, ms, origem, obs) => mk(nome, tel, itens, status, ms, origem, obs, Math.random), novoSite, itens, movs, ficha, C, vendas,
    baixas: new Set(pedidos.filter(p => p.status === "retirado").map(p => p.id)),
    esg: new Map([["cardapio:doces-torta-de-limao", { tipo: "cardapio", item_id: "doces-torta-de-limao", desde: ago(90), por: "Ana (exemplo)" }]]),
    get sid() { return sid; }, set sid(v) { sid = v; } };
  return db;
}
