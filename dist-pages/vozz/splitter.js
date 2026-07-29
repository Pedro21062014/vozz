/**
 * Divisão de texto em sentenças, respeitando abreviações, números decimais,
 * reticências, aspas e parênteses. Também expõe um divisor incremental para
 * fluxo (útil ao ler a saída de um LLM token a token).
 */

const ABREV = new Set([
  "sr", "sra", "srta", "dr", "dra", "prof", "profa", "eng", "exmo",
  "av", "r", "pç", "ed", "apto", "ap", "pág", "pag", "fig", "obs",
  "ex", "etc", "cia", "ltda", "núm", "no", "tel", "cel", "jan", "fev",
  "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
  "seg", "ter", "qua", "qui", "sex", "sáb", "dom", "vs", "p", "pp",
]);

const FECHAMENTO = new Set(['"', "'", ")", "]", "}", "”", "»", "…"]);

/**
 * Divide um texto completo em sentenças.
 * @param {string} texto
 * @returns {string[]}
 */
export function dividirEmSentencas(texto) {
  const t = String(texto ?? "").replace(/\r\n/g, "\n");
  if (!t.trim()) return [];

  const sentencas = [];
  let inicio = 0;
  let i = 0;

  while (i < t.length) {
    const c = t[i];

    // Quebra de parágrafo sempre encerra a sentença.
    if (c === "\n" && t[i + 1] === "\n") {
      const s = t.slice(inicio, i).trim();
      if (s) sentencas.push(s);
      inicio = i + 1;
      i += 2;
      continue;
    }

    if (".!?…".includes(c)) {
      // Reticências: consome tudo.
      let fim = i;
      while (fim + 1 < t.length && ".!?…".includes(t[fim + 1])) fim++;
      // Absorve aspas/parênteses de fechamento.
      while (fim + 1 < t.length && FECHAMENTO.has(t[fim + 1])) fim++;

      const proximo = t.slice(fim + 1).match(/^\s*(\S)/);
      const charSeguinte = proximo?.[1] ?? "";
      const espacoDepois = /^\s/.test(t.slice(fim + 1)) || fim + 1 >= t.length;

      // Palavra imediatamente anterior (para checar abreviação).
      let j = i - 1;
      while (j >= 0 && /\S/.test(t[j])) j--;
      const palavraAnt = t.slice(j + 1, i).toLowerCase().replace(/[^\p{L}\d]/gu, "");

      const ehAbreviacao = c === "." && ABREV.has(palavraAnt);
      const ehDecimal = c === "." && /\d$/.test(t.slice(0, i)) && /^\d/.test(t.slice(i + 1));
      const ehSigla = c === "." && palavraAnt.length === 1 && /^[a-zà-ÿ]$/.test(palavraAnt);
      const continuaMinuscula = charSeguinte && /[a-zà-ÿ0-9]/.test(charSeguinte);

      // Se a próxima palavra começa em minúscula, a frase continua
      // (típico de fala citada: Ele disse: "Oi!" e saiu.).
      if (!ehAbreviacao && !ehDecimal && !ehSigla && espacoDepois &&
          !continuaMinuscula) {
        const s = t.slice(inicio, fim + 1).trim();
        if (s) sentencas.push(s);
        inicio = fim + 1;
      }
      i = fim + 1;
      continue;
    }
    i++;
  }

  const resto = t.slice(inicio).trim();
  if (resto) sentencas.push(resto);
  return sentencas;
}

/**
 * Divisor incremental: alimente com pedaços de texto (ex.: stream de um LLM)
 * e itere para receber sentenças completas assim que ficarem prontas.
 *
 *   const divisor = new DivisorDeTexto();
 *   for await (const parte of tts.falarEmFluxo(divisor, { voz: "dora" })) { ... }
 *   divisor.empurrar("Olá! ");
 *   divisor.fechar();
 */
export class DivisorDeTexto {
  constructor() {
    this._buffer = "";
    this._fila = [];
    this._aguardando = null;
    this._fechado = false;
  }

  /** Adiciona texto ao fluxo. */
  empurrar(...pedacos) {
    for (const p of pedacos) this._buffer += p;
    this._processar();
    return this;
  }

  /** Emite o que restou sem esperar pontuação final. */
  descarregar() {
    const resto = this._buffer.trim();
    if (resto) this._fila.push(resto);
    this._buffer = "";
    this._liberar();
    return this;
  }

  /** Encerra o fluxo. */
  fechar() {
    if (this._fechado) return this;
    this._fechado = true;
    this.descarregar();
    return this;
  }

  /** @private */
  _processar() {
    const sentencas = dividirEmSentencas(this._buffer);
    if (sentencas.length <= 1) return;
    // A última pode estar incompleta: mantém no buffer.
    const completas = sentencas.slice(0, -1);
    const ultima = sentencas[sentencas.length - 1];
    for (const s of completas) this._fila.push(s);
    this._buffer = this._buffer.slice(this._buffer.lastIndexOf(ultima));
    if (completas.length) this._liberar();
  }

  /** @private */
  _liberar() {
    if (this._aguardando) {
      const r = this._aguardando;
      this._aguardando = null;
      r();
    }
  }

  async *[Symbol.asyncIterator]() {
    for (;;) {
      if (this._fila.length) {
        yield this._fila.shift();
        continue;
      }
      if (this._fechado) return;
      await new Promise((r) => { this._aguardando = r; });
    }
  }
}
