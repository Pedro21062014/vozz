/**
 * Fontes de excitação: pregas vocais (voz) e turbulência (ruído).
 *
 * A voz humana é modelada como fonte + filtro. Aqui ficam as fontes; os
 * formantes (filtro) estão em `filtros.js`.
 */

/**
 * Gerador glotal — modelo de Liljencrants-Fant (LF) simplificado.
 *
 * Produz a *derivada* do fluxo glotal, que é o que efetivamente excita o
 * trato vocal. O formato do pulso define a qualidade da voz: `tenso` deixa
 * a voz mais brilhante e projetada; valores baixos deixam mais suave.
 */
export class FonteGlotal {
  /**
   * @param {number} taxa amostras por segundo
   */
  constructor(taxa) {
    this.taxa = taxa;
    this.fase = 0;      // posição dentro do período atual (0..1)
    this.periodo = taxa / 120;
    this.aberturaRel = 0.6;  // fração do período com a glote aberta
    this.tenso = 0.72;       // assimetria do pulso (0.5 suave .. 0.9 tenso)
    // Jitter e shimmer dão vida à voz: sem eles, soa sintético demais.
    this.jitter = 0.015;
    this.shimmer = 0.04;
    this._ganhoCiclo = 1;
    this._periodoCiclo = this.periodo;
    this._aleatorio = criarRuidoBranco(20250728);
  }

  /** Define a frequência fundamental em Hz. */
  ajustarF0(f0) {
    this.periodo = this.taxa / Math.max(40, Math.min(600, f0));
  }

  /**
   * Gera a próxima amostra da derivada do fluxo glotal.
   * @returns {number} amostra em torno de [-1, 1]
   */
  proxima() {
    if (this.fase >= 1) {
      this.fase -= 1;
      // Novo ciclo: sorteia jitter (variação de período) e shimmer (amplitude).
      const j = 1 + (this._aleatorio() * 2 - 1) * this.jitter;
      this._periodoCiclo = this.periodo * j;
      this._ganhoCiclo = 1 + (this._aleatorio() * 2 - 1) * this.shimmer;
    }

    const t = this.fase;

    // Modelo de Liljencrants-Fant (LF) para a derivada do fluxo glotal.
    //
    // A forma de onda importa mais que qualquer ajuste de ganho: é ela que
    // determina o timbre. A versão anterior descia lentamente até o mínimo e
    // voltava com um degrau — o inverso da fisiologia, e soava como zumbido.
    //
    // No ciclo real:
    //   1. abertura   — o fluxo cresce devagar (derivada positiva, suave);
    //   2. fechamento — as pregas colidem e o fluxo é interrompido de forma
    //      abrupta, produzindo um pico negativo curto e profundo;
    //   3. fase fechada — retorno rápido a zero e silêncio até o próximo ciclo.
    //
    // É a descontinuidade do passo 2 que gera os harmônicos altos capazes de
    // excitar F2 e F3, e portanto a inteligibilidade das vogais.
    const Te = this.aberturaRel;          // instante do fechamento
    const Tp = Te * this.tenso;           // pico do fluxo (antes do fechamento)
    let d;

    if (t < Tp) {
      // Abertura: meio seno crescente, amplitude modesta.
      d = Math.sin((Math.PI / 2) * (t / Tp)) * 0.32;
    } else if (t < Te) {
      // Fechamento: queda acelerada até o mínimo, concentrada no fim do
      // intervalo. O expoente controla o quanto o pulso é "tenso".
      const u = (t - Tp) / (Te - Tp);
      d = 0.32 * Math.cos((Math.PI / 2) * u) - Math.pow(u, 2.6) * 1.28;
    } else {
      // Fase fechada: recuperação exponencial rápida a partir do mínimo.
      const u = (t - Te) / Math.max(1e-6, 1 - Te);
      d = -0.96 * Math.exp(-u * 9);
    }

    this.fase += 1 / this._periodoCiclo;
    return d * this._ganhoCiclo;
  }

  zerar() {
    this.fase = 0;
    this._ultimo = 0;
  }
}

/**
 * Ruído branco determinístico (xorshift).
 * Determinístico de propósito: a mesma frase gera exatamente o mesmo áudio.
 */
export function criarRuidoBranco(semente = 1) {
  let s = semente >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/** Fonte de turbulência para fricativas e aspiração. */
export class FonteRuido {
  constructor(semente = 987654321) {
    this._r = criarRuidoBranco(semente);
  }
  /** @returns {number} amostra em [-1, 1] */
  proxima() {
    return this._r() * 2 - 1;
  }
}
