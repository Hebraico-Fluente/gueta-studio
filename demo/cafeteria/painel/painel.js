/* Painel para cafeterias · DEMONSTRAÇÃO com o "Café Modelo", uma rede FICTÍCIA de cafeterias com quatro lojas.
   É o mesmo painel usado de verdade, mas aqui ele roda 100% no navegador: não há servidor, login nem chamada
   de rede (a CSP da página bloqueia qualquer conexão). Os dados são de EXEMPLO e ficam só neste navegador,
   compartilhados entre as abas abertas (painel, tela do cliente, telão), até "Recomeçar demonstração".
   Preferências de tela (quem está no balcão, loja, perfil) ficam guardadas à parte.
   Tudo o que vai para a tela passa por esc(), como no painel real. */
import { $, $$, esc, brl, fmtQ, pct, parseQ, TZ, hora, dia, hojeSP, dataBR, normTel, telFmt, linhaNome, primeiro, semAcento, embutido, copiar, larguras, alturas, setHtml, toast, fechaDialogos } from "../comum/util.js";
import { CARDAPIO, LOJA, LOJAS, lojaNome, variantes, precoDe, achar } from "../comum/catalogo.js";
import { api, ouvir, recomecar, sugestao, META_SELOS } from "../comum/dados.js";
import { criarSom } from "../comum/som.js";
import { registrarApp, criarTelaAcesa, instalado, ehIOS } from "../comum/app.js";

const CAFE = "Café Modelo";
const TITULO = "Painel para cafeterias: demonstração ao vivo · Gueta Studio";
if (embutido) document.documentElement.classList.add("embed");
fechaDialogos();

/* ---------- preferências desta tela (não fazem parte dos dados da demonstração) ---------- */
const PREF = { quem: "cafe-modelo-demo-quem", loja: "cafe-modelo-demo-loja", perfil: "cafe-modelo-demo-perfil" };
const lerPref = k => { try { return localStorage.getItem(PREF[k]) || ""; } catch (e) { return ""; } };
const gravarPref = (k, v) => { try { localStorage.setItem(PREF[k], v); } catch (e) {} };
const S = { quem: "", loja: "centro", perfil: "dono" };
function setQuem(q) { S.quem = String(q || "").trim().slice(0, 30); $("#quemTxt").textContent = S.quem || "Quem está aqui?"; gravarPref("quem", S.quem); }

/* Na demonstração não existe servidor: cada "chamada" é respondida por api(), aqui mesmo no navegador. */
function call(method, path, body) {
  if (method === "GET") return api("GET", /[?&]loja=/.test(path) ? path : path + (path.includes("?") ? "&" : "?") + "loja=" + S.loja);
  return api(method, path, { loja: S.loja, ...body, quem: S.quem });
}

/* ---------- catálogo ---------- */
const CATS = [...new Set(CARDAPIO.map(i => i.cat))];
const precoTxt = it => Array.isArray(it.p) ? it.p.map(([v, c]) => `${v} ${brl(c)}`).join(" · ") : brl(it.p);
let ESG = new Map();                                   // "loja:graos-250" → {desde, por}
const esgotado = (tipo, id) => ESG.has(tipo + ":" + id);
/* 0,018 kg → 18 g · 0,2 L → 200 ml (só para mostrar) */
const qtdNat = (q, u) => u === "kg" && q < 1 ? `${fmtQ(Math.round(q * 1e4) / 10)} g` : u === "L" && q < 1 ? `${fmtQ(Math.round(q * 1e4) / 10)} ml` : `${fmtQ(q)} ${u}`;
const custoUn = u => u === "un" ? "R$ por unidade" : `R$ por ${u}`;

/* ---------- lojas e perfis ---------- */
let NOVOS = [];
function renderLojas() {
  const n = l => NOVOS.filter(x => x.loja === l).length;
  setHtml($("#lojaSel"), LOJAS.map(l => `<option value="${esc(l.id)}" ${l.id === S.loja ? "selected" : ""}>${esc(l.nome)}${n(l.id) && l.id !== S.loja ? ` · ${n(l.id)} novo${n(l.id) > 1 ? "s" : ""}` : ""}</option>`).join(""));
  $("#lojaSel").value = S.loja;
  $("#telaoLink").href = "../telao/?loja=" + encodeURIComponent(S.loja);
}
function setLoja(id, silencioso) {
  if (!LOJAS.some(l => l.id === id)) id = "centro";
  const mudou = id !== S.loja; S.loja = id; gravarPref("loja", id);
  if (!mudou) return renderLojas();
  ESG = new Map(); QTD.clear(); FRESCOS.clear(); OUTRAS = {}; renderLojas();
  if (!silencioso) toast(`Agora no painel: ${lojaNome(id)}`);
  carregarTudo(); tab(atual, true);
}
$("#lojaSel").addEventListener("change", e => setLoja(e.target.value));
const SO_DONO = ["estoque", "fichas", "compras", "avaliacoes", "resumo"];
function setPerfil(p, avisar) {
  S.perfil = p === "barista" ? "barista" : "dono"; gravarPref("perfil", S.perfil);
  document.body.classList.toggle("barista", S.perfil === "barista");
  $$("[data-perfil]").forEach(b => b.setAttribute("aria-pressed", b.dataset.perfil === S.perfil));
  $("#perfilNote").hidden = S.perfil !== "barista";
  if (S.perfil === "barista" && SO_DONO.includes(atual)) tab("pedidos");
  else if (atual === "fidelidade") renderFid();
  if (avisar) toast(S.perfil === "barista" ? "Perfil Barista: pedidos, cardápio e fidelidade" : "Perfil Dono: tudo liberado");
}
$$("[data-perfil]").forEach(b => b.addEventListener("click", () => setPerfil(b.dataset.perfil, true)));

/* ================= PEDIDOS ================= */
const ETAPA = { novo: "Novo", separando: "Separando", pronto: "Pronto", retirado: "Retirado", cancelado: "Cancelado" };
const NEXT = { novo: ["separando", "Separar", "b-car"], separando: ["pronto", "Pronto para retirar", "b-ocre"], pronto: ["retirado", "Cliente retirou", "b-verde"] };
const PREV = { separando: "novo", pronto: "separando" };
const COLS = [["novo", "Novos", "var(--acc)"], ["separando", "Separando", "var(--ocre)"], ["pronto", "Prontos para retirar", "var(--verde)"], ["fim", "Retirados e cancelados", "var(--muted)"]];
let ver = "quadro", col = "novo", conhecidos = null, PEDIDOS = [];
const FRESCOS = new Map();                             // pedido novo → quando chegou (fica destacado por 15 s)

/* pedidos novos em QUALQUER loja: aviso sonoro na loja aberta, recado das outras */
async function verNovos() {
  let novos; try { ({ novos } = await api("GET", "/admin/novos")); } catch (e) { return; }
  NOVOS = novos; renderLojas();
  const chegaram = conhecidos ? novos.filter(p => !conhecidos.has(p.id)) : [];
  conhecidos = new Set([...(conhecidos || []), ...novos.map(p => p.id)]);
  if (!chegaram.length) return;
  const aqui = chegaram.filter(p => p.loja === S.loja), fora = chegaram.filter(p => p.loja !== S.loja);
  if (embutido && fora.length && !aqui.length && fora[fora.length - 1].origem === "site") { const p = fora[fora.length - 1]; setLoja(p.loja, true); aqui.push(p); fora.splice(fora.indexOf(p), 1); }
  const t = Date.now(); aqui.forEach(p => FRESCOS.set(p.id, t));
  if (aqui.length) { if (!embutido) som.tocar("novo"); toast(aqui.length === 1 ? `Pedido novo: ${aqui[0].nome}` : `${aqui.length} pedidos novos`); col = "novo"; }
  else toast(fora.length === 1 ? `Pedido novo na ${lojaNome(fora[0].loja)}: ${fora[0].nome}` : `${fora.length} pedidos novos em outras lojas`);
}
async function loadOrders(silent) {
  try {
    const { pedidos } = await call("GET", "/admin/pedidos?ver=" + ver);
    setLive(true);
    const t = Date.now(); FRESCOS.forEach((v, k) => { if (t - v > 15000) FRESCOS.delete(k); });
    PEDIDOS = pedidos; renderOrders(new Set(FRESCOS.keys()));
  } catch (e) { setLive(false); if (!silent) toast(e.message); }
}
function avisoTxt(p) { return `Olá, ${primeiro(p.nome)}! Seu pedido ${p.id.slice(-4)} do ${CAFE} (${lojaNome(p.loja)}) está pronto para retirar. Te esperamos no café ☕`; }
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
    ${p.tel ? `<small class="sum">Celular: ${esc(telFmt(p.tel))} · <span class="selo-mini">${p.selos} selo${p.selos === 1 ? "" : "s"}</span></small>` : ""}
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
  setHtml($("#sum"), ver === "quadro" ? `<b>${PEDIDOS.filter(p => !["retirado", "cancelado"].includes(p.status)).length}</b> em andamento · ${esc(lojaNome(S.loja))}`
    : `<b>${validos.length}</b> pedido${validos.length === 1 ? "" : "s"} · <b>${brl(fat)}</b>${validos.some(p => p.consultar && p.total_final == null) ? " + a consultar" : ""}`);
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
    const selo = r.selo ? (r.selo.ganhou > 0 ? (r.selo.selos >= META_SELOS ? ` · ${r.selo.selos} selos: a próxima bebida é por nossa conta!` : ` · +1 selo (${r.selo.selos} de ${META_SELOS})`) : " · selo retirado") : "";
    toast(ETAPA[st] + est + selo);
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
  const q = semAcento($("#novoForm").q.value.trim());
  const l = todos().filter(x => !q || semAcento(x.it.nome + " " + x.grupo).includes(q));
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
const som = criarSom();
function ligarSom() { const ok = som.ligar(); const b = $("#som"); b.classList.toggle("on", ok); b.textContent = ok ? "🔔 Som ligado" : "🔕 Sem som"; }
addEventListener("pointerdown", ligarSom, { once: true });
$("#som").addEventListener("click", () => { ligarSom(); som.tocar("novo"); });
function setLive(on) { $("#live").classList.toggle("off", !on); $("#liveTxt").textContent = on ? "ao vivo" : "sem conexão"; }

