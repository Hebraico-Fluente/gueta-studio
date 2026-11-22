/* O "servidor" da demonstração do Café Modelo, uma rede FICTÍCIA de cafeterias com quatro lojas.
   No painel de verdade estas respostas vêm do servidor do café; aqui tudo roda no navegador, sobre o
   estado compartilhado (estado.js): os dados são de EXEMPLO e ficam só neste navegador.
   api(método, caminho, corpo) devolve uma Promise, como um fetch, para o painel ser o mesmo do real. */
import { CARDAPIO, LOJA, LOJAS, lojaNome, variantes, precoDe, achar } from "./catalogo.js";
import { abrirEstado } from "./estado.js";
import { hojeSP, TZ, normTel, fmtQ, brl, primeiro, linhaNome, telFmt } from "./util.js";

export const META_SELOS = 10;
const ST = abrirEstado({ chave: "cafe-modelo-demo-v1", canal: "cafe-modelo-demo", versao: 1, semear });
export const ouvir = ST.ouvir, recomecar = ST.recomecar, estado = ST.ler;
export { LOJAS, lojaNome };

const ETAPA_TXT = { novo: "Recebido", separando: "Preparando", pronto: "Pronto", retirado: "Retirado", cancelado: "Cancelado" };
const ABERTOS = ["novo", "separando", "pronto"];
const agoraISO = () => new Date().toISOString();
const r3 = n => Math.round(n * 1000) / 1000;
const erro = m => { throw new Error(m); };
const lojaOk = id => LOJAS.some(l => l.id === id) ? id : erro("Escolha a loja.");
const deLojas = loja => loja === "todas" ? LOJAS.map(l => l.id) : [lojaOk(loja)];

/* ---------- regras ---------- */
function aviso(i) {
  const hoje = hojeSP(), lim = hojeSP(new Date(Date.now() + 7.5 * 864e5));
  return { ...i, acabando: i.quantidade <= i.minimo, vencido: !!i.validade && i.validade < hoje, vencendo: !!i.validade && i.validade >= hoje && i.validade <= lim };
}
function movim(D, i, saldo, tipo, motivo, ref, quem) {
  const delta = r3(saldo - i.quantidade); i.quantidade = saldo; i.atualizado_em = agoraISO();
  D.movs.push({ item_id: i.id, loja: i.loja, delta, saldo, tipo, motivo: motivo || "", ref: ref || null, quem: quem || "", criado_em: agoraISO() });
  if (D.movs.length > 4000) D.movs.splice(0, D.movs.length - 4000);
  return delta;
}
/* baixa do estoque pela ficha técnica de cada linha vendida (uma vez por referência) */
function baixa(D, loja, ref, linhas, tipo, motivo, quem) {
  if (D.baixas.includes(ref)) return []; D.baixas.push(ref);
  const uso = new Map();
  linhas.forEach(l => [l.tipo + ":" + l.id, l.variante && l.tipo + ":" + l.id + "|" + l.variante].forEach(k => (D.ficha[k] || []).forEach(([sku, q]) => uso.set(sku, (uso.get(sku) || 0) + q * l.qtd))));
  return [...uso].map(([sku, q]) => {
    const i = D.itens.find(x => x.loja === loja && x.sku === sku); if (!i) return null;
    const saldo = r3(Math.max(0, i.quantidade - q)), delta = movim(D, i, saldo, tipo, motivo, ref, quem);
    return { nome: i.nome, delta, saldo, acabando: saldo <= i.minimo };
  }).filter(Boolean);
}
function devolve(D, ref, motivo, quem) {
  const k = D.baixas.indexOf(ref); if (k < 0) return false; D.baixas.splice(k, 1);
  const m = new Map(); D.movs.filter(x => x.ref === ref).forEach(x => m.set(x.item_id, (m.get(x.item_id) || 0) + x.delta));
  m.forEach((d, id) => { const i = D.itens.find(x => x.id === id); if (i && r3(d)) movim(D, i, r3(i.quantidade - d), "estorno", motivo, ref, quem); });
  return [...m.values()].some(d => r3(d));
}
const linhaDe = (l, tipoPadrao) => { const tipo = l.tipo || tipoPadrao, it = achar(tipo, l.id); if (!it) erro("Item desconhecido.");
  const variante = variantes(it).includes(l.variante) ? l.variante : (variantes(it)[0] || "");
  const qtd = Math.max(1, Math.min(50, Math.round(+l.qtd || 1)));
  return { tipo, id: it.id, nome: it.nome, variante, qtd, centavos: precoDe(it, variante) ?? null }; };
const COD = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function codigo(pre, ms, r = Math.random) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { ...TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return `${pre}${p.day}${p.month}-${p.hour}${p.minute}-${Array.from({ length: 4 }, () => COD[Math.floor(r() * COD.length)]).join("")}`;
}
function novoPedido({ loja, nome, tel, itens, status = "novo", ms = Date.now(), origem = "site", obs = "", r = Math.random }) {
  return { id: codigo(origem === "site" ? "S" : "C", ms, r), loja, origem, nome, tel: tel || null, itens, total: itens.reduce((s, i) => s + (i.centavos || 0) * i.qtd, 0),
    consultar: itens.some(i => i.centavos == null), total_final: null, obs: obs || "", status, antes: null, criado_em: new Date(ms).toISOString(),
    atualizado_em: new Date(ms).toISOString(), pronto_em: null, retirado_em: null, av_em: null };
}
const esgKey = (loja, tipo, id) => `${loja}|${tipo}:${id}`;
const valor = p => p.total_final ?? p.total;

/* ---------- fidelidade: 1 selo por pedido retirado com celular, mais os ajustes do balcão ---------- */
function selos(D, tel) {
  if (!tel) return 0;
  return D.pedidos.filter(p => p.tel === tel && p.status === "retirado").length + ((D.fidel[tel] || {}).ajustes || []).reduce((s, a) => s + a.delta, 0);
}
function nomeTel(D, tel) {
  const p = D.pedidos.filter(x => x.tel === tel).sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0];
  return (p && p.nome) || (D.fidel[tel] || {}).nome || "";
}
function cartao(D, tel) {
  const n = selos(D, tel);
  const hist = [...D.pedidos.filter(p => p.tel === tel && p.status === "retirado").map(p => ({ em: p.retirado_em || p.atualizado_em, delta: 1, motivo: `Pedido ${p.id.slice(-4)} · ${lojaNome(p.loja)}` })),
    ...((D.fidel[tel] || {}).ajustes || []).map(a => ({ em: a.em, delta: a.delta, motivo: a.motivo + (a.quem ? " · " + a.quem : "") }))].sort((a, b) => String(b.em).localeCompare(String(a.em)));
  return { tel, nome: nomeTel(D, tel), selos: n, meta: META_SELOS, premio: n >= META_SELOS, faltam: Math.max(0, META_SELOS - n), hist: hist.slice(0, 12) };
}

