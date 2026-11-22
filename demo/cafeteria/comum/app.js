/* Painel como app no tablet: service worker (funciona offline), instalar e manter a tela acesa.
   Tudo é opcional: se o navegador não tiver o recurso, a demonstração segue normal. */
export function registrarApp() {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  const raiz = new URL("../", import.meta.url);
  navigator.serviceWorker.register(new URL("sw.js", raiz), { scope: raiz.pathname }).catch(() => {});
}
/** Screen Wake Lock: a tela não apaga enquanto a página estiver aberta e visível. */
export function criarTelaAcesa(mudou = () => {}) {
  const suportado = "wakeLock" in navigator;
  let lock = null, quer = false;
  const estado = () => ({ suportado, quer, ligado: !!lock });
  async function pedir() {
    try { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; mudou(estado()); }); }
    catch (e) { lock = null; }
    mudou(estado());
  }
  document.addEventListener("visibilitychange", () => { if (quer && document.visibilityState === "visible" && !lock) pedir(); });
  return {
    suportado, estado,
    async ligar(v) {
      quer = !!v;
      if (!suportado) return mudou(estado());
      if (quer) return pedir();
      if (lock) { try { await lock.release(); } catch (e) {} lock = null; }
      mudou(estado());
    },
  };
}
export const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const ehIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