/* ================= ESTOQUE ================= */
let STK = { itens: [], unidades: [], categorias: [], venceEmDias: 7 }, stkFiltro = "todos", movItem = null, OUTRAS = {};
async function loadStock(silent) {
  try { STK = await call("GET", "/admin/estoque"); renderStock(); if (!$("#shop").contains(document.activeElement)) renderShop(); if (atual === "cardapio") renderMenu(); }
  catch (e) { if (!silent) toast(e.message); }
}
const valTag = i => i.vencido ? `<span class="tag red">venceu ${dataBR(i.validade).slice(0, 5)}</span>` : i.vencendo ? `<span class="tag ocre">vence ${dataBR(i.validade).slice(0, 5)}</span>` : "";
function renderStock() {
  const low = STK.itens.filter(i => i.acabando), venc = STK.itens.filter(i => i.vencido || i.vencendo);
  $("#nLow").hidden = !low.length; $("#nLow").textContent = low.length;
  $("#nCompras").hidden = !low.length; $("#nCompras").textContent = low.length;
  setHtml($("#stkAlert"), (low.length ? `<div class="alert red"><span>${low.length} ite${low.length > 1 ? "ns" : "m"} no mínimo ou abaixo · ${esc(lojaNome(S.loja))}</span><button class="btn b-sm b-m" type="button" data-go="compras">Ver lista de compras</button></div>` : "")
    + (venc.length ? `<div class="alert ocre"><span>${venc.filter(i => i.vencido).length ? venc.filter(i => i.vencido).length + " vencido(s) · " : ""}${venc.filter(i => i.vencendo).length} vencendo em até ${STK.venceEmDias} dias</span><button class="btn b-sm b-line" type="button" data-sf2="validade">Ver</button></div>` : ""));
  const q = semAcento($("#stkQ").value.trim());
  const l = STK.itens.filter(i => (stkFiltro === "todos" || (stkFiltro === "baixo" ? i.acabando : (i.vencido || i.vencendo))) && (!q || semAcento(i.nome + " " + (i.fornecedor || "") + " " + (i.ean || "")).includes(q)));
  if (!STK.itens.length) { setHtml($("#stkList"), `<div class="empty">Nenhum item ainda. Toque em <b>+ Novo item</b> e cadastre o que o café usa e vende: grãos, leite, copos, produtos da loja…</div>`); return; }
  if (!l.length) { setHtml($("#stkList"), `<div class="empty">Nenhum item encontrado.</div>`); return; }
  const cats = STK.categorias.filter(c => l.some(i => i.categoria === c));
  setHtml($("#stkList"), cats.map(c => `<h3 class="cat-h">${esc(c)}</h3><div class="stk">${l.filter(i => i.categoria === c).map(i => `
    <div class="it ${i.acabando ? "low" : (i.vencido || i.vencendo) ? "venc" : ""}" data-id="${i.id}">
      <div class="it-n"><button type="button" data-mov>${esc(i.nome)}</button>
        <small>${i.acabando ? `<span class="tag red">acabando</span> ` : ""}${valTag(i)} mínimo ${fmtQ(i.minimo)} ${esc(i.unidade)}${i.custo != null ? ` · ${brl(i.custo)}/${esc(i.unidade)}` : ""}${i.fornecedor ? " · " + esc(i.fornecedor) : ""}</small></div>
      <div class="it-q"><b>${fmtQ(i.quantidade)}</b><span>${esc(i.unidade)}</span></div>
      <div class="it-a"><button class="btn b-line b-sm" type="button" data-q="-1" aria-label="Saiu 1 ${esc(i.unidade)} de ${esc(i.nome)}">−1</button><button class="btn b-line b-sm" type="button" data-q="1" aria-label="Entrou 1 ${esc(i.unidade)} de ${esc(i.nome)}">+1</button><button class="btn b-m b-sm" type="button" data-mov>Movimentar</button></div>
    </div>`).join("")}</div>`).join(""));
}
async function mov(id, tipo, qtd, motivo) {
  const r = await call("POST", "/admin/estoque/mov", { id, tipo, qtd, motivo });
  const k = STK.itens.findIndex(x => x.id === r.item.id); if (k >= 0) STK.itens[k] = r.item; renderStock(); renderShop(); return r.item;
}
$("#stkList").addEventListener("click", async e => {
  const row = e.target.closest("[data-id]"); if (!row) return; const it = STK.itens.find(x => x.id === +row.dataset.id); if (!it) return;
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
  if (it) { f.nome.value = it.nome; f.unidade.value = it.unidade; f.categoria.value = it.categoria; f.minimo.value = fmtQ(it.minimo); f.alvo.value = it.alvo != null ? fmtQ(it.alvo) : ""; f.fornecedor.value = it.fornecedor || ""; f.validade.value = it.validade || "";
    f.custo.value = it.custo != null ? (it.custo / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : ""; f.ean.value = it.ean || ""; }
  $("#custoLbl").textContent = "Custo (" + custoUn(f.unidade.value) + ")";
  f.dataset.id = it ? it.id : ""; $("#dlgItem").showModal(); f.nome.focus();
}
$("#itemForm").unidade.addEventListener("change", e => { $("#custoLbl").textContent = "Custo (" + custoUn(e.target.value) + ")"; });
$("#stkNew").addEventListener("click", () => openItem(null));
$("#itemForm").addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target, err = $("#itemErr"); err.textContent = "";
  const n = v => v.trim() ? parseQ(v) : null, minimo = n(f.minimo.value) ?? 0, quantidade = n(f.quantidade.value) ?? 0, alvo = n(f.alvo.value), custo = n(f.custo.value);
  if (f.nome.value.trim().length < 2) { err.textContent = "Digite o nome do item."; return f.nome.focus(); }
  if (!(minimo >= 0) || !(quantidade >= 0) || (alvo !== null && !(alvo > 0)) || (custo !== null && !(custo >= 0))) { err.textContent = "Use só números, por exemplo 2,5."; return; }
  const ean = f.ean.value.replace(/\D/g, ""); if (ean && !/^\d{8}$|^\d{12,14}$/.test(ean)) { err.textContent = "O código de barras tem 8 ou 13 dígitos."; return f.ean.focus(); }
  try {
    await call("POST", "/admin/estoque/item", { id: f.dataset.id ? +f.dataset.id : undefined, nome: f.nome.value, unidade: f.unidade.value, categoria: f.categoria.value, minimo, quantidade, alvo, fornecedor: f.fornecedor.value, validade: f.validade.value || null, custo: custo == null ? null : Math.round(custo * 10000) / 100, ean });
    $("#dlgItem").close(); toast("Item salvo"); loadStock(true);
  } catch (x) { err.textContent = x.message; }
});
$("#itemDel").addEventListener("click", async () => {
  const id = +$("#itemForm").dataset.id, it = STK.itens.find(x => x.id === id);
  if (!confirm(`Remover "${it.nome}" do estoque desta loja? O histórico fica guardado.`)) return;
  try { await call("POST", "/admin/estoque/remover", { id }); $("#dlgItem").close(); toast("Item removido"); loadStock(true); } catch (x) { toast(x.message); }
});