/* ---------- ficha técnica, custo e margem ---------- */
function insumo(D, loja, sku) { return D.itens.find(x => x.loja === loja && x.sku === sku) || D.itens.find(x => x.sku === sku) || null; }
function linhasFicha(D, loja, k) {
  return (D.ficha[k] || []).map(([sku, qtd]) => { const i = insumo(D, loja, sku); return i && { sku, qtd, nome: i.nome, unidade: i.unidade, custo: i.custo ?? null, custo_linha: i.custo != null ? i.custo * qtd : null }; }).filter(Boolean);
}
function margens(D, loja) {
  const rows = [];
  for (const [tipo, lista] of [["cardapio", CARDAPIO], ["loja", LOJA]]) for (const it of lista) {
    const vs = variantes(it).length && Array.isArray(it.p) ? variantes(it) : [""];
    for (const v of vs) {
      const ls = [...linhasFicha(D, loja, `${tipo}:${it.id}`), ...(v ? linhasFicha(D, loja, `${tipo}:${it.id}|${v}`) : [])];
      const preco = precoDe(it, v || (variantes(it)[0] || "")), semCusto = ls.some(l => l.custo == null);
      const custo = ls.length && !semCusto ? ls.reduce((s, l) => s + l.custo_linha, 0) : null;
      rows.push({ tipo, id: it.id, nome: it.nome, cat: tipo === "loja" ? "Loja" : it.cat, variante: v, preco, linhas: ls, custo,
        margem: custo != null && preco ? preco - custo : null, margem_pct: custo != null && preco ? (preco - custo) / preco : null, cmv: custo != null && preco ? custo / preco : null });
    }
  }
  return rows;
}

/* ---------- resumo ---------- */
function resumo(D, lojas, n) {
  const hoje = hojeSP(), lista = Array.from({ length: n }, (_, i) => hojeSP(new Date(Date.now() - i * 864e5))).reverse();
  const porDia = Object.fromEntries(lista.map(d => [d, { dia: d, pedidos: 0, receita: 0 }]));
  const top = new Map(), conta = (i, c) => { const k = i.nome + (i.variante ? ` (${i.variante})` : ""), t = top.get(k) || { nome: k, pedidos: 0, vendas: 0 }; t[c] += i.qtd; top.set(k, t); };
  let pedidos = 0, receita = 0, cancelados = 0, semValor = 0, vendasValor = 0; const origem = { site: 0, balcao: 0 };
  D.pedidos.forEach(x => { if (!lojas.includes(x.loja)) return; const d = porDia[hojeSP(new Date(x.criado_em))]; if (!d) return; if (x.status === "cancelado") { cancelados++; return; }
    pedidos++; receita += valor(x); origem[x.origem]++; d.pedidos++; d.receita += valor(x); if (x.consultar && x.total_final == null) semValor++; x.itens.forEach(i => conta(i, "pedidos")); });
  D.vendas.filter(v => lojas.includes(v.loja) && !v.desfeita_em && porDia[hojeSP(new Date(v.criado_em))]).forEach(v => v.itens.forEach(i => { conta(i, "vendas"); vendasValor += (i.centavos || 0) * i.qtd; }));
  const e = D.itens.filter(i => lojas.includes(i.loja)).map(aviso);
  return { dias: n, de: lista[0], ate: hoje, pedidos, cancelados, receita, ticket: pedidos ? Math.round(receita / pedidos) : 0, semValor, vendasValor, origem, porDia: lista.map(d => porDia[d]),
    top: [...top.values()].sort((a, b) => b.pedidos + b.vendas - a.pedidos - a.vendas).slice(0, 8),
    estoque: { itens: e.length, acabando: e.filter(x => x.acabando).length, vencendo: e.filter(x => x.vencendo).length, vencidos: e.filter(x => x.vencido).length } };
}
const INTEIRO = u => ["un", "g", "ml"].includes(u);
export function sugestao(it) { const alvo = it.alvo ?? Math.max(it.minimo * 2, it.minimo + (INTEIRO(it.unidade) ? 1 : 0.5)); const q = Math.max(alvo - it.quantidade, 0);
  return INTEIRO(it.unidade) ? Math.ceil(q) : Math.ceil(q * 10) / 10; }
function fechamento(D, lojas) {
  const hoje = hojeSP(), dataTxt = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", ...TZ });
  const bloco = loja => {
    const r = resumo(D, [loja], 1), l = [];
    l.push(`*${lojaNome(loja)}*`);
    l.push(`Pedidos: ${r.pedidos}${r.cancelados ? ` (+${r.cancelados} cancelado${r.cancelados > 1 ? "s" : ""})` : ""} · ${r.origem.site} pelo site, ${r.origem.balcao} no balcão`);
    l.push(`Faturamento dos pedidos: ${brl(r.receita)}${r.semValor ? ` (+ ${r.semValor} a consultar sem valor)` : ""}`);
    if (r.vendasValor) l.push(`Vendas lançadas do balcão: ${brl(r.vendasValor)}`);
    l.push(`Ticket médio: ${r.pedidos ? brl(r.ticket) : "—"}`);
    l.push(`Mais vendidos: ${r.top.length ? r.top.slice(0, 5).map(t => `${t.nome} (${t.pedidos + t.vendas})`).join(", ") : "nenhum ainda"}`);
    const esg = [...new Set(D.esgLog.filter(e => e.loja === loja && hojeSP(new Date(e.em)) === hoje).map(e => e.nome)
      .concat(Object.values(D.esg).filter(e => e.loja === loja).map(e => (achar(e.tipo, e.item_id) || {}).nome).filter(Boolean)))];
    l.push(`Esgotados hoje: ${esg.length ? esg.join(", ") : "nenhum"}`);
    const baixo = D.itens.filter(i => i.loja === loja).map(aviso).filter(i => i.acabando);
    l.push(`Estoque abaixo do mínimo: ${baixo.length ? baixo.map(i => `${i.nome} (${fmtQ(i.quantidade)} ${i.unidade})`).join(", ") : "nenhum item"}`);
    if (baixo.length) {
      l.push("", "_Comprar amanhã:_");
      const g = new Map(); baixo.forEach(i => { const f = i.fornecedor || "Sem fornecedor"; (g.get(f) || g.set(f, []).get(f)).push(i); });
      [...g].sort((a, b) => a[0].localeCompare(b[0])).forEach(([f, is]) => l.push(`• ${f}: ${is.map(i => `${i.nome} ${fmtQ(sugestao(i))} ${i.unidade}`).join("; ")}`));
    }
    return l;
  };
  const out = [`*Fechamento do dia · Café Modelo*`, `_${dataTxt}_`];
  if (lojas.length > 1) { const t = resumo(D, lojas, 1); out.push("", `*Rede (${lojas.length} lojas)*`, `Pedidos: ${t.pedidos} · Faturamento dos pedidos: ${brl(t.receita)} · Ticket médio: ${t.pedidos ? brl(t.ticket) : "—"}`); }
  lojas.forEach(loja => out.push("", ...bloco(loja)));
  out.push("", "_Dados de exemplo da demonstração do painel._");
  return out.join("\n");
}

