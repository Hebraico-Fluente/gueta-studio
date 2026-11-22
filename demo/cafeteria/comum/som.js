/* Avisos sonoros curtos, gerados na hora (Web Audio), sem arquivo de áudio.
   O navegador só libera som depois de um toque na página: ligar() deve ser chamado num toque/clique. */
const SONS = { novo: [[660, 0], [880, .2], [990, .4]], pronto: [[784, 0], [1047, .18], [1319, .36], [1568, .6]] };
export function criarSom() {
  let ac = null;
  function ligar() {
    if (!ac) try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
    if (ac && ac.state === "suspended") ac.resume().catch(() => {});
    return !!ac;
  }
  function tocar(tipo = "novo") {
    if (!ac && navigator.userActivation && navigator.userActivation.hasBeenActive) ligar();
    if (!ac) return false;
    if (ac.state === "suspended") ac.resume().catch(() => {});
    const t0 = ac.currentTime + .02, dur = tipo === "pronto" ? .5 : .17;
    for (const [f, t] of SONS[tipo] || SONS.novo) {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = tipo === "pronto" ? "triangle" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, t0 + t); g.gain.exponentialRampToValueAtTime(.25, t0 + t + .02); g.gain.exponentialRampToValueAtTime(.0001, t0 + t + dur);
      o.connect(g).connect(ac.destination); o.start(t0 + t); o.stop(t0 + t + dur + .02);
    }
    return true;
  }
  return { ligar, tocar, get ligado() { return !!ac && ac.state === "running"; } };
}
