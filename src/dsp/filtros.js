/**
 * Filtros digitais para síntese por formantes.
 *
 * Ressoador de dois polos e antirressoador de dois zeros, na formulação
 * clássica de Klatt (1980). São os blocos que dão forma ao trato vocal:
 * cada formante é um ressoador; nasalidade usa um par polo/zero.
 */

/**
 * Ressoador de 2 polos:  y[n] = A·x[n] + B·y[n-1] + C·y[n-2]
 *
 * A frequência central controla *qual* formante; a largura de banda
 * controla o quanto ele ressoa (banda estreita = som mais "metálico").
 */
export class Ressoador {
  constructor(taxa) {
    this.taxa = taxa;
    this.a = 1; this.b = 0; this.c = 0;
    this.y1 = 0; this.y2 = 0;
  }

  /** Define frequência (Hz) e largura de banda (Hz). */
  ajustar(freq, banda) {
    const T = 1 / this.taxa;
    // Estabilidade: mantém o polo dentro do círculo unitário.
    const f = Math.min(Math.max(freq, 20), this.taxa / 2 - 100);
    const bw = Math.min(Math.max(banda, 20), 2000);
    this.c = -Math.exp(-2 * Math.PI * bw * T);
    this.b = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(2 * Math.PI * f * T);
    this.a = 1 - this.b - this.c;
    return this;
  }

  processar(x) {
    const y = this.a * x + this.b * this.y1 + this.c * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  zerar() { this.y1 = 0; this.y2 = 0; }
}

/**
 * Antirressoador de 2 zeros: usado para o "vale" espectral da nasalização
 * e para atenuar regiões do espectro.
 */
export class AntiRessoador {
  constructor(taxa) {
    this.taxa = taxa;
    this.a = 1; this.b = 0; this.c = 0;
    this.x1 = 0; this.x2 = 0;
  }

  ajustar(freq, banda) {
    const T = 1 / this.taxa;
    const f = Math.min(Math.max(freq, 20), this.taxa / 2 - 100);
    const bw = Math.min(Math.max(banda, 20), 3000);
    const c = -Math.exp(-2 * Math.PI * bw * T);
    const b = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(2 * Math.PI * f * T);
    const a = 1 - b - c;
    // Inverte o ressoador para virar zeros.
    this.a = 1 / a;
    this.b = -b / a;
    this.c = -c / a;
    return this;
  }

  processar(x) {
    const y = this.a * x + this.b * this.x1 + this.c * this.x2;
    this.x2 = this.x1;
    this.x1 = x;
    return y;
  }

  zerar() { this.x1 = 0; this.x2 = 0; }
}

/** Passa-baixa de 1 polo (suavização de ruído e envelopes). */
export class PassaBaixa {
  constructor(taxa, corte = 1000) {
    this.taxa = taxa;
    this.y1 = 0;
    this.ajustar(corte);
  }
  ajustar(corte) {
    const x = Math.exp(-2 * Math.PI * corte / this.taxa);
    this.a = 1 - x;
    this.b = x;
    return this;
  }
  processar(x) {
    this.y1 = this.a * x + this.b * this.y1;
    return this.y1;
  }
  zerar() { this.y1 = 0; }
}

/** Passa-alta de 1 polo (remove offset DC). */
export class PassaAlta {
  constructor(taxa, corte = 60) {
    this.r = Math.exp(-2 * Math.PI * corte / taxa);
    this.x1 = 0; this.y1 = 0;
  }
  processar(x) {
    const y = x - this.x1 + this.r * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
  zerar() { this.x1 = 0; this.y1 = 0; }
}

/**
 * Filtro biquad genérico (Robert Bristow-Johnson cookbook).
 *
 * Usado para modelagem espectral final: um realce suave na região de F2/F3
 * (a faixa da inteligibilidade) e um corte nos agudos, que no modelo de
 * formantes tendem a ficar acima do natural.
 */
export class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }

  /** Realce/corte em sino centrado em `freq`, com ganho em dB. */
  pico(taxa, freq, q, ganhoDb) {
    const A = Math.pow(10, ganhoDb / 40);
    const w = 2 * Math.PI * freq / taxa;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    const a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / a0;
    this.b1 = (-2 * cos) / a0;
    this.b2 = (1 - alpha * A) / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha / A) / a0;
    return this;
  }

  /** Prateleira de agudos: atenua (ou realça) tudo acima de `freq`. */
  shelfAlto(taxa, freq, ganhoDb) {
    const A = Math.pow(10, ganhoDb / 40);
    const w = 2 * Math.PI * freq / taxa;
    const cos = Math.cos(w), sin = Math.sin(w);
    const alpha = sin / 2 * Math.sqrt((A + 1 / A) * (1 / 0.9 - 1) + 2);
    const raiz = 2 * Math.sqrt(A) * alpha;
    const a0 = (A + 1) - (A - 1) * cos + raiz;
    this.b0 = A * ((A + 1) + (A - 1) * cos + raiz) / a0;
    this.b1 = -2 * A * ((A - 1) + (A + 1) * cos) / a0;
    this.b2 = A * ((A + 1) + (A - 1) * cos - raiz) / a0;
    this.a1 = 2 * ((A - 1) - (A + 1) * cos) / a0;
    this.a2 = ((A + 1) - (A - 1) * cos - raiz) / a0;
    return this;
  }

  processar(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
            - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }

  zerar() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
}