const MOTIVOS = { entrada: ["Compra", "Devolução", "Produção da casa"], saida: ["Uso no café", "Perda / quebra", "Vencido", "Degustação"], ajuste: ["Contagem"], transferir: ["Faltou na outra loja", "Reposição da semana"] };
const TIPO_TXT = { entrada: "entrada", saida: "saída", ajuste: "ajuste", pedido: "pedido", venda: "vendas do dia", estorno: "devolvido", transferencia: "transferência" };
function movPreview() {
  const f = $("#movForm"), it = movItem, q = parseQ(f.qtd.value), t = f.tipo.value, tr = t === "transferir";
  $("#movParaLbl").hidden = !tr;
  $("#movQtdLbl span").textContent = t === "ajuste" ? `Quanto tem agora (${it.unidade})` : t === "entrada" ? `Quanto entrou (${it.unidade})` : tr ? `Quanto vai para a outra loja (${it.unidade})` : `Quanto saiu (${it.unidade})`;
  setHtml($("#movQuick"), MOTIVOS[t].map(m => `<button type="button" data-m="${esc(m)}">${esc(m)}</button>`).join(""));
  if (!(q >= 0)) { $("#movPrev").innerHTML = `Agora: <b>${fmtQ(it.quantidade)} ${esc(it.unidade)}</b>`; return; }
  if (tr) {
    const dest = (OUTRAS[f.para.value] || []).find(x => x.sku === it.sku), n = Math.round((it.quantidade - q) * 1000) / 1000, d0 = dest ? dest.quantidade : 0;
    $("#movPrev").innerHTML = `${esc(lojaNome(S.loja))}: <b>${fmtQ(it.quantidade)} → ${fmtQ(n)} ${esc(it.unidade)}</b> · ${esc(lojaNome(f.para.value))}: <b>${fmtQ(d0)} → ${fmtQ(Math.round((d0 + q) * 1000) / 1000)} ${esc(it.unidade)}</b>${n < 0 ? " · não pode ficar negativo" : ""}${dest ? "" : " · o item é criado lá"}`;
    return;
  }
  const n = Math.round((t === "entrada" ? it.quantidade + q : t === "saida" ? it.quantidade - q : q) * 1000) / 1000;
  $("#movPrev").innerHTML = `Agora: <b>${fmtQ(it.quantidade)} ${esc(it.unidade)}</b> → depois: <b>${fmtQ(n)} ${esc(it.unidade)}</b>${n < 0 ? " · não pode ficar negativo" : n <= it.minimo ? " · vai ficar no mínimo ou abaixo" : ""}`;
}
const histLi = (m, nome) => `<li><span>${dia(m.criado_em)} ${hora(m.criado_em)} · ${nome ? `<b>${esc(m.nome)}</b> · ` : ""}${esc(TIPO_TXT[m.tipo] || m.tipo)}${m.motivo ? " · " + esc(m.motivo) : ""}${m.quem ? " · " + esc(m.quem) : ""}</span><span class="d ${m.delta < 0 ? "neg" : "pos"}">${m.delta > 0 ? "+" : ""}${fmtQ(m.delta)} → ${fmtQ(m.saldo)}${nome ? " " + esc(m.unidade) : ""}</span></li>`;
async function openMov(it, tipo = "entrada", qtd = "") {
  movItem = it; const f = $("#movForm"); f.reset(); f.tipo.value = tipo; f.qtd.value = qtd ? fmtQ(qtd) : ""; $("#movErr").textContent = ""; $("#movTitle").textContent = it.nome;
  f.para.innerHTML = LOJAS.filter(l => l.id !== S.loja).map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join("");
  movPreview(); $("#movHist").innerHTML = ""; $("#dlgMov").showModal(); f.qtd.focus();
  try {
    const [{ movimentos }] = await Promise.all([call("GET", "/admin/estoque/historico?id=" + it.id),
      ...LOJAS.filter(l => l.id !== S.loja).map(l => call("GET", "/admin/estoque?loja=" + l.id).then(r => { OUTRAS[l.id] = r.itens; }))]);
    $("#movHist").innerHTML = movimentos.map(m => histLi(m)).join(""); movPreview();
  } catch (x) {}
}
$("#movForm").addEventListener("input", movPreview);
$("#movForm").addEventListener("change", movPreview);
$("#movQuick").addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (b) $("#movForm").motivo.value = b.dataset.m; });
$("#movEdit").addEventListener("click", () => { $("#dlgMov").close(); openItem(movItem); });
$("#movForm").addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target, q = parseQ(f.qtd.value), err = $("#movErr"); err.textContent = "";
  if (!(q >= 0) || (f.tipo.value !== "ajuste" && q === 0)) { err.textContent = "Digite a quantidade, por exemplo 2,5."; return f.qtd.focus(); }
  try {
    if (f.tipo.value === "transferir") {
      const r = await call("POST", "/admin/estoque/transferir", { id: movItem.id, para: f.para.value, qtd: q, motivo: f.motivo.value.trim() });
      $("#dlgMov").close(); toast(`Transferido: ${fmtQ(q)} ${r.item.unidade} de ${r.item.nome} para ${lojaNome(f.para.value)}`); loadStock(true); return;
    }
    const n = await mov(movItem.id, f.tipo.value, q, f.motivo.value.trim()); $("#dlgMov").close(); toast(`${n.nome}: ${fmtQ(n.quantidade)} ${n.unidade}${n.acabando ? " · acabando" : ""}`);
  } catch (x) { err.textContent = x.message; }
});
$("#histBtn").addEventListener("click", async () => {
  $("#histList").innerHTML = `<li><span>Carregando…</span></li>`; $("#dlgHist").showModal();
  try { const { movimentos } = await call("GET", "/admin/estoque/historico"); $("#histList").innerHTML = movimentos.length ? movimentos.map(m => histLi(m, true)).join("") : `<li><span>Nenhum movimento ainda.</span></li>`; }
  catch (x) { $("#histList").innerHTML = `<li><span>${esc(x.message)}</span></li>`; }
});

