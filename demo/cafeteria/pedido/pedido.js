/* Tela do cliente · DEMONSTRAÇÃO do Café Modelo (rede fictícia).
   O cliente escolhe a loja, monta a sacola com o cardápio e os produtos da loja, faz o pedido para retirar e
   acompanha as etapas ao vivo, conforme o painel (aberto em outra aba deste navegador) move o pedido.
   Depois da retirada: selo no cartão fidelidade e, "1 hora depois", o pedido de avaliação.
   Os dados são de EXEMPLO e ficam só neste navegador; nada é enviado. Tudo o que vai para a tela passa por esc(). */
import { $, $$, esc, brl, hora, normTel, telFmt, linhaNome, primeiro, embutido, setHtml, toast, fechaDialogos } from "../comum/util.js";
import { CARDAPIO, LOJA, LOJAS, lojaNome, variantes, precoDe, achar } from "../comum/catalogo.js";
import { api, ouvir, META_SELOS } from "../comum/dados.js";
import { criarSom } from "../comum/som.js";
import { registrarApp } from "../comum/app.js";

if (embutido) document.documentElement.classList.add("embed");
fechaDialogos();
registrarApp();
const som = criarSom();
addEventListener("pointerdown", () => som.ligar(), { once: true });

const PREF = "cafe-modelo-demo-cliente-loja";
const S = { loja: (() => { try { const v = localStorage.getItem(PREF); return LOJAS.some(l => l.id === v) ? v : "centro"; } catch (e) { return "centro"; } })(), esg: new Set(), bag: [], ver: null, ultimoStatus: {} };
const CATS = [["Loja", "Para levar para casa"], ...[...new Set(CARDAPIO.map(i => i.cat))].map(c => [c, ""])];
const slug = c => "c-" + c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
const precoTxt = it => Array.isArray(it.p) ? it.p.map(([v, c]) => `${v} ${brl(c)}`).join(" · ") : it.p == null ? "valor combinado na retirada" : brl(it.p);
const esgotado = (tipo, id) => S.esg.has(tipo + ":" + id);

/* ---------- loja ---------- */
function renderLojas() {
  setHtml($("#lojaSel"), LOJAS.map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join(""));
  $("#lojaSel").value = S.loja;
  const l = LOJAS.find(x => x.id === S.loja);
  setHtml($("#lojaInfo"), `Retirada na <b>${esc(l.nome)}</b> · ${esc(l.endereco)}, ${esc(l.cidade)} <span class="ex">(endereço de exemplo)</span>`);
}
$("#lojaSel").addEventListener("change", async e => { S.loja = e.target.value; try { localStorage.setItem(PREF, S.loja); } catch (x) {} renderLojas(); await loadEsg(); renderMenu(); renderBag(); toast(`Retirada na ${lojaNome(S.loja)}`); });
async function loadEsg() { try { const { esgotados } = await api("GET", "/loja/disponibilidade?loja=" + S.loja); S.esg = new Set(esgotados.map(e => e.tipo + ":" + e.item_id)); } catch (e) {} }

