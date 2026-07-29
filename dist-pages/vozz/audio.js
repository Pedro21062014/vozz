/**
 * Utilidades de áudio: empacotamento WAV, reprodução no navegador e
 * concatenação de trechos. Sem dependências.
 */

const TAXA_PADRAO = 24000;

/**
 * Resultado de uma síntese.
 */
export class Audio {
  /**
   * @param {Float32Array} amostras PCM em [-1, 1]
   * @param {number} taxa amostras por segundo
   */
  constructor(amostras, taxa = TAXA_PADRAO) {
    this.amostras = amostras;
    this.taxa = taxa;
  }

  /** Duração em segundos. */
  get duracao() {
    return this.amostras.length / this.taxa;
  }

  /** Converte para WAV PCM 16-bit. @returns {ArrayBuffer} */
  paraWav() {
    return codificarWav(this.amostras, this.taxa);
  }

  /** Cria um Blob `audio/wav` (navegador). */
  paraBlob() {
    return new Blob([this.paraWav()], { type: "audio/wav" });
  }

  /** Cria uma object URL tocável em `<audio src=...>`. */
  paraURL() {
    return URL.createObjectURL(this.paraBlob());
  }

  /**
   * Toca o áudio no navegador.
   * @returns {Promise<void>} resolve quando terminar
   */
  tocar() {
    if (typeof window === "undefined") {
      throw new Error("[vozz] tocar() só funciona no navegador. No Node use salvar().");
    }
    const url = this.paraURL();
    const el = new window.Audio(url);
    this._elemento = el;
    return new Promise((resolve, reject) => {
      el.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      el.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      el.play().catch(reject);
    });
  }

  /** Interrompe a reprodução iniciada por `tocar()`. */
  parar() {
    if (this._elemento) {
      this._elemento.pause();
      this._elemento.currentTime = 0;
    }
  }

  /**
   * Salva em disco (Node) ou dispara download (navegador).
   * @param {string} caminho
   */
  async salvar(caminho = "audio.wav") {
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      const a = document.createElement("a");
      a.href = this.paraURL();
      a.download = caminho;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    // O especificador é montado em runtime de propósito: assim bundlers de
    // navegador (Vite, webpack, esbuild) não tentam resolver "node:fs/promises"
    // em tempo de build, o que quebraria a compilação para a web.
    const modulo = "node:fs" + "/promises";
    const { writeFile } = await import(/* @vite-ignore */ /* webpackIgnore: true */ modulo);
    await writeFile(caminho, new Uint8Array(this.paraWav()));
  }

  /** Concatena vários trechos, com pausa opcional entre eles. */
  static concatenar(lista, pausaSegundos = 0) {
    const itens = lista.filter(Boolean);
    if (!itens.length) return new Audio(new Float32Array(0));
    const taxa = itens[0].taxa;
    const silencio = Math.round(pausaSegundos * taxa);
    const total =
      itens.reduce((s, a) => s + a.amostras.length, 0) + silencio * (itens.length - 1);
    const buf = new Float32Array(total);
    let off = 0;
    itens.forEach((a, i) => {
      buf.set(a.amostras, off);
      off += a.amostras.length;
      if (i < itens.length - 1) off += silencio;
    });
    return new Audio(buf, taxa);
  }
}

/**
 * Codifica PCM float em WAV 16-bit.
 * @param {Float32Array} amostras
 * @param {number} taxa
 * @returns {ArrayBuffer}
 */
export function codificarWav(amostras, taxa = TAXA_PADRAO) {
  const n = amostras.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);

  const escreverTexto = (off, txt) => {
    for (let i = 0; i < txt.length; i++) dv.setUint8(off + i, txt.charCodeAt(i));
  };

  escreverTexto(0, "RIFF");
  dv.setUint32(4, 36 + n * 2, true);
  escreverTexto(8, "WAVE");
  escreverTexto(12, "fmt ");
  dv.setUint32(16, 16, true);        // tamanho do bloco fmt
  dv.setUint16(20, 1, true);         // PCM
  dv.setUint16(22, 1, true);         // mono
  dv.setUint32(24, taxa, true);
  dv.setUint32(28, taxa * 2, true);  // byte rate
  dv.setUint16(32, 2, true);         // block align
  dv.setUint16(34, 16, true);        // bits por amostra
  escreverTexto(36, "data");
  dv.setUint32(40, n * 2, true);

  let off = 44;
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, amostras[i]));
    dv.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    off += 2;
  }
  return buf;
}

export { TAXA_PADRAO };
