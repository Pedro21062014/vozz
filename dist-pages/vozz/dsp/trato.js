/**
 * Trato vocal: cascata de ressoadores no modelo de Klatt.
 *
 * Por que cascata e não paralelo:
 *
 * Numa cascata, a saída de um ressoador alimenta o próximo. As frequências
 * dos picos ficam exatamente onde os polos foram colocados, e as amplitudes
 * relativas surgem sozinhas da física — que é o comportamento de um tubo
 * acústico real. É a topologia certa para sons vozeados.
 *
 * Numa estrutura paralela, cada ressoador recebe a mesma excitação e as
 * saídas são somadas com pesos. Como cada ramo tem fase própria, a soma
 * produz interferência: os picos se deslocam e vales aparecem onde não
 * deveria haver. Foi o que aconteceu na versão anterior — as vogais
 * convergiam todas para F2 ≈ 1300 Hz e ficavam indistinguíveis.
 *
 * O paralelo continua útil para fricativas e bursts, onde o espectro é
 * modelado por regiões de energia e não por um tubo ressonante.
 */

import { Ressoador, AntiRessoador } from "./filtros.js";

/** Número de formantes na cascata. */
const N_FORMANTES = 5;

export class TratoVocal {
  /**
   * @param {number} taxa amostras por segundo
   */
  constructor(taxa) {
    this.taxa = taxa;
    /** @type {Ressoador[]} */
    this.formantes = Array.from({ length: N_FORMANTES }, () => new Ressoador(taxa));
    // Par polo/zero da nasalização.
    this.poloNasal = new Ressoador(taxa);
    this.zeroNasal = new AntiRessoador(taxa);
    this.nasalidade = 0;
    // Correção de ganho: a cascata atenua o sinal a cada estágio.
    this.ganho = 1;
  }

  /**
   * Configura os formantes.
   * @param {number[]} freqs frequências em Hz (F1..F5)
   * @param {number[]} bandas larguras de banda em Hz
   */
  ajustar(freqs, bandas) {
    for (let i = 0; i < N_FORMANTES; i++) {
      const f = freqs[i];
      if (f == null) continue;
      this.formantes[i].ajustar(f, bandas[i] ?? 100 + i * 40);
    }
    return this;
  }

  /** Define o grau de nasalização (0 = oral, 1 = totalmente nasal). */
  ajustarNasal(grau, freqPolo = 280, freqZero = 480) {
    this.nasalidade = grau;
    if (grau > 0) {
      this.poloNasal.ajustar(freqPolo, 110);
      this.zeroNasal.ajustar(freqZero, 160);
    }
    return this;
  }

  /**
   * Processa uma amostra através da cascata.
   * @param {number} x excitação
   * @returns {number}
   */
  processar(x) {
    let y = x;
    // O zero nasal entra antes da cascata: ele remove energia do espectro da
    // fonte, exatamente como o acoplamento da cavidade nasal faz.
    if (this.nasalidade > 0) {
      const nasal = this.zeroNasal.processar(this.poloNasal.processar(x));
      y = y * (1 - this.nasalidade * 0.5) + nasal * this.nasalidade * 1.4;
    }
    for (let i = 0; i < N_FORMANTES; i++) {
      y = this.formantes[i].processar(y);
    }
    return y * this.ganho;
  }

  zerar() {
    for (const f of this.formantes) f.zerar();
    this.poloNasal.zerar();
    this.zeroNasal.zerar();
  }
}

/**
 * Ramo paralelo para fricativas e bursts.
 *
 * Aqui o paralelo é a escolha certa: o ruído de uma fricativa não passa por
 * um tubo ressonante completo, e sim por uma constrição que gera energia em
 * regiões específicas do espectro.
 */
export class TratoFricativo {
  constructor(taxa) {
    this.taxa = taxa;
    this.r = Array.from({ length: 3 }, () => new Ressoador(taxa));
    this.amp = [0, 0, 0];
  }

  /**
   * @param {{f:number,bw:number,a:number}[]} polos até 3 regiões espectrais
   */
  ajustar(polos) {
    for (let i = 0; i < 3; i++) {
      const p = polos[i];
      if (!p) { this.amp[i] = 0; continue; }
      this.r[i].ajustar(p.f, p.bw);
      this.amp[i] = p.a;
    }
    return this;
  }

  processar(x) {
    let y = 0;
    // Sinais alternados: prática padrão no ramo paralelo de Klatt para
    // evitar cancelamento entre picos adjacentes.
    for (let i = 0; i < 3; i++) {
      if (this.amp[i] === 0) continue;
      const s = i % 2 === 0 ? 1 : -1;
      y += s * this.amp[i] * this.r[i].processar(x);
    }
    return y;
  }

  zerar() { for (const r of this.r) r.zerar(); }
}