/* ---------- cardápio ---------- */
function itemCard(tipo, it) {
  const off = esgotado(tipo, it.id), vs = variantes(it);
  return `<article class="it ${off ? "off" : ""}" data-t="${tipo}" data-i="${esc(it.id)}">
    <div class="it-n"><h3>${esc(it.nome)}</h3><p>${esc(precoTxt(it))}</p></div>
    <div class="it-a">${vs.length ? `<select class="in" data-var aria-label="Opção de ${esc(it.nome)}" ${off ? "disabled" : ""}>${vs.map(v => `<option>${esc(v)}</option>`).join("")}</select>` : ""}
      ${off ? `<span class="esg">Esgotado</span>` : `<button class="add" type="button" data-add aria-label="Adicionar ${esc(it.nome)} à sacola">+ Adicionar</button>`}</div></article>`;
}
function renderMenu() {
  setHtml($("#cats"), CATS.map(([c]) => `<a href="#${slug(c)}">${esc(c)}</a>`).join(""));
  setHtml($("#menu"), CATS.map(([c, sub]) => { const l = c === "Loja" ? LOJA.map(it => ["loja", it]) : CARDAPIO.filter(i => i.cat === c).map(it => ["cardapio", it]);
    return `<section class="cat" id="${slug(c)}" aria-labelledby="h-${slug(c)}"><h2 id="h-${slug(c)}">${esc(c)}${sub ? ` <small>${esc(sub)}</small>` : ""}</h2><div class="grid">${l.map(([t, it]) => itemCard(t, it)).join("")}</div></section>`; }).join(""));
  renderTopo();
}
$("#menu").addEventListener("click", e => {
  const b = e.target.closest("[data-add]"); if (!b) return; const card = b.closest("[data-t]"), tipo = card.dataset.t, it = achar(tipo, card.dataset.i);
  if (esgotado(tipo, it.id)) return toast(`${it.nome} está esgotado na ${lojaNome(S.loja)}`);
  const sel = card.querySelector("[data-var]"), variante = sel ? sel.value : "";
  const l = S.bag.find(x => x.tipo === tipo && x.id === it.id && x.variante === variante); l ? l.qtd = Math.min(20, l.qtd + 1) : S.bag.push({ tipo, id: it.id, variante, qtd: 1 });
  renderBag(); toast(`${it.nome}${variante ? " · " + variante : ""} na sacola`);
  b.classList.remove("ok"); void b.offsetWidth; b.classList.add("ok");
});

/* ---------- sacola ---------- */
const precoLinha = l => precoDe(achar(l.tipo, l.id), l.variante);
function renderBag() {
  const n = S.bag.reduce((s, l) => s + l.qtd, 0), tot = S.bag.reduce((s, l) => s + (precoLinha(l) || 0) * l.qtd, 0), cons = S.bag.some(l => precoLinha(l) == null);
  $("#bagbar").hidden = !n || !$("#v-pedido").hidden; $("#bagN").textContent = n; $("#bagTotTop").textContent = brl(tot) + (cons ? " +" : "");
  $("#bagLoja").textContent = lojaNome(S.loja);
  setHtml($("#bagLines"), S.bag.length ? S.bag.map((l, k) => { const it = achar(l.tipo, l.id), off = esgotado(l.tipo, l.id), p = precoLinha(l);
    return `<div class="ln ${off ? "off" : ""}" data-k="${k}"><div><b>${esc(linhaNome({ nome: it.nome, variante: l.variante }))}</b>${off ? `<small class="esg-t">esgotado nesta loja: tire da sacola</small>` : `<small>${p == null ? "valor combinado na retirada" : brl(p) + " cada"}</small>`}</div>
      <span class="step"><button type="button" data-d="-1" aria-label="Menos um">−</button><output>${l.qtd}</output><button type="button" data-d="1" aria-label="Mais um">+</button></span></div>`; }).join("") : `<p class="sub">A sacola está vazia.</p>`);
  $("#bagTot").innerHTML = S.bag.length ? `Total <b>${brl(tot)}</b>${cons ? " + itens com valor combinado" : ""}` : "";
}
$("#bagBtn").addEventListener("click", () => {
  if (!S.bag.length) return; renderBag(); $("#bagErr").textContent = ""; const f = $("#bagForm");
  if (!f.nome.value && MEUS.length) { const u = MEUS[0]; f.nome.value = u.nome; if (u.tel && !f.tel.value) { f.tel.value = telFmt(u.tel); f.tel.dispatchEvent(new Event("input")); } }
  $("#dlgBag").showModal(); if (!f.nome.value) f.nome.focus();
});
$("#bagLines").addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (!b) return; const k = +b.closest("[data-k]").dataset.k;
  S.bag[k].qtd += +b.dataset.d; if (S.bag[k].qtd <= 0) S.bag.splice(k, 1); else S.bag[k].qtd = Math.min(20, S.bag[k].qtd); renderBag(); if (!S.bag.length) $("#dlgBag").close(); });
