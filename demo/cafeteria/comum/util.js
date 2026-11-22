/* Utilidades comuns da demonstração do Café Modelo (fictício): painel, tela do cliente, telão e apresentação.
   Tudo o que vai para a tela passa por esc(). */
export const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const brl = c => c == null ? "a consultar" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtQ = n => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
export const pct = n => Number.isFinite(n) ? Math.round(n * 100).toLocaleString("pt-BR") + "%" : "—";
/** "2,5" → 2.5 · "1.250,5" → 1250.5 · "0.5" → 0.5 */
export const parseQ = v => { const s = String(v ?? "").trim(); if (!s) return NaN; const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); return Number.isFinite(n) ? n : NaN; };
export const TZ = { timeZone: "America/Sao_Paulo" };
export const hora = iso => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", ...TZ });
export const dia = iso => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", ...TZ });
export const hojeSP = (d = new Date()) => new Intl.DateTimeFormat("en-CA", TZ).format(d);
export const dataBR = d => d ? d.split("-").reverse().join("/") : "";
export const normTel = v => { let d = String(v || "").replace(/\D/g, ""); if (d.length > 11 && d.startsWith("55")) d = d.slice(2); return /^[1-9]{2}9?\d{8}$/.test(d) ? d : ""; };
export const telFmt = t => t ? `(${t.slice(0, 2)}) ${t.slice(2, t.length - 4)}-${t.slice(-4)}` : "";
export const linhaNome = i => i.nome + (i.variante ? " · " + i.variante : "");
export const primeiro = n => String(n || "").trim().split(/\s+/)[0] || "";
export const semAcento = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const embutido = new URLSearchParams(location.search).has("embed");
export async function copiar(txt) { try { await navigator.clipboard.writeText(txt); return true; } catch (e) { return false; } }
/* larguras e alturas de barras sem style="" (a CSP da demonstração não aceita estilo embutido) */
export const larguras = root => $$("[data-w]", root).forEach(el => { el.style.width = el.dataset.w + "%"; });
export const alturas = root => $$("[data-h]", root).forEach(el => { el.style.height = el.dataset.h + "%"; });
/* só troca o HTML se mudou: a atualização ao vivo não substitui o botão embaixo do dedo */
export const setHtml = (el, html) => { if (el.__html !== html) { el.__html = html; el.innerHTML = html; } };
export function toast(m) { const t = $("#toast"); if (!t) return; t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2800); }
export function fechaDialogos() { $$("dialog [data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close())); }
