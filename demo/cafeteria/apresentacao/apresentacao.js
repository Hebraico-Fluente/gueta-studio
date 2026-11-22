/* Modo apresentação · DEMONSTRAÇÃO do Café Modelo (rede fictícia).
   Celular do cliente (iframe de /pedido/) ao lado do tablet do balcão (iframe de /painel/), na mesma página:
   os dois usam o estado compartilhado deste navegador, então o pedido feito no "celular" aparece no "tablet"
   na hora. O aviso sonoro toca aqui, na página de fora (o navegador libera o som depois do primeiro toque). */
import { $, $$ } from "../comum/util.js";
import { ouvir, estado, recomecar } from "../comum/dados.js";
import { criarSom } from "../comum/som.js";
import { registrarApp } from "../comum/app.js";

registrarApp();
const som = criarSom();
const LARGO = matchMedia("(min-width: 1000px) and (min-height: 560px)");
const DIM = { phone: [390 + 24, 844 + 24], tablet: [1180 + 32, 820 + 32] }; // tamanho da tela + moldura

function encaixar() {
  const largo = LARGO.matches;
  document.body.classList.toggle("largo", largo);
  if (!largo) return;
  $$("iframe[data-src]").forEach(f => { if (!f.src) f.src = f.dataset.src; });
  const st = $("#stage"), cs = getComputedStyle(st), gap = parseFloat(cs.columnGap) || 40;
  const w = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - gap;
  const h = innerHeight - $(".ap-h").offsetHeight - $("#passos").offsetHeight - 80;
  const s = Math.max(.3, Math.min(1, w / (DIM.phone[0] + DIM.tablet[0]), h / Math.max(DIM.phone[1], DIM.tablet[1])));
  for (const k of ["phone", "tablet"]) {
    const fig = $("#" + k), sc = $(".scaler", fig), [fw, fh] = DIM[k];
    sc.style.width = fw * s + "px"; sc.style.height = fh * s + "px";
    $(".bezel", fig).style.transform = `scale(${s})`;
  }
}
addEventListener("resize", encaixar); LARGO.addEventListener("change", encaixar); encaixar();

/* som: pedido novo chegando ao tablet, pedido pronto no celular */
let vistos = null, prontos = null;
function ouvirSons() {
  const D = estado(), novos = D.pedidos.filter(p => p.status === "novo").map(p => p.id), pr = D.pedidos.filter(p => p.status === "pronto").map(p => p.id);
  if (vistos && novos.some(id => !vistos.has(id))) som.tocar("novo");
  else if (prontos && pr.some(id => !prontos.has(id))) som.tocar("pronto");
  vistos = new Set([...(vistos || []), ...novos]); prontos = new Set(pr);
}
ouvir((d, info) => { if (info.reset) { vistos = null; prontos = null; } ouvirSons(); });
ouvirSons();
function ligarSom() { const ok = som.ligar(); $("#somBtn").setAttribute("aria-pressed", ok); $("#somBtn").textContent = ok ? "🔔 Som ligado" : "🔕 Sem som"; }
$("#somBtn").addEventListener("click", () => { ligarSom(); som.tocar("novo"); });
addEventListener("pointerdown", ligarSom, { once: true });
/* um toque dentro do celular ou do tablet também libera o som desta página */
addEventListener("blur", () => setTimeout(() => { if (document.activeElement && document.activeElement.tagName === "IFRAME" && navigator.userActivation && navigator.userActivation.hasBeenActive) ligarSom(); }, 0));

$("#recomecar").addEventListener("click", () => { if (confirm("Recomeçar a demonstração? Tudo volta aos dados de exemplo do início, no celular, no tablet e no telão.")) recomecar(); });