$("#bagForm").tel.addEventListener("input", async e => {
  const tel = normTel(e.target.value); if (!tel) { setHtml($("#bagSelos"), ""); return; }
  const { cartao } = await api("GET", "/loja/selos?tel=" + tel);
  setHtml($("#bagSelos"), `<div class="mini-c">${selosHtml(cartao.selos)}<p>${cartao.selos ? `Você tem <b>${cartao.selos} selo${cartao.selos > 1 ? "s" : ""}</b>.` : "Cartão novo."} Este pedido vale +1 quando você retirar.</p></div>`);
});
$("#bagForm").addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target, err = $("#bagErr"); err.textContent = "";
  if (f.nome.value.trim().length < 2) { err.textContent = "Digite o seu nome para a retirada."; return f.nome.focus(); }
  if (f.tel.value.trim() && !normTel(f.tel.value)) { err.textContent = "Confira o celular (com DDD) ou deixe em branco."; return f.tel.focus(); }
  const btn = f.querySelector("[type=submit]"); btn.disabled = true;
  try {
    const { pedido } = await api("POST", "/loja/pedido", { loja: S.loja, nome: f.nome.value, tel: f.tel.value, itens: S.bag });
    S.bag = []; $("#dlgBag").close(); S.ultimoStatus[pedido.id] = pedido.status; abrirPedido(pedido.id); toast("Pedido enviado para a " + pedido.lojaNome);
  } catch (x) { err.textContent = x.message; await loadEsg(); renderBag(); }
  btn.disabled = false;
});

/* ---------- cartão fidelidade ---------- */
const selosHtml = n => `<div class="selos" role="img" aria-label="${Math.min(n, META_SELOS)} de ${META_SELOS} selos">${Array.from({ length: META_SELOS }, (_, k) => `<i class="${k < n ? "on" : ""}${k === META_SELOS - 1 ? " last" : ""}">${k === META_SELOS - 1 ? "☕" : ""}</i>`).join("")}</div>`;
const cartaoHtml = c => c ? `<section class="cartao ${c.premio ? "premio" : ""}" aria-label="Cartão fidelidade"><div class="ct-h"><h2>Cartão fidelidade</h2><span>${esc(telFmt(c.tel))}</span></div>${selosHtml(c.selos)}
  <p>${c.premio ? `<b>Você completou ${META_SELOS} selos!</b> Mostre este cartão no balcão: a ${META_SELOS}ª bebida é por nossa conta.` : `<b>${c.selos} de ${META_SELOS}</b> selos. Faltam ${c.faltam} para a bebida por nossa conta.`}</p></section>` : "";