/* ---------- chegada automática de pedido "pelo site" ---------- */
const CHEGAM = ["Pedro", "Luiza", "Rafael", "Beatriz", "Thiago", "Mariana", "Gustavo", "Helena", "Vinícius", "Sofia"].map(n => n + " (exemplo)");
const devido = (D, loja) => Date.now() - D.ultimaChegada >= 44000 && D.pedidos.filter(p => p.loja === loja && p.status === "novo").length < 4;
function chegada(D, loja) {
  const r = Math.random, disp = LOJA.filter(i => i.p != null && !D.esg[esgKey(loja, "loja", i.id)]); if (!disp.length) return null;
  const pick = l => l[Math.floor(r() * l.length)], a = pick(disp), l = [linhaDe({ tipo: "loja", id: a.id, variante: variantes(a).length ? pick(variantes(a)) : "", qtd: r() < .3 ? 2 : 1 })];
  const b = pick(disp); if (r() < .45 && b.id !== a.id) l.push(linhaDe({ tipo: "loja", id: b.id, variante: variantes(b).length ? pick(variantes(b)) : "", qtd: 1 }));
  const o = novoPedido({ loja, nome: CHEGAM[D.extra++ % CHEGAM.length], tel: r() < .5 ? "4190000" + String(1000 + Math.floor(r() * 9000)) : null, itens: l, obs: r() < .3 ? pick(["Passo aí na hora do almoço", "Pode deixar separado até as 18h?", "É para presente"]) : "" });
  D.pedidos.push(o); D.ultimaChegada = Date.now(); return o;
}

/* ================= leitura ================= */
function get(D, p, q) {
  const loja = q("loja") || "centro";
  if (p === "/admin/pedidos") { const ls = deLojas(loja), v = q("ver"), h0 = new Date(hojeSP() + "T00:00:00-03:00").toISOString(), de = D.pedidos.filter(x => ls.includes(x.loja));
    const l = v === "todos" ? de.slice().reverse() : v === "hoje" ? de.filter(x => x.criado_em >= h0).reverse() : de.filter(x => ABERTOS.includes(x.status) || x.atualizado_em > new Date(Date.now() - 432e5).toISOString());
    return { pedidos: l.map(o => ({ ...o, selos: o.tel ? selos(D, o.tel) : null })) }; }
  if (p === "/admin/novos") return { novos: D.pedidos.filter(x => x.status === "novo").map(x => ({ id: x.id, loja: x.loja, nome: x.nome, origem: x.origem })) };
  if (p === "/admin/disponibilidade" || p === "/loja/disponibilidade") return { esgotados: Object.values(D.esg).filter(e => e.loja === lojaOk(loja)) };
  if (p === "/admin/estoque") return { unidades: ["g", "kg", "un", "L", "ml"], categorias: D.C, venceEmDias: 7, itens: D.itens.filter(i => i.loja === lojaOk(loja)).sort((a, b) => a.nome.localeCompare(b.nome)).map(aviso) };
  if (p === "/admin/estoque/historico") { const id = +q("id"), ls = deLojas(loja);
    return { movimentos: D.movs.filter(m => ls.includes(m.loja) && (!id || m.item_id === id)).slice(-100).reverse().map(m => { const i = D.itens.find(x => x.id === m.item_id) || {}; return { ...m, nome: i.nome || "(removido)", unidade: i.unidade || "" }; }) }; }
  if (p === "/admin/fichas") { const f = {}; Object.keys(D.ficha).forEach(k => { const l = linhasFicha(D, loja, k); if (l.length) f[k] = l; }); return { fichas: f }; }
  if (p === "/admin/margens") return { linhas: margens(D, lojaOk(loja)) };
  if (p === "/admin/vendas") return { vendas: D.vendas.filter(v => v.loja === lojaOk(loja)).slice(-30).reverse() };
  if (p === "/admin/resumo") { const ls = deLojas(loja), n = +q("dias") || 1, r = resumo(D, ls, n);
    if (loja === "todas") r.porLoja = LOJAS.map(l => ({ loja: l.id, nome: l.nome, ...resumo(D, [l.id], n) })).map(({ porDia, top, ...x }) => x);
    return r; }
  if (p === "/admin/fechamento") return { texto: fechamento(D, deLojas(loja)) };
  if (p === "/admin/fidelidade") { const tel = normTel(q("tel")), dig = String(q("q") || "").replace(/\D/g, "");
    const tels = [...new Set([...D.pedidos.filter(x => x.tel).map(x => x.tel), ...Object.keys(D.fidel)])];
    const lista = tels.filter(t => !dig || t.includes(dig)).map(t => ({ tel: t, nome: nomeTel(D, t), selos: selos(D, t) })).filter(x => x.selos > 0 || dig)
      .sort((a, b) => (b.selos >= META_SELOS) - (a.selos >= META_SELOS) || b.selos - a.selos).slice(0, 12);
    return { lista, cartao: tel ? cartao(D, tel) : null, meta: META_SELOS }; }
  if (p === "/admin/avaliacoes") { const ls = deLojas(loja), l = D.avaliacoes.filter(a => ls.includes(a.loja)).slice().sort((a, b) => b.em.localeCompare(a.em));
    const dist = [5, 4, 3, 2, 1].map(n => ({ nota: n, n: l.filter(a => a.nota === n).length }));
    return { avaliacoes: l, total: l.length, media: l.length ? l.reduce((s, a) => s + a.nota, 0) / l.length : null, dist, comentarios: l.filter(a => a.comentario).length,
      porLoja: LOJAS.map(x => { const a = D.avaliacoes.filter(y => y.loja === x.id); return { loja: x.id, nome: x.nome, total: a.length, media: a.length ? a.reduce((s, y) => s + y.nota, 0) / a.length : null }; }) }; }
  if (p === "/admin/export/pedidos" || p === "/admin/export/movs") { const ls = deLojas(loja), n = +q("dias") || 1, de = new Date(hojeSP(new Date(Date.now() - (n - 1) * 864e5)) + "T00:00:00-03:00").toISOString();
    if (p.endsWith("pedidos")) return { linhas: D.pedidos.filter(x => ls.includes(x.loja) && x.criado_em >= de).sort((a, b) => a.criado_em.localeCompare(b.criado_em)) };
    return { linhas: D.movs.filter(m => ls.includes(m.loja) && m.criado_em >= de).map(m => { const i = D.itens.find(x => x.id === m.item_id) || {}; return { ...m, nome: i.nome || "(removido)", unidade: i.unidade || "" }; }) }; }
  /* tela do cliente e telão */
  if (p === "/loja/pedido") { const o = D.pedidos.find(x => x.id === q("id")); if (!o) erro("Pedido não encontrado."); return { pedido: publico(D, o) }; }
  if (p === "/loja/meus") return { pedidos: D.cliente.pedidos.map(id => D.pedidos.find(x => x.id === id)).filter(Boolean).map(o => publico(D, o)).reverse(), tel: D.cliente.tel, nome: D.cliente.nome };
  if (p === "/loja/selos") { const tel = normTel(q("tel")); return { cartao: tel ? cartao(D, tel) : null }; }
  if (p === "/telao") { const ls = deLojas(loja); return { pedidos: D.pedidos.filter(x => ls.includes(x.loja) && ABERTOS.includes(x.status)).map(x => ({ id: x.id, codigo: x.id.slice(-4), nome: primeiro(x.nome), status: x.status, criado_em: x.criado_em, pronto_em: x.pronto_em })) }; }
  erro("não encontrado");
}
function publico(D, o) {
  const a = D.avaliacoes.find(x => x.pedido === o.id);
  return { id: o.id, codigo: o.id.slice(-4), loja: o.loja, lojaNome: lojaNome(o.loja), nome: o.nome, tel: o.tel, itens: o.itens, total: o.total, consultar: o.consultar, status: o.status, etapa: ETAPA_TXT[o.status],
    criado_em: o.criado_em, pronto_em: o.pronto_em, retirado_em: o.retirado_em, av_em: o.av_em, avaliacao: a ? { nota: a.nota, comentario: a.comentario } : null, cartao: o.tel ? cartao(D, o.tel) : null };
}

