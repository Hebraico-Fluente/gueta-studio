/* Estado COMPARTILHADO da demonstração: várias abas e janelas do MESMO navegador (painel, tela do cliente,
   telão, apresentação) veem os mesmos dados de exemplo e ficam em sincronia.
   - guarda tudo numa chave do localStorage (só neste navegador; nada sai do aparelho);
   - avisa as outras abas por BroadcastChannel, com o evento "storage" como reserva;
   - "Recomeçar demonstração" grava uma semente nova e todas as telas voltam ao começo.
   Sem localStorage (navegação privada restrita), funciona só na memória desta aba. */
export function abrirEstado({ chave, canal, versao, semear }) {
  let cache = null, mem = null;
  const fns = new Set();
  const bc = typeof BroadcastChannel === "function" ? new BroadcastChannel(canal) : null;
  const bruto = () => { try { return localStorage.getItem(chave) ?? mem; } catch (e) { return mem; } };
  const parse = s => { try { const d = s && JSON.parse(s); return d && d.v === versao ? d : null; } catch (e) { return null; } };
  const grava = d => { const s = JSON.stringify(d); mem = s; try { localStorage.setItem(chave, s); } catch (e) {} cache = d; };
  const avisar = info => fns.forEach(f => { try { f(cache, info); } catch (e) { console.error(e); } });
  const avisarDepois = info => queueMicrotask(() => avisar(info));

  /** Os dados atuais (não mude o objeto devolvido: use mudar()). */
  function ler() {
    if (!cache) { cache = parse(bruto()); if (!cache) { cache = semear(); cache.rev = 1; grava(cache); } }
    return cache;
  }
  /** Lê a versão mais nova, aplica fn, grava e avisa todas as telas. Se fn der erro, nada é gravado. */
  function mudar(fn) {
    const d = parse(bruto()) || JSON.parse(JSON.stringify(ler()));
    const r = fn(d);
    d.rev = (d.rev || 0) + 1; grava(d);
    if (bc) bc.postMessage({ rev: d.rev, sessao: d.sessao });
    avisarDepois({ local: true });
    return r;
  }
  function recomecar() {
    const d = semear(); d.rev = 1; grava(d);
    if (bc) bc.postMessage({ rev: d.rev, sessao: d.sessao, reset: true });
    avisarDepois({ local: true, reset: true });
  }
  /* outra aba mudou: relê e avisa (ignora o que esta aba já tem) */
  function deFora() {
    const d = parse(bruto()); if (!d) return;
    if (cache && d.sessao === cache.sessao && d.rev === cache.rev) return;
    const reset = !!cache && d.sessao !== cache.sessao;
    cache = d; avisar({ reset });
  }
  if (bc) bc.addEventListener("message", deFora);
  addEventListener("storage", e => { if (e.key === chave) deFora(); });
  return { ler, mudar, recomecar, ouvir: f => { fns.add(f); return () => fns.delete(f); } };
}