/* ---------- acompanhar o pedido ---------- */
const PASSOS = [["novo", "Recebido"], ["separando", "Preparando"], ["pronto", "Pronto"], ["retirado", "Retirado"]];
const TITULO = { novo: "Recebemos seu pedido", separando: "Estamos preparando", pronto: "Pronto para retirar!", retirado: "Retirado. Bom café!", cancelado: "Pedido cancelado" };
const DICA = { novo: "A loja já recebeu. Esta tela muda sozinha a cada etapa.", separando: "Já estamos separando os itens.", pronto: "Diga o código no balcão.", retirado: "Obrigado pela visita.", cancelado: "Fale com a loja se tiver alguma dúvida." };
let MEUS = [];
function abrirPedido(id) { S.ver = id; history.replaceState(null, "", "#p=" + encodeURIComponent(id)); mostrar(); scrollTo(0, 0); }
function voltarMenu() { S.ver = null; history.replaceState(null, "", location.pathname + location.search); mostrar(); scrollTo(0, 0); }
async function carregarMeus() { try { const r = await api("GET", "/loja/meus"); MEUS = r.pedidos; S.tel = r.tel; } catch (e) { MEUS = []; } }
function renderTopo() {
  const ativo = MEUS.find(p => ["novo", "separando", "pronto"].includes(p.status));
  setHtml($("#meusTopo"), ativo ? `<button class="acomp ${ativo.status}" type="button" data-abre="${esc(ativo.id)}"><span>Seu pedido <b>${esc(ativo.codigo)}</b> · ${esc(ativo.lojaNome)}</span><b>${esc(ativo.etapa)} →</b></button>` : "");
  const c = (MEUS.find(p => p.cartao) || {}).cartao;
  setHtml($("#cartaoTopo"), c ? cartaoHtml(c) : "");
}
$("#meusTopo").addEventListener("click", e => { const b = e.target.closest("[data-abre]"); if (b) abrirPedido(b.dataset.abre); });
function estrelasBtns(nota) {
  return `<div class="stars-in" role="radiogroup" aria-label="Sua nota">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="${n === nota}" data-nota="${n}" class="${nota && n <= nota ? "on" : ""}" aria-label="${n} estrela${n > 1 ? "s" : ""}">★</button>`).join("")}</div>`;
}
function avaliacaoHtml(p) {
  if (p.status !== "retirado") return "";
  const liberada = p.av_em && Date.parse(p.av_em) <= Date.now(), a = p.avaliacao;
  if (!liberada) return `<section class="aval espera"><h2>Como estava?</h2><p>Daqui a 1 hora (às ${hora(p.av_em)}) perguntamos aqui o que você achou.</p>
    <div class="demo-box"><p><b>Na demonstração:</b> pule a espera para ver a pergunta agora.</p><button class="ff" type="button" data-avancar>⏩ Avançar 1 hora</button></div></section>`;
  return `<section class="aval"><h2>Como estava?</h2><p>${a ? `Você deu <b>${a.nota} estrela${a.nota > 1 ? "s" : ""}</b>. Obrigado!` : `Seu pedido ${esc(p.codigo)} na ${esc(p.lojaNome)}. Toque nas estrelas.`}</p>
    ${estrelasBtns(a ? a.nota : 0)}
    ${a && a.nota < 5 ? (a.comentario ? `<p class="ok">Comentário enviado. Só o café lê.</p>` : `<label class="coment">Quer contar o que podemos melhorar? <small>Só o café lê.</small><textarea class="in" id="coment" maxlength="500" rows="3" placeholder="Ex.: o latte veio morno"></textarea></label><button class="sec" type="button" data-coment>Enviar comentário</button>`) : ""}
    <div class="google"><button class="gbtn" type="button" data-google>Avaliar no Google</button><small>Para qualquer nota, se quiser.</small></div></section>`;
}
function renderPedido() {
  const p = MEUS.find(x => x.id === S.ver);
  if (!p) { setHtml($("#track"), `<div class="empty">Pedido não encontrado (a demonstração pode ter sido recomeçada). <button class="sec" type="button" data-menu>Ver o cardápio</button></div>`); return; }
  const k = p.status === "retirado" ? PASSOS.length : PASSOS.findIndex(([s]) => s === p.status);   // retirado: todas as etapas concluídas
  const quando = { novo: p.criado_em, pronto: p.pronto_em, retirado: p.retirado_em };
  setHtml($("#track"), `<section class="tr ${esc(p.status)}" aria-live="polite">
      <p class="tr-k">${esc(p.lojaNome)} · ${hora(p.criado_em)}</p>
      <div class="tr-c"><span>Código para retirar</span><b>${esc(p.codigo)}</b></div>
      <h1>${esc(TITULO[p.status] || p.etapa)}</h1>
      <p class="tr-d">${p.status === "pronto" ? `${esc(primeiro(p.nome))}, pode vir! ` : ""}${esc(DICA[p.status] || "")}</p>
      ${p.status === "cancelado" ? "" : `<ol class="steps">${PASSOS.map(([s, t], i) => `<li class="${i < k ? "done" : i === k ? "now" : ""}"><i aria-hidden="true">${i < k ? "✓" : i + 1}</i><span>${t}</span>${quando[s] && i <= k ? `<small>${hora(quando[s])}</small>` : ""}</li>`).join("")}</ol>`}
      <ul class="tr-i">${p.itens.map(i => `<li><span><b>${i.qtd}×</b> ${esc(linhaNome(i))}</span><span>${i.centavos == null ? "a combinar" : brl(i.centavos * i.qtd)}</span></li>`).join("")}</ul>
      <p class="tr-t">Total <b>${brl(p.total)}</b>${p.consultar ? " + valor combinado" : ""} · pagamento na retirada</p>
    </section>
    ${avaliacaoHtml(p)}
    ${cartaoHtml(p.cartao) || (p.status !== "cancelado" ? `<p class="hint c">Sem celular no pedido, sem selo. Da próxima vez, informe o celular e junte selos.</p>` : "")}
    ${["novo", "separando", "pronto"].includes(p.status) && !embutido ? `<div class="demo-box"><p><b>Na demonstração:</b> mova este pedido no painel e veja esta tela mudar sozinha.</p><a class="sec" href="../painel/" target="_blank" rel="noopener">Abrir o painel ↗</a></div>` : ""}
    <div class="tr-acts"><button class="sec" type="button" data-menu>Fazer outro pedido</button>${MEUS.length > 1 ? `<div class="outros">${MEUS.filter(x => x.id !== p.id).slice(0, 4).map(x => `<button type="button" data-abre="${esc(x.id)}">${esc(x.codigo)} · ${esc(x.etapa)}</button>`).join("")}</div>` : ""}</div>`);
}
$("#track").addEventListener("click", async e => {
  if (e.target.closest("[data-menu]")) return voltarMenu();
  const ab = e.target.closest("[data-abre]"); if (ab) return abrirPedido(ab.dataset.abre);
  if (e.target.closest("[data-google]")) return $("#dlgGoogle").showModal();
  const p = MEUS.find(x => x.id === S.ver); if (!p) return;
  try {
    if (e.target.closest("[data-avancar]")) { await api("POST", "/loja/avancar", { id: p.id }); return; }
    const n = e.target.closest("[data-nota]"); if (n) { await api("POST", "/loja/avaliar", { id: p.id, nota: +n.dataset.nota }); toast(+n.dataset.nota === 5 ? "Obrigado pelas 5 estrelas!" : "Obrigado! Se quiser, conte o que podemos melhorar."); return; }
    if (e.target.closest("[data-coment]")) { const t = $("#coment").value.trim(); if (!t) { toast("Escreva o comentário ou deixe em branco."); return; } await api("POST", "/loja/avaliar", { id: p.id, nota: p.avaliacao.nota, comentario: t }); $("#coment").value = ""; toast("Comentário enviado. Obrigado!"); }
  } catch (x) { toast(x.message); }
});

/* ---------- telas e atualização ao vivo ---------- */
function mostrar() {
  const ped = !!S.ver; $("#v-menu").hidden = ped; $("#v-pedido").hidden = !ped;
  if (ped) renderPedido(); else renderMenu(); renderBag();
}
async function atualizar() {
  await Promise.all([carregarMeus(), loadEsg()]);
  for (const p of MEUS) { const antes = S.ultimoStatus[p.id];
    if (antes && antes !== p.status && p.status === "pronto") { if (!embutido) som.tocar("pronto"); if (navigator.vibrate) try { navigator.vibrate([120, 80, 120]); } catch (e) {} toast(`Pedido ${p.codigo} pronto para retirar!`); }
    S.ultimoStatus[p.id] = p.status; }
  if (S.ver && !MEUS.some(p => p.id === S.ver)) S.ver = null;
  if (S.ver && $("#coment") && $("#coment").value) { renderBag(); return; }   // não apaga o comentário que a pessoa está escrevendo
  mostrar();
}
let ag = null;
ouvir((d, info) => { if (info.reset) { S.bag = []; S.ver = null; S.ultimoStatus = {}; history.replaceState(null, "", location.pathname + location.search); $$("dialog[open]").forEach(x => x.close()); if (!info.local) toast("A demonstração foi recomeçada"); } clearTimeout(ag); ag = setTimeout(atualizar, 40); });
setInterval(() => { const p = MEUS.find(x => x.id === S.ver); if (p && p.status === "retirado" && !p.avaliacao && p.av_em && Date.parse(p.av_em) <= Date.now() && !$(".aval:not(.espera)")) renderPedido(); }, 20000);

(async () => {
  renderLojas(); await atualizar();
  const h = new URLSearchParams(location.hash.slice(1)).get("p");
  if (h && MEUS.some(p => p.id === h)) abrirPedido(h);
})();