/* ================= escrita ================= */
function post(D, p, b) {
  const quem = String(b.quem || "").slice(0, 30), agora = agoraISO();
  if (p === "/admin/pedido/status") { const o = D.pedidos.find(x => x.id === b.id) || erro("Pedido não encontrado."), antes = o.status; if (antes === b.status) return { ok: true };
    o.status = b.status; o.antes = b.status === "cancelado" ? antes : null; o.atualizado_em = agora; let estoque = null, selo = null;
    if (b.status === "pronto") o.pronto_em = agora;
    if (b.status === "retirado") { o.retirado_em = agora; o.av_em = new Date(Date.now() + 36e5).toISOString(); estoque = baixa(D, o.loja, o.id, o.itens, "pedido", "Pedido " + o.id, quem); if (o.tel) selo = { tel: o.tel, selos: selos(D, o.tel), ganhou: 1 }; }
    else if (antes === "retirado") { o.retirado_em = null; o.av_em = null; if (devolve(D, o.id, "Pedido " + o.id + " desfeito", quem)) estoque = "devolvido"; if (o.tel) selo = { tel: o.tel, selos: selos(D, o.tel), ganhou: -1 }; }
    if (b.status === "novo" || b.status === "separando") o.pronto_em = null;
    return { ok: true, estoque, selo }; }
  if (p === "/admin/pedido/balcao") { const itens = (b.itens || []).map(l => linhaDe(l, "loja")); if (!itens.length) erro("Adicione pelo menos um item.");
    const o = novoPedido({ loja: lojaOk(b.loja), nome: String(b.nome || "").trim().slice(0, 60) || "Balcão", tel: normTel(b.tel), itens, origem: "balcao", obs: String(b.obs || "").slice(0, 300) }); D.pedidos.push(o); return { ok: true, pedido: o }; }
  if (p === "/admin/pedido/valor") { const o = D.pedidos.find(x => x.id === b.id) || erro("Pedido não encontrado."); o.total_final = b.centavos; return { ok: true, total_final: b.centavos }; }
  if (p === "/admin/disponibilidade") { const loja = lojaOk(b.loja);
    if (b.liberarTudo) Object.keys(D.esg).filter(k => D.esg[k].loja === loja).forEach(k => delete D.esg[k]);
    else if (b.esgotado) { const it = achar(b.tipo, b.id) || erro("Item desconhecido."); D.esg[esgKey(loja, b.tipo, b.id)] = { loja, tipo: b.tipo, item_id: b.id, desde: agora, por: quem }; D.esgLog.push({ loja, tipo: b.tipo, item_id: b.id, nome: it.nome, em: agora }); }
    else delete D.esg[esgKey(loja, b.tipo, b.id)];
    return { ok: true, esgotados: Object.values(D.esg).filter(e => e.loja === loja) }; }
  if (p === "/admin/estoque/item") { const loja = lojaOk(b.loja), nome = String(b.nome || "").trim().slice(0, 50); if (nome.length < 2) erro("Confira: nome do item");
    if (D.itens.some(x => x.loja === loja && x.nome.toLowerCase() === nome.toLowerCase() && x.id !== b.id)) erro("Já existe um item com esse nome nesta loja.");
    const ean = String(b.ean || "").replace(/\D/g, ""); if (ean && D.itens.some(x => x.loja === loja && x.ean === ean && x.id !== b.id)) erro("Outro item desta loja já usa esse código de barras.");
    const campos = { nome, unidade: b.unidade, categoria: b.categoria, minimo: +b.minimo || 0, alvo: b.alvo ?? null, fornecedor: String(b.fornecedor || "").trim().slice(0, 40) || null, validade: b.validade || null, ean: ean || null, atualizado_em: agora };
    const custo = b.custo == null ? null : Math.max(0, +b.custo);
    if (b.id) { const i = D.itens.find(x => x.id === b.id) || erro("Item não encontrado."); Object.assign(i, campos);
      D.itens.filter(x => x.sku === i.sku).forEach(x => { x.custo = custo; if (ean) x.ean = ean; }); return { ok: true, item: aviso(i) }; }
    const base = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
    const outra = D.itens.find(x => x.nome.toLowerCase() === nome.toLowerCase());
    const i = { id: ++D.sid, loja, sku: outra ? outra.sku : base + "-" + D.sid, quantidade: 0, custo, ...campos }; D.itens.push(i);
    if (+b.quantidade) movim(D, i, +b.quantidade, "ajuste", "cadastro", null, quem); return { ok: true, item: aviso(i) }; }
  if (p === "/admin/estoque/mov") { const i = D.itens.find(x => x.id === b.id) || erro("Item não encontrado."), q = +b.qtd, n = r3(b.tipo === "entrada" ? i.quantidade + q : b.tipo === "saida" ? i.quantidade - q : q);
    if (!(q >= 0)) erro("Digite a quantidade."); if (n < 0) erro(`Só há ${fmtQ(i.quantidade)} ${i.unidade} de ${i.nome}.`); movim(D, i, n, b.tipo, String(b.motivo || "").slice(0, 80), null, quem); return { ok: true, item: aviso(i) }; }
  if (p === "/admin/estoque/transferir") { const i = D.itens.find(x => x.id === b.id) || erro("Item não encontrado."), q = r3(+b.qtd), para = lojaOk(b.para);
    if (para === i.loja) erro("Escolha outra loja."); if (!(q > 0)) erro("Digite a quantidade."); if (q > i.quantidade) erro(`Só há ${fmtQ(i.quantidade)} ${i.unidade} de ${i.nome}.`);
    let j = D.itens.find(x => x.loja === para && x.sku === i.sku);
    if (!j) { j = { ...i, id: ++D.sid, loja: para, quantidade: 0, validade: i.validade }; D.itens.push(j); }
    const ref = "T" + (++D.tn), obs = String(b.motivo || "").slice(0, 60);
    movim(D, i, r3(i.quantidade - q), "transferencia", `Para ${lojaNome(para)}${obs ? " · " + obs : ""}`, ref, quem);
    movim(D, j, r3(j.quantidade + q), "transferencia", `De ${lojaNome(i.loja)}${obs ? " · " + obs : ""}`, ref, quem);
    return { ok: true, item: aviso(i), destino: aviso(j) }; }
  if (p === "/admin/estoque/remover") { D.itens = D.itens.filter(x => x.id !== b.id); return { ok: true }; }
  if (p === "/admin/ficha") { const it = achar(b.tipo, b.id) || erro("Item desconhecido."), vs = variantes(it);
    [b.tipo + ":" + b.id, ...vs.map(v => b.tipo + ":" + b.id + "|" + v)].forEach(k => delete D.ficha[k]);
    (b.linhas || []).forEach(l => { if (!(l.qtd > 0) || !D.itens.some(x => x.sku === l.sku)) return; const k = b.tipo + ":" + b.id + (l.variante && vs.includes(l.variante) ? "|" + l.variante : ""); (D.ficha[k] = D.ficha[k] || []).push([l.sku, r3(l.qtd)]); });
    if (b.custos) Object.entries(b.custos).forEach(([sku, c]) => { if (c >= 0) D.itens.filter(x => x.sku === sku).forEach(x => { x.custo = c; }); });
    return { ok: true }; }
  if (p === "/admin/vendas") { const loja = lojaOk(b.loja), linhas = (b.itens || []).map(l => linhaDe(l, "cardapio")); if (!linhas.length) erro("Toque em + nos itens vendidos.");
    const v = { id: D.vendas.length + 1, loja, itens: linhas, quem, criado_em: agora, desfeita_em: null }; D.vendas.push(v);
    const bx = baixa(D, loja, "V" + v.id, linhas, "venda", "Vendas do dia", quem);
    return { ok: true, id: v.id, baixa: bx, semFicha: linhas.filter(l => !D.ficha[l.tipo + ":" + l.id] && !D.ficha[l.tipo + ":" + l.id + "|" + l.variante]).map(l => l.nome) }; }
  if (p === "/admin/vendas/desfazer") { const v = D.vendas.find(x => x.id === b.id) || erro("Lançamento não encontrado."); v.desfeita_em = agora; devolve(D, "V" + v.id, "Vendas do dia desfeitas", quem); return { ok: true }; }
  if (p === "/admin/fidelidade/ajuste") { const tel = normTel(b.tel) || erro("Confira o celular, com DDD."), d = Math.round(+b.delta);
    if (![1, -1, -META_SELOS].includes(d)) erro("Ajuste inválido."); const n = selos(D, tel);
    if (n + d < 0) erro(d === -META_SELOS ? `Faltam ${META_SELOS - n} selos para o prêmio.` : "O cartão já está sem selos.");
    const f = D.fidel[tel] = D.fidel[tel] || { nome: nomeTel(D, tel), ajustes: [] };
    f.ajustes.push({ delta: d, motivo: d === -META_SELOS ? "Prêmio resgatado: bebida por nossa conta" : d > 0 ? "Selo dado no balcão" : "Selo tirado no balcão", quem, em: agora });
    return { ok: true, cartao: cartao(D, tel) }; }
  if (p === "/demo/chegada") { const loja = lojaOk(b.loja); if (!b.forcar && !devido(D, loja)) return { pedido: null };
    const o = chegada(D, loja); if (!o && b.forcar) erro("Todos os produtos da loja estão esgotados. Libere algum na aba Cardápio."); return { pedido: o }; }
  /* tela do cliente */
  if (p === "/loja/pedido") { const loja = lojaOk(b.loja), nome = String(b.nome || "").trim().slice(0, 60);
    if (nome.length < 2) erro("Digite o seu nome para a retirada."); const tel = String(b.tel || "").trim() ? normTel(b.tel) || erro("Confira o celular (com DDD) ou deixe em branco.") : null;
    const itens = (b.itens || []).map(l => linhaDe(l, "cardapio")); if (!itens.length) erro("A sacola está vazia.");
    const esg = itens.filter(i => D.esg[esgKey(loja, i.tipo, i.id)]); if (esg.length) erro(`Acabou de esgotar: ${[...new Set(esg.map(i => i.nome))].join(", ")}. Tire da sacola para continuar.`);
    const o = novoPedido({ loja, nome, tel, itens, obs: String(b.obs || "").slice(0, 200) }); D.pedidos.push(o);
    D.cliente.pedidos.push(o.id); D.cliente.nome = nome; if (tel) D.cliente.tel = tel; return { ok: true, pedido: publico(D, o) }; }
  if (p === "/loja/avancar") { const o = D.pedidos.find(x => x.id === b.id) || erro("Pedido não encontrado."); if (o.status !== "retirado") erro("O pedido ainda não foi retirado.");
    o.av_em = new Date(Date.now() - 1000).toISOString(); return { ok: true }; }
  if (p === "/loja/avaliar") { const o = D.pedidos.find(x => x.id === b.id) || erro("Pedido não encontrado."); if (o.status !== "retirado") erro("Dá para avaliar depois da retirada.");
    const nota = Math.round(+b.nota); if (!(nota >= 1 && nota <= 5)) erro("Escolha de 1 a 5 estrelas.");
    let a = D.avaliacoes.find(x => x.pedido === o.id); if (!a) { a = { id: D.avaliacoes.length + 1, pedido: o.id, loja: o.loja, nome: o.nome, nota, comentario: "", em: agora }; D.avaliacoes.push(a); }
    a.nota = nota; a.em = agora; if (b.comentario != null) a.comentario = nota < 5 ? String(b.comentario).trim().slice(0, 500) : "";
    if (nota === 5) a.comentario = "";
    return { ok: true, avaliacao: a }; }
  erro("não encontrado");
}

