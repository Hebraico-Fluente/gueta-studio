/* Telão (TV da loja) · DEMONSTRAÇÃO do Café Modelo (rede fictícia).
   Mostra, para a loja escolhida, os pedidos em preparo e os prontos para retirar (primeiro nome + código),
   com aviso sonoro e destaque quando um pedido fica pronto. Atualiza ao vivo pelo estado compartilhado
   deste navegador (o painel aberto em outra aba). Dados de EXEMPLO. Tudo o que vai para a tela passa por esc(). */
import { $, esc, setHtml } from "../comum/util.js";
import { LOJAS, lojaNome } from "../comum/catalogo.js";
import { api, ouvir } from "../comum/dados.js";
import { criarSom } from "../comum/som.js";
import { registrarApp, criarTelaAcesa } from "../comum/app.js";

registrarApp();
const qs = new URLSearchParams(location.search);
let loja = LOJAS.some(l => l.id === qs.get("loja")) ? qs.get("loja") : "centro";
const som = criarSom(), MAX = 8;
let prontos = null; const NOVOS = new Map();          // id → quando ficou pronto (destaque por 12 s)

$("#lojaSel").innerHTML = LOJAS.map(l => `<option value="${esc(l.id)}">${esc(l.nome)}</option>`).join("");
$("#lojaSel").value = loja;
$("#lojaSel").addEventListener("change", e => { loja = e.target.value; prontos = null; history.replaceState(null, "", "?loja=" + encodeURIComponent(loja)); render(); });

const card = (p, cls = "") => `<li class="${cls}"><b class="cod">${esc(p.codigo)}</b><span class="nome">${esc(p.nome || "Cliente")}</span></li>`;
async function render() {
  let pedidos; try { ({ pedidos } = await api("GET", "/telao?loja=" + loja)); } catch (e) { return; }
  $("#lojaTxt").textContent = lojaNome(loja);
  const prep = pedidos.filter(p => p.status === "novo" || p.status === "separando").sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const pr = pedidos.filter(p => p.status === "pronto").sort((a, b) => String(b.pronto_em).localeCompare(String(a.pronto_em)));
  const agora = Date.now();
  if (prontos) { const novos = pr.filter(p => !prontos.has(p.id)); novos.forEach(p => NOVOS.set(p.id, agora)); if (novos.length) som.tocar("pronto"); }
  prontos = new Set(pr.map(p => p.id)); NOVOS.forEach((t, id) => { if (agora - t > 12000 || !prontos.has(id)) NOVOS.delete(id); });
  const resto = n => n > 0 ? `<li class="mais">+ ${n} pedido${n > 1 ? "s" : ""}</li>` : "";
  setHtml($("#prep"), prep.length ? prep.slice(0, MAX).map(p => card(p)).join("") + resto(prep.length - MAX) : `<li class="vazio">Nenhum pedido em preparo</li>`);
  setHtml($("#pronto"), pr.length ? pr.slice(0, MAX).map(p => card(p, NOVOS.has(p.id) ? "novo" : "")).join("") + resto(pr.length - MAX) : `<li class="vazio">Os pedidos prontos aparecem aqui</li>`);
  $("#nPrep").textContent = prep.length || ""; $("#nPronto").textContent = pr.length || "";
}
let ag = null;
ouvir(() => { clearTimeout(ag); ag = setTimeout(render, 40); });
setInterval(render, 4000);                              // tira o destaque depois de alguns segundos

/* relógio (horário de Brasília) */
const relogio = () => { $("#clock").textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }); };
relogio(); setInterval(relogio, 10000);

/* som: o navegador só libera depois de um toque */
function ligarSom() { const ok = som.ligar(); $("#somBtn").setAttribute("aria-pressed", ok); $("#somBtn").textContent = ok ? "🔔 Som ligado" : "🔕 Sem som"; }
$("#somBtn").addEventListener("click", () => { ligarSom(); som.tocar("pronto"); });
addEventListener("pointerdown", ligarSom, { once: true });

/* tela cheia e tela acesa (para a TV não apagar) */
const acesa = criarTelaAcesa(st => { $("#acesaBtn").hidden = !st.suportado; $("#acesaBtn").setAttribute("aria-pressed", st.ligado); $("#acesaBtn").textContent = st.ligado ? "☀ Tela acesa" : "Manter tela acesa"; });
if (acesa.suportado) { $("#acesaBtn").hidden = false; $("#acesaBtn").textContent = "Manter tela acesa"; }
$("#acesaBtn").addEventListener("click", () => acesa.ligar(!acesa.estado().quer));
const fsOk = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
if (!fsOk) $("#fsBtn").hidden = true;
$("#fsBtn").addEventListener("click", async () => {
  ligarSom();
  try { if (document.fullscreenElement) await document.exitFullscreen(); else { await document.documentElement.requestFullscreen(); if (acesa.suportado) acesa.ligar(true); } } catch (e) {}
});
document.addEventListener("fullscreenchange", () => { const on = !!document.fullscreenElement; document.body.classList.toggle("fs", on); $("#fsBtn").textContent = on ? "Sair da tela cheia" : "⛶ Tela cheia"; });

render();