/* ---------- leitor de código de barras ---------- */
let camStream = null, camTimer = null;
function pararCamera() { clearInterval(camTimer); camTimer = null; if (camStream) camStream.getTracks().forEach(t => t.stop()); camStream = null; const v = $("#camVideo"); v.srcObject = null; $("#camBox").hidden = true; $("#camBtn").textContent = "📷 Usar a câmera"; }
function abrirCodigo() {
  const f = $("#codForm"); f.reset(); $("#codErr").textContent = ""; $("#camMsg").textContent = "";
  const ex = STK.itens.filter(i => i.ean).slice(0, 6);
  setHtml($("#codEx"), ex.map(i => `<button type="button" data-ean="${esc(i.ean)}">${esc(i.ean)} · ${esc(i.nome.split(",")[0])}</button>`).join(""));
  $("#dlgCodigo").showModal();
}
function acharCodigo(cod) {
  const c = String(cod || "").replace(/\D/g, ""); if (!c) { $("#codErr").textContent = "Digite ou leia um código."; return false; }
  const it = STK.itens.find(i => i.ean === c);
  if (!it) { $("#codErr").textContent = `Nenhum item de ${lojaNome(S.loja)} com o código ${c}. Cadastre o código no item (Editar item).`; return false; }
  pararCamera(); $("#dlgCodigo").close(); openMov(it, "entrada"); $("#movForm").motivo.value = "Compra"; toast(`Código lido: ${it.nome}`); return true;
}
$("#codBtn").addEventListener("click", async () => { if (!STK.itens.length) await loadStock(true); abrirCodigo(); });
$("#codEx").addEventListener("click", e => { const b = e.target.closest("[data-ean]"); if (b) { $("#codForm").cod.value = b.dataset.ean; acharCodigo(b.dataset.ean); } });
$("#codForm").addEventListener("submit", e => { e.preventDefault(); acharCodigo(e.target.cod.value); });
$("#dlgCodigo").addEventListener("close", pararCamera);
$("#camBtn").addEventListener("click", async () => {
  if (camStream) return pararCamera();
  const msg = $("#camMsg");
  if (!("BarcodeDetector" in window) || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { msg.textContent = "Este navegador não lê código pela câmera (funciona no Chrome do Android e em tablets Android). Digite o código abaixo."; return; }
  let det; try { const fs = await BarcodeDetector.getSupportedFormats(); det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"].filter(x => fs.includes(x)) }); }
  catch (e) { msg.textContent = "A leitura pela câmera não está disponível aqui. Digite o código abaixo."; return; }
  try { camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); }
  catch (e) { msg.textContent = "Sem acesso à câmera (permissão negada ou câmera ocupada). Digite o código abaixo."; camStream = null; return; }
  if (!$("#dlgCodigo").open) return pararCamera();
  const v = $("#camVideo"); v.srcObject = camStream; $("#camBox").hidden = false; $("#camBtn").textContent = "Parar a câmera"; msg.textContent = "Procurando o código…";
  try { await v.play(); } catch (e) {}
  camTimer = setInterval(async () => { if (v.readyState < 2) return; try { const r = await det.detect(v); if (r.length) { $("#codForm").cod.value = r[0].rawValue; acharCodigo(r[0].rawValue); } } catch (e) {} }, 300);
});

/* ---------- registrar vendas do dia ---------- */
let VEND = new Map();
function renderVList() {
  const q = semAcento($("#vendasForm").q.value.trim());
  const rows = CARDAPIO.flatMap(it => (variantes(it).length ? variantes(it) : [""]).map(v => ({ it, v }))).filter(({ it, v }) => !q || semAcento(it.nome + " " + v + " " + it.cat).includes(q));
  let g = "";
  $("#vList").innerHTML = rows.map(({ it, v }) => { const k = it.id + "|" + v, n = VEND.get(k) || 0, temF = FICHAS[`cardapio:${it.id}`] || (v && FICHAS[`cardapio:${it.id}|${v}`]);
    return `${it.cat !== g ? `<div class="cat-h">${esc(g = it.cat)}</div>` : ""}<div class="vrow ${n ? "has" : ""}" data-k="${esc(k)}"><span>${esc(it.nome)}${v ? " · " + esc(v) : ""}${temF ? "" : ` <span class="tag ocre">sem ficha</span>`}</span>
      <span class="step"><button type="button" data-d="-1" aria-label="Menos um">−</button><output>${n}</output><button type="button" data-d="1" aria-label="Mais um">+</button></span></div>`; }).join("") || `<p class="preview">Nada encontrado.</p>`;
  const tot = [...VEND.values()].reduce((a, b) => a + b, 0);
  $("#vSum").innerHTML = tot ? `<b>${tot}</b> ite${tot > 1 ? "ns" : "m"} para lançar.` : "Toque em + nos itens vendidos.";
}
async function loadLotes() {
  try { const { vendas } = await call("GET", "/admin/vendas");
    $("#vLotes").innerHTML = vendas.length ? vendas.map(v => `<li class="${v.desfeita_em ? "off" : ""}"><span>${dia(v.criado_em)} ${hora(v.criado_em)}${v.quem ? " · " + esc(v.quem) : ""} · ${v.itens.map(i => `${i.qtd}× ${esc(linhaNome(i))}`).join(", ")}</span>${v.desfeita_em ? "<small>desfeito</small>" : `<button class="btn b-ghost b-sm" type="button" data-desf="${v.id}">Desfazer</button>`}</li>`).join("") : `<li><span>Nenhum lançamento ainda.</span></li>`;
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
    toast(`Vendas registradas · ${r.baixa.length} ite${r.baixa.length === 1 ? "m" : "ns"} do estoque baixado${r.baixa.length === 1 ? "" : "s"}` + (r.semFicha.length ? ` · sem ficha: ${r.semFicha.join(", ")}` : ""));
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
  if (!ks.length) return `sem ficha técnica`;
  return `<span class="baixa">ficha: ${ks.map(k => (k.includes("|") ? k.split("|")[1] + ": " : "") + FICHAS[k].map(f => `${esc(qtdNat(f.qtd, f.unidade))} ${esc(f.nome)}`).join(", ")).join(" · ")}</span>`;
}
function menuRow(tipo, it) {
  const off = esgotado(tipo, it.id), e = ESG.get(tipo + ":" + it.id);
  return `<div class="mi ${off ? "off" : ""}" data-t="${tipo}" data-i="${esc(it.id)}"><div class="mi-n"><b>${esc(it.nome)}</b><small>${esc(precoTxt(it))}${off && e ? ` · esgotado desde ${dia(e.desde)} ${hora(e.desde)}${e.por ? " (" + esc(e.por) + ")" : ""}` : ""}</small><small data-dono>${consumoTxt(tipo, it)}</small></div>
    <button class="btn b-line b-sm cons" type="button" data-ficha data-dono>Ficha</button>
    <button class="sw" type="button" role="switch" aria-checked="${!off}" data-sw aria-label="${esc(it.nome)}: ${off ? "esgotado" : "disponível"}"><span>${off ? "Esgotado" : "Disponível"}</span><i></i></button></div>`;
}
function renderMenu() {
  const q = semAcento($("#menuQ").value.trim()), m = it => !q || semAcento(it.nome).includes(q);
  const loja = LOJA.filter(m);
  setHtml($("#menuList"), (loja.length ? `<h3 class="menu-cat">Loja <small>retirada no café · ${esc(lojaNome(S.loja))}</small></h3>${loja.map(it => menuRow("loja", it)).join("")}` : "")
    + CATS.map(c => { const l = CARDAPIO.filter(i => i.cat === c && m(i)); return l.length ? `<h3 class="menu-cat">${esc(c)}</h3>${l.map(it => menuRow("cardapio", it)).join("")}` : ""; }).join("")
    || `<div class="empty">Nada encontrado.</div>`);
}
$("#menuQ").addEventListener("input", renderMenu);
$("#menuList").addEventListener("click", async e => {
  const row = e.target.closest("[data-t]"); if (!row) return; const tipo = row.dataset.t, it = achar(tipo, row.dataset.i);
  if (e.target.closest("[data-ficha]")) return openFicha(tipo, it);
  const sw = e.target.closest("[data-sw]"); if (!sw) return;
  const vaiEsgotar = !esgotado(tipo, it.id); sw.disabled = true;
  try { const r = await call("POST", "/admin/disponibilidade", { tipo, id: it.id, esgotado: vaiEsgotar }); ESG = new Map(r.esgotados.map(x => [x.tipo + ":" + x.item_id, x]));
    renderEsgCount(); renderMenu(); toast(`${it.nome}: ${vaiEsgotar ? "esgotado" : "disponível"} na ${lojaNome(S.loja)}`); }
  catch (x) { toast(x.message); sw.disabled = false; }
});
$("#liberar").addEventListener("click", async () => { if (!confirm(`Voltar todos os itens da ${lojaNome(S.loja)} para disponível?`)) return;
  try { const r = await call("POST", "/admin/disponibilidade", { liberarTudo: true }); ESG = new Map(r.esgotados.map(x => [x.tipo + ":" + x.item_id, x])); renderEsgCount(); renderMenu(); toast("Tudo disponível"); } catch (x) { toast(x.message); } });

/* ================= FICHA TÉCNICA (diálogo) ================= */
let fxItem = null;
function fRow(vs, l = {}) {
  const d = document.createElement("div"); d.className = "frow" + (vs.length ? "" : " nov");
  d.innerHTML = `${vs.length ? `<select class="in v" aria-label="Vale para"><option value="">Todas as opções</option>${vs.map(v => `<option ${v === l.variante ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>` : ""}
    <select class="in it" aria-label="Ingrediente do estoque">${STK.itens.map(i => `<option value="${esc(i.sku)}" ${i.sku === l.sku ? "selected" : ""}>${esc(i.nome)}</option>`).join("")}</select>
    <input class="in q" inputmode="decimal" aria-label="Quantidade por venda" placeholder="0,018" value="${l.qtd != null ? esc(fmtQ(l.qtd)) : ""}"><span class="u"></span><span class="c"></span><button class="x" type="button" aria-label="Tirar linha">×</button>`;
  return d;
}
const insumoDe = sku => STK.itens.find(i => i.sku === sku) || {};
function fichaCalc() {
  const vs = variantes(fxItem.it), arr = Array.isArray(fxItem.it.p), linhas = $$("#frows .frow").map(r => {
    const i = insumoDe(r.querySelector(".it").value), q = parseQ(r.querySelector(".q").value), c = i.custo != null && q > 0 ? i.custo * q : null;
    r.querySelector(".u").textContent = i.unidade || ""; r.querySelector(".c").textContent = c != null ? brl(Math.round(c)) : "";
    return { variante: r.querySelector(".v") ? r.querySelector(".v").value : "", c };
  });
  const alvo = arr ? vs : [""];
  $("#fCalc").innerHTML = alvo.map(v => { const preco = precoDe(fxItem.it, v || vs[0] || ""), custo = linhas.filter(l => !l.variante || l.variante === v).reduce((s, l) => s + (l.c || 0), 0);
    const cmv = preco ? custo / preco : null;
    return `<div class="fc ${cmvCls(cmv)}"><span>${v ? esc(v) : "Uma unidade"}</span><b>custo ${brl(Math.round(custo))}</b><span>preço ${brl(preco)}</span><span>${preco ? `margem ${brl(Math.round(preco - custo))} (${pct(1 - cmv)}) · CMV ${pct(cmv)}` : "preço a consultar"}</span></div>`; }).join("");
}
const cmvCls = c => c == null ? "nd" : c <= .25 ? "verde" : c <= .35 ? "ocre" : "red";
async function openFicha(tipo, it) {
  if (S.perfil !== "dono") return toast("Só o perfil Dono edita a ficha técnica.");
  if (!STK.itens.length) await loadStock(true);
  if (!STK.itens.length) return toast("Cadastre primeiro os itens do estoque (aba Estoque).");
  await loadFichas(true);
  fxItem = { tipo, it }; const vs = variantes(it).length && Array.isArray(it.p) ? variantes(it) : [], rows = $("#frows"); rows.innerHTML = ""; $("#fichaErr").textContent = "";
  $("#fichaTitle").textContent = "Ficha · " + it.nome;
  $("#fichaSub").innerHTML = `Quanto de cada ingrediente sai em <b>uma</b> venda. Use a unidade do item: 18 g de um item em kg = 0,018.${vs.length ? " “Todas as opções” vale para qualquer tamanho; as linhas de um tamanho somam a ele." : ""} O estoque baixa por esta ficha${tipo === "loja" ? " quando o cliente retira o pedido" : " no pedido retirado e em “Registrar vendas do dia”"}. Custos de exemplo.`;
  for (const k of [`${tipo}:${it.id}`, ...vs.map(v => `${tipo}:${it.id}|${v}`)]) (FICHAS[k] || []).forEach(f => rows.append(fRow(vs, { ...f, variante: k.split("|")[1] || "" })));
  if (!rows.children.length) rows.append(fRow(vs));
  fichaCalc(); $("#dlgFicha").showModal();
}
$("#fAdd").addEventListener("click", () => { const vs = variantes(fxItem.it).length && Array.isArray(fxItem.it.p) ? variantes(fxItem.it) : []; const r = fRow(vs); $("#frows").append(r); fichaCalc(); r.querySelector(".q").focus(); });
$("#frows").addEventListener("click", e => { if (e.target.closest(".x")) { e.target.closest(".frow").remove(); fichaCalc(); } });
$("#frows").addEventListener("input", fichaCalc); $("#frows").addEventListener("change", fichaCalc);
$("#fichaForm").addEventListener("submit", async e => {
  e.preventDefault(); const err = $("#fichaErr"); err.textContent = "";
  const linhas = $$("#frows .frow").map(r => ({ variante: r.querySelector(".v") ? r.querySelector(".v").value : "", sku: r.querySelector(".it").value, qtd: parseQ(r.querySelector(".q").value), el: r.querySelector(".q") }));
  const ruim = linhas.find(l => !(l.qtd > 0)); if (ruim) { err.textContent = "Digite quanto sai em uma venda, por exemplo 0,018."; return ruim.el.focus(); }
  try { await call("POST", "/admin/ficha", { tipo: fxItem.tipo, id: fxItem.it.id, linhas: linhas.map(({ variante, sku, qtd }) => ({ variante, sku, qtd })) });
    $("#dlgFicha").close(); toast("Ficha salva"); await loadFichas(true); renderMenu(); if (atual === "fichas") loadMargens(); }
  catch (x) { err.textContent = x.message; }
});

/* ================= FICHAS: custo, margem e CMV ================= */
let ford = "asc";
async function loadMargens() {
  let r; try { r = await call("GET", "/admin/margens"); } catch (e) { return toast(e.message); }
  const q = semAcento($("#fichaQ").value.trim()), l = r.linhas.filter(x => !q || semAcento(x.nome + " " + x.variante + " " + x.cat).includes(q));
  const com = l.filter(x => x.cmv != null).sort((a, b) => ford === "asc" ? a.margem_pct - b.margem_pct : b.margem_pct - a.margem_pct), sem = l.filter(x => x.cmv == null);
  const card = r.linhas.filter(x => x.tipo === "cardapio" && x.cmv != null), media = card.length ? card.reduce((s, x) => s + x.cmv, 0) / card.length : null;
  const pior = card.slice().sort((a, b) => b.cmv - a.cmv)[0];
  setHtml($("#fichaResumo"), `<div class="tiles">
    <div class="tile"><span>CMV médio do cardápio</span><b>${pct(media)}</b><small>média simples dos itens com ficha</small></div>
    <div class="tile ${pior && pior.cmv > .35 ? "warn" : ""}"><span>Menor margem</span><b class="t-sm">${pior ? esc(pior.nome + (pior.variante ? " · " + pior.variante : "")) : "—"}</b><small>${pior ? `CMV ${pct(pior.cmv)} · margem ${brl(Math.round(pior.margem))}` : ""}</small></div>
    <div class="tile"><span>Sem ficha</span><b>${r.linhas.filter(x => x.cmv == null).length}</b><small>itens sem ingredientes ou sem preço</small></div></div>`);
  const row = x => `<div class="fi ${cmvCls(x.cmv)}" data-t="${esc(x.tipo)}" data-i="${esc(x.id)}">
      <div class="fi-n"><b>${esc(x.nome)}${x.variante ? ` · ${esc(x.variante)}` : ""}</b><small>${esc(x.cat)} · custo ${x.custo != null ? brl(Math.round(x.custo)) : "—"} · preço ${brl(x.preco)}</small>
        <small class="ing">${x.linhas.length ? x.linhas.map(i => `${esc(qtdNat(i.qtd, i.unidade))} ${esc(i.nome)}`).join(" · ") : "sem ingredientes"}</small></div>
      <div class="fi-m">${x.margem != null ? `<b>${brl(Math.round(x.margem))}</b><small>margem ${pct(x.margem_pct)}</small>` : `<b>—</b><small>${x.preco == null ? "preço a consultar" : "sem ficha"}</small>`}</div>
      <span class="tag ${cmvCls(x.cmv) === "nd" ? "" : cmvCls(x.cmv)} cmv">${x.cmv != null ? "CMV " + pct(x.cmv) : "sem CMV"}</span>
      <button class="btn b-line b-sm" type="button" data-ficha>Editar ficha</button></div>`;
  setHtml($("#fichaList"), (com.length + sem.length ? com.map(row).join("") + (sem.length ? `<h3 class="cat-h">Sem ficha ou sem preço</h3>` + sem.map(row).join("") : "") : `<div class="empty">Nada encontrado.</div>`));
}
$("#fichaList").addEventListener("click", e => { const b = e.target.closest("[data-ficha]"); if (!b) return; const r = b.closest("[data-t]"); openFicha(r.dataset.t, achar(r.dataset.t, r.dataset.i)); });
$("#fichaQ").addEventListener("input", loadMargens);
$$("[data-ford]").forEach(b => b.addEventListener("click", () => { ford = b.dataset.ford; $$("[data-ford]").forEach(x => x.setAttribute("aria-pressed", x === b)); loadMargens(); }));

/* ================= COMPRAS ================= */
function compras() {
  const low = STK.itens.filter(i => i.acabando), g = new Map();
  for (const i of low) { const f = i.fornecedor || "Sem fornecedor"; (g.get(f) || g.set(f, []).get(f)).push(i); }
  return [...g].sort((a, b) => a[0] === "Sem fornecedor" ? 1 : b[0] === "Sem fornecedor" ? -1 : a[0].localeCompare(b[0]));
}
const QTD = new Map();                                 // quantidade editada na lista (id → número)
const qtdCompra = i => QTD.has(i.id) ? QTD.get(i.id) : sugestao(i);
function textoCompra(grupos) {
  return [`*Lista de compras · ${CAFE} · ${lojaNome(S.loja)}*`, `_${new Date().toLocaleDateString("pt-BR", TZ)}_`,
    ...grupos.flatMap(([f, l]) => ["", `*${f}*`, ...l.filter(i => qtdCompra(i) > 0).map(i => `• ${i.nome}: ${fmtQ(qtdCompra(i))} ${i.unidade}`)])].join("\n");
}
function renderShop() {
  const gs = compras();
  if (!gs.length) { setHtml($("#shop"), STK.itens.length ? `<div class="empty">Nada no mínimo. Quando um item chegar ao mínimo, ele aparece aqui.</div>` : `<div class="empty">Cadastre os itens na aba <b>Estoque</b> com o mínimo de cada um. Os que chegarem ao mínimo aparecem aqui.</div>`); return; }
  setHtml($("#shop"), gs.map(([f, l], k) => `<div class="grp" data-g="${k}"><div class="grp-h"><h3>${esc(f)}</h3><button class="btn b-line b-sm" type="button" data-copy="${k}">Copiar para o WhatsApp</button></div>
    ${l.map(i => `<div class="cl" data-id="${i.id}"><div><b>${esc(i.nome)}</b><small>tem ${fmtQ(i.quantidade)} ${esc(i.unidade)} · mínimo ${fmtQ(i.minimo)}</small></div>
      <label class="q"><input class="in" inputmode="decimal" value="${esc(fmtQ(qtdCompra(i)))}" aria-label="Quanto comprar de ${esc(i.nome)}"><span>${esc(i.unidade)}</span></label>
      <button class="btn b-verde b-sm" type="button" data-chegou>Chegou</button></div>`).join("")}</div>`).join("")
    + `<div class="foot-acts"><button class="btn b-line" type="button" data-copy="all">Copiar a lista inteira</button><a class="btn b-wa" id="shopWa" target="_blank" rel="noopener">Abrir no WhatsApp</a></div>`);
  $("#shopWa").href = "https://wa.me/?text=" + encodeURIComponent(textoCompra(gs));
}
$("#shop").addEventListener("input", e => { const r = e.target.closest("[data-id]"); if (!r) return; const v = parseQ(e.target.value); if (v >= 0) QTD.set(+r.dataset.id, v); $("#shopWa").href = "https://wa.me/?text=" + encodeURIComponent(textoCompra(compras())); });
$("#shop").addEventListener("click", async e => {
  const c = e.target.closest("[data-copy]");
  if (c) { const gs = compras(), sel = c.dataset.copy === "all" ? gs : [gs[+c.dataset.copy]]; toast(await copiar(textoCompra(sel)) ? "Lista copiada. Cole no WhatsApp do fornecedor." : "Não deu para copiar. Use “Abrir no WhatsApp”."); return; }
  const ch = e.target.closest("[data-chegou]"); if (!ch) return;
  const it = STK.itens.find(x => x.id === +ch.closest("[data-id]").dataset.id); openMov(it, "entrada", qtdCompra(it)); $("#movForm").motivo.value = "Compra";
});

/* ================= FIDELIDADE ================= */
const selosHtml = (n, meta = META_SELOS) => `<div class="selos" role="img" aria-label="${Math.min(n, meta)} de ${meta} selos">${Array.from({ length: meta }, (_, k) => `<i class="${k < n ? "on" : ""}${k === meta - 1 ? " last" : ""}">${k === meta - 1 ? "☕" : ""}</i>`).join("")}</div>`;
async function renderFid() {
  const v = $("#fidQ").value, tel = normTel(v), dig = v.replace(/\D/g, "");
  let r; try { r = await api("GET", `/admin/fidelidade?q=${encodeURIComponent(tel ? "" : dig)}&tel=${encodeURIComponent(tel)}`); } catch (e) { return toast(e.message); }
  const c = r.cartao;
  setHtml($("#fidCard"), c ? `<div class="card fid" data-tel="${esc(c.tel)}"><div class="fid-h"><div><h3>${esc(c.nome || "Cliente sem nome")}</h3><small>${esc(telFmt(c.tel))}</small></div><b class="fid-n">${c.selos}<small>selo${c.selos === 1 ? "" : "s"}</small></b></div>
      ${selosHtml(c.selos)}
      <p class="note">${c.premio ? `<b class="ok">Completou ${META_SELOS} selos: a ${META_SELOS}ª bebida é por nossa conta.</b> Resgate na hora de entregar.` : `Faltam <b>${c.faltam}</b> para a bebida por nossa conta.`}</p>
      <div class="fid-a"><button class="btn b-line b-sm" type="button" data-aj="-1" data-dono ${c.selos ? "" : "disabled"}>−1 selo</button><button class="btn b-line b-sm" type="button" data-aj="1" data-dono>+1 selo</button><button class="btn b-verde b-sm" type="button" data-aj="-${META_SELOS}" ${c.premio ? "" : "disabled"}>Resgatar prêmio (−${META_SELOS})</button></div>
      ${c.hist.length ? `<ul class="hist">${c.hist.map(h => `<li><span>${dia(h.em)} ${hora(h.em)} · ${esc(h.motivo)}</span><span class="d ${h.delta < 0 ? "neg" : "pos"}">${h.delta > 0 ? "+" : ""}${h.delta}</span></li>`).join("")}</ul>` : `<p class="note">Ainda sem selos. Ganha o primeiro no próximo pedido retirado com este celular.</p>`}</div>`
    : dig ? `<div class="empty">Digite o celular completo, com DDD, para abrir o cartão.</div>` : "");
  setHtml($("#fidList"), r.lista.length ? `<div class="fl">${r.lista.map(x => `<button type="button" class="fl-i" data-abre="${esc(x.tel)}"><span><b>${esc(x.nome || "Cliente")}</b><small>${esc(telFmt(x.tel))}</small></span><span class="fl-b"><i data-w="${Math.min(100, x.selos / META_SELOS * 100)}"></i></span><span class="fl-n ${x.selos >= META_SELOS ? "ok" : ""}">${x.selos >= META_SELOS ? "prêmio!" : `${x.selos}/${META_SELOS}`}</span></button>`).join("")}</div>`
    : `<div class="empty">Nenhum cliente encontrado.</div>`);
  larguras($("#fidList"));
}
$("#fidQ").addEventListener("input", renderFid);
$("#fidList").addEventListener("click", e => { const b = e.target.closest("[data-abre]"); if (b) { $("#fidQ").value = telFmt(b.dataset.abre); renderFid(); scrollTo({ top: 0 }); } });
$("#fidCard").addEventListener("click", async e => {
  const b = e.target.closest("[data-aj]"); if (!b) return; const tel = b.closest("[data-tel]").dataset.tel, d = +b.dataset.aj;
  if (d === -META_SELOS && !confirm("Resgatar o prêmio? Saem 10 selos do cartão.")) return;
  b.disabled = true;
  try { const r = await call("POST", "/admin/fidelidade/ajuste", { tel, delta: d }); toast(d === -META_SELOS ? "Prêmio resgatado. Bom café!" : `${d > 0 ? "+1" : "−1"} selo · ${r.cartao.selos} no cartão`); renderFid(); }
  catch (x) { toast(x.message); b.disabled = false; }
});

/* ================= AVALIAÇÕES ================= */
let escopo = "loja", soComent = false;
const estrelas = n => `<span class="stars" aria-label="${n} de 5 estrelas">${"★".repeat(n)}<span>${"★".repeat(5 - n)}</span></span>`;
async function loadAval() {
  let r; try { r = await call("GET", "/admin/avaliacoes?loja=" + (escopo === "todas" ? "todas" : S.loja)); } catch (e) { return toast(e.message); }
  $("#avPer").textContent = escopo === "todas" ? "Todas as lojas" : lojaNome(S.loja);
  const max = Math.max(1, ...r.dist.map(d => d.n)), l = r.avaliacoes.filter(a => !soComent || a.comentario);
  setHtml($("#avalia"), `<div class="tiles">
      <div class="tile"><span>Nota média</span><b>${r.media != null ? r.media.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : "—"} <i class="star-t">★</i></b><small>${r.total} avaliaç${r.total === 1 ? "ão" : "ões"} depois da retirada</small></div>
      <div class="tile"><span>5 estrelas</span><b>${r.total ? pct(r.dist[0].n / r.total) : "—"}</b><small>dos clientes que avaliaram</small></div>
      <div class="tile"><span>Comentários privados</span><b>${r.comentarios}</b><small>só o café lê (notas de 1 a 4)</small></div></div>
    <div class="card"><h3>Distribuição</h3><ul class="rank">${r.dist.map(d => `<li><b>${d.nota} ★</b><span>${d.n}</span><span class="bar2"><i data-w="${Math.round(d.n / max * 100)}"></i></span></li>`).join("")}</ul>
      ${escopo === "todas" ? `<h3 class="sub-h">Por loja</h3><ul class="rank">${r.porLoja.map(x => `<li><b>${esc(x.nome)}</b><span>${x.media != null ? x.media.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + " ★ · " + x.total : "—"}</span><span class="bar2"><i data-w="${x.media ? Math.round(x.media / 5 * 100) : 0}"></i></span></li>`).join("")}</ul>` : ""}
      <p class="note">Uma hora depois da retirada, a tela do cliente pergunta “Como estava?”. <b>Todo cliente vê o botão “Avaliar no Google”, com qualquer nota</b>: escolher só os satisfeitos para mandar ao Google (review gating) vai contra as regras do Google. Quem dá de 1 a 4 estrelas também ganha uma caixa de comentário que só o café lê.</p></div>
    <div class="bar"><button class="btn b-line b-sm" type="button" id="soComent" aria-pressed="${soComent}">${soComent ? "Mostrar todas" : "Só com comentário"}</button></div>
    ${l.length ? `<div class="avl">${l.map(a => `<article class="av"><div class="av-h">${estrelas(a.nota)}<b>${esc(primeiro(a.nome))}</b><small>pedido ${esc(a.pedido.slice(-4))} · ${esc(lojaNome(a.loja))} · ${dia(a.em)} ${hora(a.em)}</small></div>${a.comentario ? `<p class="obs">${esc(a.comentario)}</p>` : ""}</article>`).join("")}</div>`
      : `<div class="empty">Nenhuma avaliação ${soComent ? "com comentário " : ""}ainda.</div>`}`);
  larguras($("#avalia"));
}
$("#avalia").addEventListener("click", e => { if (e.target.closest("#soComent")) { soComent = !soComent; loadAval(); } });
function setEscopo(v) { escopo = v; $$("[data-esc]").forEach(x => x.setAttribute("aria-pressed", x.dataset.esc === v)); if (atual === "resumo") loadResumo(); if (atual === "avaliacoes") loadAval(); }
$$("[data-esc]").forEach(b => b.addEventListener("click", () => setEscopo(b.dataset.esc)));

/* ================= RESUMO ================= */
let dias = 1;
async function loadResumo() {
  let r; try { r = await call("GET", `/admin/resumo?dias=${dias}&loja=${escopo === "todas" ? "todas" : S.loja}`); } catch (e) { return toast(e.message); }
  $("#resPer").textContent = (escopo === "todas" ? "Todas as lojas · " : lojaNome(S.loja) + " · ") + (dias === 1 ? "hoje, " + dataBR(r.ate) : `de ${dataBR(r.de).slice(0, 5)} a ${dataBR(r.ate).slice(0, 5)}`);
  const max = Math.max(1, ...r.porDia.map(d => d.receita)), maxT = Math.max(1, ...r.top.map(t => t.pedidos + t.vendas));
  const DS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const comp = r.porLoja ? (() => { const g = (t, f, fmt) => { const m = Math.max(1, ...r.porLoja.map(f)); return `<div class="cmp"><h4>${t}</h4><ul class="rank">${r.porLoja.map(x => `<li><b>${esc(x.nome)}</b><span>${fmt(f(x))}</span><span class="bar2 b-esp"><i data-w="${Math.round(f(x) / m * 100)}"></i></span></li>`).join("")}</ul></div>`; };
    return `<div class="card"><h3>Comparar lojas</h3><div class="cmps">${g("Faturamento dos pedidos", x => x.receita, brl)}${g("Pedidos", x => x.pedidos, n => n)}${g("Ticket médio", x => x.ticket, brl)}</div></div>`; })() : "";
  setHtml($("#resumo"), `<div class="tiles">
      <div class="tile"><span>Pedidos</span><b>${r.pedidos}</b><small>${r.origem.site || 0} pelo site · ${r.origem.balcao || 0} no balcão${r.cancelados ? ` · ${r.cancelados} cancelado${r.cancelados > 1 ? "s" : ""}` : ""}</small></div>
      <div class="tile"><span>Faturamento dos pedidos</span><b>${brl(r.receita)}</b><small>${r.semValor ? `${r.semValor} pedido${r.semValor > 1 ? "s" : ""} “a consultar” sem valor informado` : "pedidos não cancelados"}</small></div>
      <div class="tile"><span>Ticket médio</span><b>${r.pedidos ? brl(r.ticket) : "—"}</b><small>por pedido</small></div>
      <div class="tile ${r.estoque.acabando ? "warn" : ""}"><span>Estoque acabando</span><b>${r.estoque.acabando}</b><small>de ${r.estoque.itens} itens cadastrados</small></div>
      <div class="tile ${r.estoque.vencidos ? "warn" : ""}"><span>Validade</span><b>${r.estoque.vencendo + r.estoque.vencidos}</b><small>${r.estoque.vencidos} vencido${r.estoque.vencidos === 1 ? "" : "s"} · ${r.estoque.vencendo} vencendo</small></div>
    </div>${comp}
    ${dias > 1 ? `<div class="card"><h3>Faturamento por dia</h3><div class="days">${r.porDia.map(d => `<div class="day ${d.dia === r.ate ? "today" : ""}"><span class="v">${d.receita ? brl(d.receita).replace(/,00$/, "") : "—"}</span><span class="b" data-h="${Math.round(d.receita / max * 100)}"></span><span class="d">${DS[new Date(d.dia + "T12:00:00-03:00").getUTCDay()]}</span></div>`).join("")}</div>
      <p class="note">${r.porDia.map(d => d.pedidos).reduce((a, b) => a + b, 0)} pedidos no período. O faturamento conta só os pedidos (site e balcão), não o caixa inteiro do café.</p></div>` : ""}
    <div class="card"><h3>Mais vendidos</h3>${r.top.length ? `<ul class="rank">${r.top.map(t => `<li><b>${esc(t.nome)}</b><span>${t.pedidos + t.vendas}${t.vendas && t.pedidos ? ` (${t.pedidos} em pedidos)` : ""}</span><span class="bar2"><i data-w="${Math.round((t.pedidos + t.vendas) / maxT * 100)}"></i></span></li>`).join("")}</ul>
      <p class="note">Somando os pedidos e o que foi lançado em “Registrar vendas do dia”.</p>` : `<div class="empty">Ainda sem vendas no período.</div>`}</div>`);
  larguras($("#resumo")); alturas($("#resumo"));
}
$$("[data-dias]").forEach(b => b.addEventListener("click", () => { dias = +b.dataset.dias; $$("[data-dias]").forEach(x => x.setAttribute("aria-pressed", x === b)); loadResumo(); }));

/* fechamento do dia: texto pronto para o WhatsApp (sem número: a pessoa escolhe a conversa) */
let fesc = "loja";
async function renderFecha() {
  $$("[data-fesc]").forEach(x => x.setAttribute("aria-pressed", x.dataset.fesc === fesc));
  try { const { texto } = await call("GET", "/admin/fechamento?loja=" + (fesc === "todas" ? "todas" : S.loja)); $("#fechaTxt").value = texto; $("#fechaWa").href = "https://wa.me/?text=" + encodeURIComponent(texto); }
  catch (e) { toast(e.message); }
}
$("#fechaBtn").addEventListener("click", () => { fesc = escopo; renderFecha(); $("#dlgFecha").showModal(); });
$$("[data-fesc]").forEach(b => b.addEventListener("click", () => { fesc = b.dataset.fesc; renderFecha(); }));
$("#fechaCopy").addEventListener("click", async () => toast(await copiar($("#fechaTxt").value) ? "Fechamento copiado. Cole no WhatsApp." : "Não deu para copiar. Use “Abrir no WhatsApp”."));

/* exportar para planilha: CSV com BOM, ";" e vírgula decimal (abre certo no Excel em português) */
const csvTxt = v => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvNum = (n, d = 2) => n == null || !Number.isFinite(+n) ? "" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
const dataCsv = iso => new Date(iso).toLocaleDateString("pt-BR", TZ), horaCsv = iso => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", ...TZ });
function montarCsv(cab, linhas) { return "﻿" + [cab, ...linhas].map(r => r.join(";")).join("\r\n") + "\r\n"; }
function baixar(nome, txt) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })); a.download = nome;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
$("#expBtn").addEventListener("click", () => {
  $("#expSub").textContent = `${escopo === "todas" ? "Todas as lojas" : lojaNome(S.loja)} · ${dias === 1 ? "hoje" : "últimos 7 dias"} (mude o período e as lojas no Resumo).`;
  $("#dlgExp").showModal();
});
$("#dlgExp").addEventListener("click", async e => {
  const b = e.target.closest("[data-exp]"); if (!b) return; const loja = escopo === "todas" ? "todas" : S.loja, tipo = b.dataset.exp;
  const { linhas } = await call("GET", `/admin/export/${tipo}?loja=${loja}&dias=${dias}`);
  const sufixo = `${loja === "todas" ? "todas-as-lojas" : loja}-${dias === 1 ? hojeSP() : "7-dias-ate-" + hojeSP()}.csv`;
  if (tipo === "pedidos") baixar("cafe-modelo-pedidos-" + sufixo, montarCsv(["Código", "Loja", "Data", "Hora", "Origem", "Cliente", "Celular", "Status", "Itens", "Qtd. de itens", "Total (R$)", "Tem item a consultar"],
    linhas.map(p => [csvTxt(p.id), csvTxt(lojaNome(p.loja)), dataCsv(p.criado_em), horaCsv(p.criado_em), p.origem === "site" ? "Site" : "Balcão", csvTxt(p.nome), csvTxt(p.tel ? telFmt(p.tel) : ""), csvTxt(ETAPA[p.status] || p.status),
      csvTxt(p.itens.map(i => `${i.qtd}x ${linhaNome(i)}`).join(", ")), p.itens.reduce((s, i) => s + i.qtd, 0), csvNum((p.total_final ?? p.total) / 100), p.consultar && p.total_final == null ? "sim" : "não"])));
  else baixar("cafe-modelo-estoque-" + sufixo, montarCsv(["Data", "Hora", "Loja", "Item", "Unidade", "Tipo", "Quantidade", "Saldo depois", "Motivo", "Quem"],
    linhas.map(m => [dataCsv(m.criado_em), horaCsv(m.criado_em), csvTxt(lojaNome(m.loja)), csvTxt(m.nome), csvTxt(m.unidade), csvTxt(TIPO_TXT[m.tipo] || m.tipo), csvNum(m.delta, 3), csvNum(m.saldo, 3), csvTxt(m.motivo), csvTxt(m.quem)])));
  toast(`Planilha baixada: ${linhas.length} linha${linhas.length === 1 ? "" : "s"}`);
});

/* ================= abas ================= */
const TABS = ["pedidos", "estoque", "cardapio", "fichas", "compras", "fidelidade", "avaliacoes", "resumo"];
let atual = "pedidos";
async function tab(t, manterScroll) {
  if (S.perfil === "barista" && SO_DONO.includes(t)) t = "pedidos";
  atual = t;
  $$(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t)); TABS.forEach(x => { $("#t-" + x).hidden = x !== t; });
  if (!manterScroll) scrollTo(0, 0);
  if (t === "pedidos") loadOrders(true);
  if (t === "estoque" || t === "compras") loadStock();
  if (t === "cardapio") { renderMenu(); await Promise.all([loadDisp(), loadFichas(true), STK.itens.length ? null : loadStock(true)]); renderMenu(); }
  if (t === "fichas") loadMargens();
  if (t === "fidelidade") renderFid();
  if (t === "avaliacoes") loadAval();
  if (t === "resumo") loadResumo();
}
$$(".tabs button").forEach(b => b.addEventListener("click", () => tab(b.dataset.tab)));

/* ao vivo: qualquer mudança em outra aba (cliente pediu, telão, outro painel) chega aqui na hora */
let agendado = null;
function atualizar() {
  clearTimeout(agendado); agendado = setTimeout(async () => {
    await verNovos(); loadDisp(); loadStock(true);
    if (atual === "pedidos") loadOrders(true);
    if (atual === "cardapio") { await loadFichas(true); renderMenu(); }
    if (atual === "fichas") loadMargens();
    if (atual === "fidelidade" && !$("#fidCard").contains(document.activeElement)) renderFid();
    if (atual === "avaliacoes") loadAval();
    if (atual === "resumo") loadResumo();
  }, 60);
}
function carregarTudo() { loadOrders(true); loadStock(true); loadDisp(); loadFichas(true); }
let chegadaTimer = null;
function start() {
  setQuem(lerPref("quem") || "Equipe"); S.loja = LOJAS.some(l => l.id === lerPref("loja")) ? lerPref("loja") : "centro"; renderLojas();
  setPerfil(lerPref("perfil") || "dono");
  verNovos(); carregarTudo();
  /* um pedido de cliente "chega pelo site" a cada 45 s na loja aberta (fora do modo apresentação) */
  clearInterval(chegadaTimer); if (!embutido) chegadaTimer = setInterval(() => { if (!document.hidden) api("POST", "/demo/chegada", { loja: S.loja }).catch(() => {}); }, 5000);
}
ouvir((d, info) => { if (info.reset) return reiniciar(!info.local); atualizar(); });
function openQuem() { $("#quemForm").quem.value = S.quem; $("#dlgQuem").showModal(); $("#quemForm").quem.focus(); }
$("#quemBtn").addEventListener("click", openQuem);
$("#quemForm").addEventListener("submit", e => { e.preventDefault(); setQuem(e.target.quem.value); $("#dlgQuem").close(); toast(S.quem ? `Olá, ${S.quem}!` : "Nome apagado"); });

async function simular() {
  try { await api("POST", "/demo/chegada", { loja: S.loja, forcar: true }); } catch (e) { toast(e.message); return; }
  ligarSom(); col = "novo"; if (atual !== "pedidos") await tab("pedidos");
}
$$("[data-simular]").forEach(b => b.addEventListener("click", simular));

/* recomeçar: os dados de exemplo voltam ao início em TODAS as telas abertas deste navegador */
$("#recomecar").addEventListener("click", () => {
  if (!confirm("Recomeçar a demonstração? Pedidos, estoque, cardápio, fidelidade e avaliações voltam aos dados de exemplo do início, em todas as telas abertas.")) return;
  recomecar();
});
function reiniciar(deFora) {
  $$("dialog[open]").forEach(d => d.close());
  conhecidos = null; PEDIDOS = []; FRESCOS.clear(); ESG = new Map(); FICHAS = {}; QTD.clear(); VEND = new Map(); OUTRAS = {};
  ver = "quadro"; col = "novo"; stkFiltro = "todos"; dias = 1; escopo = "loja"; soComent = false;
  $$("[data-ver]").forEach(x => x.setAttribute("aria-pressed", x.dataset.ver === ver));
  $$("[data-sf]").forEach(x => x.setAttribute("aria-pressed", x.dataset.sf === stkFiltro));
  $$("[data-dias]").forEach(x => x.setAttribute("aria-pressed", +x.dataset.dias === dias));
  $$("[data-esc]").forEach(x => x.setAttribute("aria-pressed", x.dataset.esc === escopo));
  ["#stkQ", "#menuQ", "#fichaQ", "#fidQ"].forEach(s => { $(s).value = ""; });
  start(); tab("pedidos"); toast(deFora ? "A demonstração foi recomeçada em outra tela" : "Demonstração recomeçada");
}

/* ================= no tablet: instalar, tela acesa, offline ================= */
registrarApp();
let instEvt = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); instEvt = e; renderInst(); });
addEventListener("appinstalled", () => { instEvt = null; renderInst(); toast("Painel instalado"); });
function renderInst() {
  const b = $("#instBtn");
  if (instalado()) { b.disabled = true; b.textContent = "Instalado"; $("#instTxt").textContent = "Você está usando o painel como app."; $("#instIos").hidden = true; return; }
  b.disabled = false; b.textContent = instEvt ? "Instalar" : "Como instalar";
  $("#instTxt").textContent = instEvt ? "Abre como app, sem a barra do navegador." : ehIOS() ? "No iPad: Compartilhar e Adicionar à Tela de Início." : "Pelo menu do navegador (veja abaixo).";
}
$("#instBtn").addEventListener("click", async () => {
  if (instEvt) { instEvt.prompt(); try { await instEvt.userChoice; } catch (e) {} instEvt = null; renderInst(); return; }
  $("#instIos").hidden = false;
});
const acesa = criarTelaAcesa(st => {
  const sw = $("#wakeSw"); sw.setAttribute("aria-checked", st.ligado); sw.querySelector("span").textContent = st.ligado ? "Ligado" : "Desligado";
  $("#wakeTxt").textContent = !st.suportado ? "Este navegador não deixa manter a tela acesa. No tablet, ajuste o tempo de bloqueio da tela." : st.quer && !st.ligado ? "Não deu para manter a tela acesa agora (a página precisa estar visível)." : "O tablet não apaga enquanto o painel estiver aberto.";
});
$("#wakeSw").addEventListener("click", () => { const st = acesa.estado(); if (!acesa.suportado) { $("#wakeTxt").textContent = "Este navegador não deixa manter a tela acesa. No tablet, ajuste o tempo de bloqueio da tela."; return; } acesa.ligar(!st.quer); });
$("#tabletBtn").addEventListener("click", () => { renderInst(); $("#dlgTablet").showModal(); });

start();
tab("pedidos", true);