export function api(method, path, body) {
  try {
    const u = new URL("https://x" + path), p = u.pathname, q = k => u.searchParams.get(k);
    if (method === "GET") return Promise.resolve(JSON.parse(JSON.stringify(get(ST.ler(), p, q))));
    if (p === "/demo/chegada" && !(body && body.forcar) && !devido(ST.ler(), body && body.loja)) return Promise.resolve({ pedido: null });
    return Promise.resolve(JSON.parse(JSON.stringify(ST.mudar(D => post(D, p, body || {})))));
  } catch (e) { return Promise.reject(new Error(e.message)); }
}
export const textoEtapa = s => ETAPA_TXT[s] || s;
export { telFmt, linhaNome };

/* ================= dados de EXEMPLO do início ================= */
const ean13 = n => { const b = "2" + String(n).padStart(11, "0"); const s = [...b].reduce((t, d, i) => t + +d * (i % 2 ? 3 : 1), 0); return b + (10 - s % 10) % 10; };
/* insumos de exemplo: [sku, nome, unidade, quantidade, mínimo, categoria, fornecedor, validade em dias, ter depois da compra, custo em centavos por unidade] */
const TORRA = "Torrefação (exemplo)", LAT = "Laticínio (exemplo)", EMB = "Embalagens (exemplo)", PAD = "Padaria parceira (exemplo)", EMP = "Empório (exemplo)", DIS = "Distribuidor (exemplo)", HORT = "Hortifrúti (exemplo)";
const C = ["Grãos e café", "Laticínios", "Cozinha", "Bebidas", "Embalagens", "Produtos da loja", "Outros"];
const INSUMOS = [
  ["graos-espresso", "Café em grãos, blend espresso", "kg", 2.4, 3, 0, TORRA, null, 8, 9500],
  ["graos-filtrado", "Café em grãos, filtrado (V60)", "kg", 1.6, 1, 0, TORRA, null, 3, 12000],
  ["leite", "Leite integral", "L", 18, 12, 1, LAT, 2, 36, 520],
  ["leite-aveia", "Leite de aveia", "L", 4, 6, 1, DIS, 60, 12, 1600],
  ["manteiga", "Manteiga", "kg", 1.5, 1, 1, LAT, 30, 3, 4800],
  ["presunto-queijo", "Presunto e queijo fatiados", "kg", 1.2, 1, 1, EMP, 6, 3, 5500],
  ["croissant", "Croissant congelado", "un", 26, 20, 2, PAD, 20, 60, 380],
  ["pao-queijo", "Pão de queijo congelado", "kg", 3.5, 2, 2, PAD, 45, null, 3200],
  ["pao-forma", "Pão de forma (fatias)", "un", 36, 20, 2, PAD, 5, 60, 40],
  ["cacau", "Cacau em pó", "kg", 0.8, 0.5, 2, EMP, null, null, 6000],
  ["chai", "Chai em pó", "kg", 0.6, 0.5, 2, EMP, null, 2, 11000],
  ["cha", "Chá em sachês", "un", 40, 30, 2, EMP, null, null, 90],
  ["bolo", "Bolo do dia (fatias)", "un", 6, 4, 2, "Cozinha da casa", null, null, 350],
  ["cookie", "Cookie (unidades)", "un", 18, 10, 2, PAD, 4, 40, 280],
  ["brownie", "Brownie (unidades)", "un", 12, 8, 2, PAD, 4, 30, 340],
  ["torta-limao", "Torta de limão (fatias)", "un", 0, 4, 2, "Cozinha da casa", null, 10, 450],
  ["laranja", "Laranja para suco", "kg", 9, 6, 3, HORT, 4, 20, 450],
  ["tonica", "Água tônica, lata 350 ml", "un", 14, 12, 3, DIS, null, 36, 590],
  ["gelo", "Gelo em cubos", "kg", 8, 5, 3, "Fábrica de gelo (exemplo)", null, 20, 300],
  ["copo-300", "Copo 300 ml para viagem", "un", 140, 150, 4, EMB, null, 500, 45],
  ["tampa-300", "Tampa para copo 300 ml", "un", 90, 150, 4, EMB, null, 500, 25],
  ["saquinho", "Saquinho kraft para doces", "un", 210, 100, 4, EMB, null, null, 18],
  ["cafe-250", "Café 250 g para a loja (pacotes)", "un", 14, 8, 5, TORRA, null, 24, 2400],
  ["drip-10", "Drip coffee, caixas com 10", "un", 5, 6, 5, TORRA, null, 15, 2200],
  ["caneca", "Caneca de cerâmica", "un", 3, 3, 5, "Ateliê de cerâmica (exemplo)", null, 10, 2800],
  ["acucar", "Açúcar em sachê", "un", 600, 300, 6, EMP, null, null, 6],
];
/* ficha técnica de EXEMPLO: quanto de cada insumo sai em UMA venda (na unidade do insumo) */
const FICHA = {
  "loja:graos-250": [["cafe-250", 1]], "loja:drip-10": [["drip-10", 1]], "loja:caneca": [["caneca", 1]],
  "cardapio:cafes-espresso": [["acucar", 1]], "cardapio:cafes-espresso|Simples": [["graos-espresso", 0.009]], "cardapio:cafes-espresso|Duplo": [["graos-espresso", 0.018]],
  "cardapio:cafes-coado-v60|200 ml": [["graos-filtrado", 0.015]], "cardapio:cafes-coado-v60|300 ml": [["graos-filtrado", 0.022]],
  "cardapio:cafes-macchiato": [["graos-espresso", 0.009], ["leite", 0.03], ["acucar", 1]],
  "cardapio:cafes-cappuccino": [["graos-espresso", 0.018], ["cacau", 0.002]], "cardapio:cafes-cappuccino|200 ml": [["leite", 0.12]], "cardapio:cafes-cappuccino|300 ml": [["leite", 0.2]],
  "cardapio:cafes-latte": [["graos-espresso", 0.018]], "cardapio:cafes-latte|200 ml": [["leite", 0.15]], "cardapio:cafes-latte|300 ml": [["leite", 0.24]],
  "cardapio:cafes-flat-white": [["graos-espresso", 0.018], ["leite", 0.12]],
  "cardapio:cafes-mocha": [["graos-espresso", 0.018], ["leite", 0.18], ["cacau", 0.02]],
  "cardapio:gelados-cold-brew": [["graos-filtrado", 0.03], ["gelo", 0.15], ["copo-300", 1], ["tampa-300", 1]],
  "cardapio:gelados-espresso-tonica": [["graos-espresso", 0.018], ["tonica", 1], ["gelo", 0.15], ["copo-300", 1], ["tampa-300", 1]],
  "cardapio:gelados-latte-gelado": [["graos-espresso", 0.018], ["leite", 0.2], ["gelo", 0.15], ["copo-300", 1], ["tampa-300", 1]],
  "cardapio:semcafe-cha": [["cha", 1], ["acucar", 1]], "cardapio:semcafe-chai-latte": [["chai", 0.025], ["leite", 0.2]],
  "cardapio:semcafe-chocolate-quente": [["cacau", 0.025], ["leite", 0.2]], "cardapio:semcafe-suco-de-laranja": [["laranja", 0.7]],
  "cardapio:comer-pao-de-queijo|1 unidade": [["pao-queijo", 0.035]], "cardapio:comer-pao-de-queijo|Porção com 3": [["pao-queijo", 0.105]],
  "cardapio:comer-croissant": [["croissant", 1]], "cardapio:comer-croissant-recheado": [["croissant", 1], ["presunto-queijo", 0.06]],
  "cardapio:comer-tostada": [["pao-forma", 2], ["manteiga", 0.015]], "cardapio:comer-misto-quente": [["pao-forma", 2], ["presunto-queijo", 0.07], ["manteiga", 0.01]],
  "cardapio:doces-bolo-do-dia": [["bolo", 1]], "cardapio:doces-cookie": [["cookie", 1], ["saquinho", 1]], "cardapio:doces-brownie": [["brownie", 1], ["saquinho", 1]],
  "cardapio:doces-torta-de-limao": [["torta-limao", 1]],
};
/* cada loja de exemplo: volume de vendas e estoque diferentes */
const PERFIL = { centro: { f: 1, q: 1 }, batel: { f: 1.2, q: 1.15 }, shopping: { f: 1.5, q: 1.3 }, sp: { f: 0.8, q: 0.9 } };
/* o que começa acabando em cada loja (além do que já está no mínimo nos números de base) */
const AJUSTE = { batel: { "leite-aveia": 9, "drip-10": 12, "copo-300": 320, "tampa-300": 300, "graos-espresso": 2.1 }, shopping: { "leite": 10, "cookie": 6, "copo-300": 260, "tampa-300": 240 }, sp: { "graos-espresso": 4.5, "croissant": 12, "copo-300": 210, "tampa-300": 200, "caneca": 6 } };

function semear() {
  let seed = 20261122; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = l => l[Math.floor(rnd() * l.length)];
  const agora = Date.now(), ago = m => new Date(agora - m * 60000).toISOString(), min = m => agora - m * 60000, em = d => hojeSP(new Date(agora + d * 864e5));
  const L = (tipo, id, variante, qtd) => linhaDe({ tipo, id, variante, qtd });
  const D = { v: 1, rev: 1, sessao: Math.random().toString(36).slice(2), criado: agora, sid: 0, tn: 0, extra: 0, ultimaChegada: agora, C,
    pedidos: [], itens: [], movs: [], vendas: [], baixas: [], esg: {}, esgLog: [], ficha: JSON.parse(JSON.stringify(FICHA)), fidel: {}, avaliacoes: [], cliente: { pedidos: [], tel: "", nome: "" } };
  const mk = o => novoPedido({ r: rnd, ...o });
  const retira = (o, msDepois) => { o.status = "retirado"; o.atualizado_em = o.pronto_em = o.retirado_em = new Date(Math.min(agora - 60000, Date.parse(o.criado_em) + msDepois)).toISOString(); o.av_em = new Date(Date.parse(o.retirado_em) + 36e5).toISOString(); return o; };

  /* ---- pedidos de hoje, em andamento (nomes inventados, celulares 41 9 0000-00xx que não são de ninguém) ---- */
  const ativos = [
    { loja: "centro", nome: "Júlia (exemplo)", tel: "41900000004", itens: [L("loja", "graos-250", "Moído para filtro", 2)], status: "pronto", ms: min(35) },
    { loja: "centro", nome: "Marcos (exemplo)", itens: [L("loja", "caneca", "", 1), L("loja", "graos-250", "Em grãos", 1)], status: "separando", ms: min(18), obs: "Vou buscar depois das 16h" },
    { loja: "centro", nome: "Balcão", itens: [L("loja", "kit-presente", "", 1), L("loja", "drip-10", "", 1)], status: "novo", ms: min(11), origem: "balcao", obs: "Embalar para presente" },
    { loja: "centro", nome: "Carla (exemplo)", tel: "41900000006", itens: [L("cardapio", "cafes-latte", "300 ml", 1), L("cardapio", "comer-pao-de-queijo", "Porção com 3", 1)], status: "novo", ms: min(4) },
    { loja: "batel", nome: "Rafael (exemplo)", tel: "41900000011", itens: [L("cardapio", "cafes-cappuccino", "300 ml", 2), L("cardapio", "comer-croissant", "", 2)], status: "separando", ms: min(9) },
    { loja: "batel", nome: "Larissa (exemplo)", itens: [L("loja", "graos-250", "Em grãos", 1)], status: "novo", ms: min(3) },
    { loja: "shopping", nome: "Otávio (exemplo)", itens: [L("cardapio", "gelados-cold-brew", "", 2)], status: "pronto", ms: min(14) },
    { loja: "shopping", nome: "Natália (exemplo)", tel: "41900000013", itens: [L("cardapio", "cafes-mocha", "", 1), L("cardapio", "doces-brownie", "", 1)], status: "separando", ms: min(6) },
    { loja: "shopping", nome: "Henrique (exemplo)", itens: [L("loja", "drip-10", "", 1)], status: "novo", ms: min(2) },
    { loja: "sp", nome: "Paula (exemplo)", tel: "41900000014", itens: [L("cardapio", "cafes-flat-white", "", 1)], status: "pronto", ms: min(7) },
  ].map(o => { const p = mk(o); if (p.status === "pronto") p.pronto_em = p.atualizado_em = ago(2); else p.atualizado_em = p.criado_em; return p; });

  /* ---- histórico: uma semana de pedidos já retirados em cada loja, para o Resumo ter barras ---- */
  const NOMES = ["Ana", "Bruno", "Camila", "Diego", "Eduarda", "Felipe", "Gabriela", "Igor", "Isabela", "João", "Lucas", "Mateus", "Nina", "Olívia", "Pietra", "Renato"].map(n => n + " (exemplo)");
  const BALCAO = [["cafes-cappuccino", "300 ml"], ["cafes-latte", "200 ml"], ["cafes-espresso", "Duplo"], ["cafes-coado-v60", "300 ml"], ["comer-pao-de-queijo", "Porção com 3"], ["comer-croissant", ""], ["doces-bolo-do-dia", ""], ["gelados-cold-brew", ""], ["doces-cookie", ""], ["cafes-mocha", ""], ["comer-misto-quente", ""]];
  const lojaItens = () => { const l = [L("loja", "graos-250", pick(["Em grãos", "Moído para filtro", "Moído para espresso"]), rnd() < .25 ? 2 : 1)]; if (rnd() < .35) l.push(L("loja", pick(["drip-10", "caneca"]), "", 1)); return l; };
  const balcao = () => { const n = 1 + Math.floor(rnd() * 3), l = []; for (let k = 0; k < n; k++) { const [id, v] = pick(BALCAO); if (!l.some(x => x.id === id)) l.push(L("cardapio", id, v, 1 + Math.floor(rnd() * 2))); } return l; };
  const hist = [];
  const passado = (loja, ms) => { const site = rnd() < .55, o = site ? mk({ loja, nome: pick(NOMES), itens: rnd() < .5 ? lojaItens() : balcao(), ms }) : mk({ loja, nome: "Balcão", itens: balcao(), ms, origem: "balcao" });
    retira(o, (12 + rnd() * 60) * 60000); if (rnd() < .06) { o.status = "cancelado"; o.antes = "novo"; o.retirado_em = o.av_em = o.pronto_em = null; } return o; };
  for (const { id: loja } of LOJAS) {
    const f = PERFIL[loja].f;
    for (let d = 6; d >= 1; d--) { const dia = hojeSP(new Date(agora - d * 864e5)), n = Math.round((3 + Math.floor(rnd() * 4) + (d === 1 || d === 6 ? 2 : 0)) * f);
      for (let k = 0; k < n; k++) { const h = 8 + Math.floor(rnd() * 10), m = Math.floor(rnd() * 60); hist.push(passado(loja, Date.parse(`${dia}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`))); } }
    [150, 95, 60].slice(0, loja === "shopping" ? 3 : 2).forEach(m => { if (hojeSP(new Date(min(m))) === hojeSP()) { const o = passado(loja, min(m)); retira(o, 25 * 60000); o.status = "retirado"; hist.push(o); } });
  }
  const kit = mk({ loja: "centro", nome: "Beatriz (exemplo)", itens: [L("loja", "kit-presente", "", 1)], ms: Date.parse(`${hojeSP(new Date(agora - 2 * 864e5))}T15:20:00-03:00`) }); retira(kit, 50 * 60000); kit.total_final = 12900; hist.push(kit);
  hist.sort((a, b) => a.criado_em.localeCompare(b.criado_em)); D.pedidos = [...hist, ...ativos];

  /* ---- estoque de EXEMPLO por loja: nomes genéricos, quantidades, custos, fornecedores e códigos de barras inventados ---- */
  for (const { id: loja } of LOJAS) {
    INSUMOS.forEach(([sku, nome, unidade, qtd, minimo, cat, fornecedor, val, alvo, custo], k) => {
      const aj = (AJUSTE[loja] || {})[sku], f = PERFIL[loja].q, q = aj ?? (loja === "centro" ? qtd : INTEIRO(unidade) ? Math.round(qtd * f) : r3(qtd * f));
      D.itens.push({ id: ++D.sid, loja, sku, nome, unidade, quantidade: q, minimo: loja === "centro" ? minimo : (INTEIRO(unidade) ? Math.round(minimo * f) : r3(minimo * f)), alvo: alvo == null ? null : (INTEIRO(unidade) ? Math.round(alvo * f) : r3(alvo * f)),
        categoria: C[cat], fornecedor, validade: val == null ? null : em(val + (loja === "centro" ? 0 : k % 3)), custo, ean: ean13(k + 1), atualizado_em: ago(60 * 24 * (k % 4) + 30) });
    });
  }

  /* ---- vendas do dia lançadas nos dias anteriores (entram em "Mais vendidos") ---- */
  const VEND = [["cafes-espresso", "Simples", 14], ["cafes-cappuccino", "300 ml", 10], ["cafes-latte", "200 ml", 8], ["cafes-coado-v60", "300 ml", 5], ["comer-pao-de-queijo", "1 unidade", 16], ["comer-croissant", "", 6], ["doces-bolo-do-dia", "", 5], ["gelados-cold-brew", "", 3]];
  for (const { id: loja } of LOJAS) for (let d = 6; d >= 1; d--) D.vendas.push({ id: D.vendas.length + 1, loja, quem: pick(["Ana (exemplo)", "Bruno (exemplo)"]), criado_em: new Date(Date.parse(`${hojeSP(new Date(agora - d * 864e5))}T19:10:00-03:00`)).toISOString(), desfeita_em: null,
    itens: VEND.map(([id, v, q]) => L("cardapio", id, v, Math.max(1, Math.round(q * PERFIL[loja].f * (.6 + rnd() * .8))))) });

  /* ---- alguns movimentos antigos, para o Histórico não começar vazio (terminam na quantidade de hoje) ---- */
  for (const { id: loja } of LOJAS) [["graos-espresso", 5, 1.6, 3], ["leite", 24, 9, 2], ["croissant", 30, 8, 4], ["copo-300", 300, 95, 5], ["tampa-300", 300, 60, 5], ["cafe-250", 12, 4, 6], ["leite-aveia", 6, 3, 3]].forEach(([sku, entrou, saiu, d]) => {
    const i = D.itens.find(x => x.loja === loja && x.sku === sku), antes = r3(i.quantidade + saiu - entrou);
    D.movs.push({ item_id: i.id, loja, delta: entrou, saldo: r3(antes + entrou), tipo: "entrada", motivo: "Compra", ref: null, quem: "Ana (exemplo)", criado_em: ago(60 * 24 * d + 600) });
    D.movs.push({ item_id: i.id, loja, delta: -saiu, saldo: i.quantidade, tipo: "venda", motivo: "Vendas do dia", ref: null, quem: "Bruno (exemplo)", criado_em: ago(60 * 24 + 300 + i.id % 60) });
  });
  D.movs.sort((a, b) => a.criado_em.localeCompare(b.criado_em));

  /* ---- esgotados de exemplo ---- */
  D.esg[esgKey("centro", "cardapio", "doces-torta-de-limao")] = { loja: "centro", tipo: "cardapio", item_id: "doces-torta-de-limao", desde: ago(90), por: "Ana (exemplo)" };
  D.esg[esgKey("shopping", "cardapio", "doces-cookie")] = { loja: "shopping", tipo: "cardapio", item_id: "doces-cookie", desde: ago(40), por: "Bruno (exemplo)" };
  Object.values(D.esg).forEach(e => D.esgLog.push({ loja: e.loja, tipo: e.tipo, item_id: e.item_id, nome: achar(e.tipo, e.item_id).nome, em: e.desde }));

  /* ---- cartão fidelidade: selos de antes (cartão de papel), clientes inventados ---- */
  [["41900000004", "Júlia (exemplo)", 8], ["41900000006", "Carla (exemplo)", 9], ["41900000011", "Rafael (exemplo)", 6], ["41900000012", "Helena (exemplo)", 3], ["41900000013", "Natália (exemplo)", 7], ["41900000014", "Paula (exemplo)", 11], ["41900000015", "Igor (exemplo)", 5]]
    .forEach(([tel, nome, n], k) => { D.fidel[tel] = { nome, ajustes: [{ delta: n, motivo: "Selos do cartão de papel (exemplo)", quem: "Ana (exemplo)", em: ago(60 * 24 * (8 + k)) }] }; });

  /* ---- avaliações de exemplo (comentários privados só nas notas de 1 a 4) ---- */
  const COMENT = { 4: ["Tudo certo, só a fila estava grande (exemplo).", "Gostei, mas o pão de queijo podia vir mais quentinho (exemplo).", ""], 3: ["O latte veio morno (exemplo).", "Demorou um pouco para ficar pronto (exemplo)."], 2: ["Faltou um item no pedido e precisei voltar (exemplo)."], 1: ["Cheguei e o pedido ainda não estava separado (exemplo)."] };
  const NOTAS = [5, 5, 5, 4, 5, 4, 5, 3, 5, 5, 4, 2, 5, 5, 3, 5, 4, 5, 1, 5];
  const cands = D.pedidos.filter(p => p.status === "retirado" && p.origem === "site");
  for (let k = 0, j = 0; k < cands.length && j < 30; k += 3, j++) { const o = cands[k], nota = NOTAS[j % NOTAS.length];
    D.avaliacoes.push({ id: D.avaliacoes.length + 1, pedido: o.id, loja: o.loja, nome: o.nome, nota, comentario: nota < 5 ? pick(COMENT[nota]) : "", em: o.av_em }); }
  return D;
}
