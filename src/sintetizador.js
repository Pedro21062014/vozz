/**
 * vozz/sintetizador — TTS por síntese de formantes, 100% em código.
 *
 * Sem rede neural, sem download de pesos, sem dependência alguma. O áudio é
 * calculado amostra a amostra a partir de um modelo fonte-filtro:
 *
 *     pregas vocais (fonte)  ->  formantes do trato vocal (filtro)  ->  áudio
 *
 * Roda em qualquer runtime JS, inclusive Cloudflare Workers e outros edges,
 * porque é aritmética pura sobre Float32Array.
 */

import { Ressoador, AntiRessoador, PassaBaixa, PassaAlta } from "./dsp/filtros.js";
import { FonteGlotal, FonteRuido } from "./dsp/fontes.js";
import { buscarFonema, segmentarIPA, BANDAS_PADRAO, LOCUS } from "./dsp/fonemas.js";
import { fonemizar } from "./g2p/index.js";
import { Audio, TAXA_PADRAO } from "./audio.js";
import { dividirEmSentencas } from "./splitter.js";

/**
 * Vozes do motor em código. Diferente do motor neural, aqui a voz é definida
 * por parâmetros físicos: altura da laringe (f0) e comprimento do trato vocal
 * (escala dos formantes).
 */
export const VOZES_CODIGO = Object.freeze({
  clara: {
    nome: "Clara", genero: "feminina",
    f0: 200, escalaFormante: 1.14, tenso: 0.70,
    descricao: "Voz feminina. Trato vocal mais curto, formantes mais altos.",
  },
  bruno: {
    nome: "Bruno", genero: "masculina",
    f0: 115, escalaFormante: 0.94, tenso: 0.74,
    descricao: "Voz masculina. Fundamental mais grave.",
  },
  grave: {
    nome: "Grave", genero: "masculina",
    f0: 92, escalaFormante: 0.88, tenso: 0.78,
    descricao: "Voz masculina grave, para narração.",
  },
});

/** Interpolação linear. */
const lerp = (a, b, t) => a + (b - a) * t;

/** Suavização em S: evita cliques nas transições entre fonemas. */
const suave = (t) => t * t * (3 - 2 * t);

/**
 * Monta a trilha de alvos acústicos a partir dos fonemas.
 * Cada segmento vira um alvo (F1/F2/F3 + tipo + duração).
 */
function planejar(segmentos, opcoes) {
  const { velocidade, voz, entonacao } = opcoes;
  const alvos = [];

  for (let i = 0; i < segmentos.length; i++) {
    const seg = segmentos[i];
    const f = buscarFonema(seg.simbolo);
    if (!f) continue;

    // Duração: tônica alonga, átona encurta, velocidade escala tudo.
    let dur = f.dur;
    if (seg.tonica) dur *= 1.28;
    else if (seg.secundaria) dur *= 1.10;
    if (seg.longa) dur *= 1.5;
    dur /= velocidade;

    alvos.push({
      simbolo: seg.simbolo,
      tipo: f.tipo,
      f1: f.f1 * voz.escalaFormante,
      f2: f.f2 * voz.escalaFormante,
      f3: f.f3 * voz.escalaFormante,
      b1: f.b1 ?? BANDAS_PADRAO.b1,
      b2: f.b2 ?? BANDAS_PADRAO.b2,
      b3: f.b3 ?? BANDAS_PADRAO.b3,
      voz: f.voz ?? 1,
      nasal: f.nasal ?? 0,
      lugar: f.lugar ?? null,
      ganho: f.ganho ?? 1,
      dur,
      tonica: seg.tonica,
    });
  }

  aplicarEntonacao(alvos, opcoes.f0Base, entonacao);
  return alvos;
}

/**
 * Curva de F0 (entonação). Sem isso a fala soa monótona.
 * Estratégia: declinação global + realce nas tônicas + contorno final
 * que sobe em pergunta e cai em afirmação.
 */
function aplicarEntonacao(alvos, f0Base, forca) {
  const total = alvos.length;
  if (!total) return;

  // A frase termina em pergunta?
  const ultimo = alvos[total - 1];
  const pergunta = ultimo?.simbolo === "?";

  for (let i = 0; i < total; i++) {
    const a = alvos[i];
    const pos = i / Math.max(1, total - 1);

    // Declinação: a voz naturalmente baixa ao longo da frase.
    let f0 = f0Base * (1 - 0.16 * pos * forca);

    // Tônicas recebem um pico.
    if (a.tonica) f0 *= 1 + 0.10 * forca;

    // Contorno final.
    if (pos > 0.72) {
      const t = (pos - 0.72) / 0.28;
      if (pergunta) f0 *= 1 + 0.34 * t * forca;   // sobe
      else f0 *= 1 - 0.14 * t * forca;            // cai
    }
    a.f0 = f0;
  }
}

/**
 * Sintetiza uma cadeia IPA em áudio.
 *
 * @param {string} ipa
 * @param {object} opcoes
 * @returns {Audio}
 */
export function sintetizarIPA(ipa, opcoes = {}) {
  const taxa = opcoes.taxa ?? TAXA_PADRAO;
  const voz = opcoes.vozConfig;
  const velocidade = opcoes.velocidade ?? 1;
  const entonacao = opcoes.entonacao ?? 1;

  const segmentos = segmentarIPA(ipa);
  const alvos = planejar(segmentos, {
    velocidade, voz, entonacao, f0Base: opcoes.f0 ?? voz.f0,
  });
  if (!alvos.length) return new Audio(new Float32Array(0), taxa);

  const duracaoTotal = alvos.reduce((s, a) => s + a.dur, 0) / 1000;
  const n = Math.ceil(duracaoTotal * taxa) + Math.round(taxa * 0.05);
  const saida = new Float32Array(n);

  // Cadeia de filtros: 3 formantes em cascata + par nasal.
  const r1 = new Ressoador(taxa);
  const r2 = new Ressoador(taxa);
  const r3 = new Ressoador(taxa);
  const rNasal = new Ressoador(taxa);
  const aNasal = new AntiRessoador(taxa);
  // Formantes altos fixos dão naturalidade ao timbre.
  const r4 = new Ressoador(taxa).ajustar(3400 * voz.escalaFormante, 220);
  const r5 = new Ressoador(taxa).ajustar(4500 * voz.escalaFormante, 260);
  // Ressoador dedicado às fricativas (banda alta).
  const rFric = new Ressoador(taxa);

  const glote = new FonteGlotal(taxa);
  glote.tenso = voz.tenso;
  const ruido = new FonteRuido();
  const suavizaRuido = new PassaBaixa(taxa, 6000);
  const dc = new PassaAlta(taxa, 65);
  // Radiação labial: um único polo alto. Antes havia dois passa-baixas em
  // série (2.8k + 3.6k), que somavam -12 dB/oitava e aniquilavam F2/F3 —
  // em [i], a energia em 2300 Hz caía para 1% e a vogal virava um [u].
  const radiacao = new PassaBaixa(taxa, 7000);

  let pos = 0;
  // Estado corrente dos formantes, para interpolar sem saltos.
  let cf1 = alvos[0].f1, cf2 = alvos[0].f2, cf3 = alvos[0].f3;

  for (let k = 0; k < alvos.length; k++) {
    const a = alvos[k];
    const prox = alvos[k + 1];
    const amostras = Math.max(1, Math.round((a.dur / 1000) * taxa));

    // Coarticulação: consoante empurra os formantes na direção do seu locus,
    // depois a vogal seguinte puxa de volta. É o que dá inteligibilidade.
    let destino1 = a.f1, destino2 = a.f2, destino3 = a.f3;
    if (a.lugar && prox && prox.tipo === "vogal") {
      const L = LOCUS[a.lugar];
      if (L) {
        destino2 = lerp(L.f2 * voz.escalaFormante, prox.f2, 0.35);
        destino3 = lerp(L.f3 * voz.escalaFormante, prox.f3, 0.35);
      }
    }

    const ehOclusiva = a.tipo === "oclusiva";
    const ehPausa = a.tipo === "pausa";
    const ehFric = a.tipo === "fricativa" || a.tipo === "africada";

    // Equalização por tipo. Sem isso a amplitude varia até 40x entre um
    // burst de oclusiva e uma vogal, e a normalização por pico deixa a
    // maior parte da fala praticamente inaudível.
    const ganhoTipo =
      a.tipo === "vogal" ? 1.0 :
      a.tipo === "nasal" ? 0.80 :
      a.tipo === "lateral" ? 0.78 :
      a.tipo === "glide" ? 0.72 :
      a.tipo === "tepe" ? 0.62 :
      ehFric ? 0.26 :
      ehOclusiva ? 0.34 : 1.0;

    for (let s = 0; s < amostras && pos < n; s++, pos++) {
      const t = s / amostras;

      // Transição suave entre o estado atual e o alvo.
      const vel = ehOclusiva ? 0.42 : 0.16;
      cf1 += (destino1 - cf1) * vel;
      cf2 += (destino2 - cf2) * vel;
      cf3 += (destino3 - cf3) * vel;

      r1.ajustar(cf1, a.b1);
      // Banda de F2/F3 estreita conforme sobem: um ressoador de banda
      // estreita tem ganho maior, o que compensa a menor energia da fonte
      // nos agudos. É o que mantém [i] e [ɛ] distinguíveis de [u] e [o].
      r2.ajustar(cf2, a.b2 * (cf2 > 1500 ? 0.34 : 1));
      r3.ajustar(cf3, a.b3 * (cf3 > 2400 ? 0.5 : 1));
      // Compensação de ganho proporcional à altura de F2.
      const ganhoF2 = 1 + Math.max(0, (cf2 - 1100) / 1000) * 3.4;
      const ganhoF3 = 1 + Math.max(0, (cf3 - 2200) / 1200) * 1.1;

      glote.ajustarF0(a.f0);

      /* ---- fonte ---- */
      let excitacao = 0;
      let amplitude = 1;

      if (ehPausa) {
        amplitude = 0;
      } else if (ehOclusiva) {
        // Silêncio de oclusão, depois o burst explosivo.
        const oclusao = 0.48;
        if (t < oclusao) {
          excitacao = a.voz ? glote.proxima() * 0.16 : 0;
        } else {
          const u = (t - oclusao) / (1 - oclusao);
          const burst = Math.exp(-u * 9);
          excitacao = ruido.proxima() * burst * 0.9
                    + (a.voz ? glote.proxima() * (1 - burst) * 0.7 : 0);
        }
      } else if (ehFric) {
        const turb = suavizaRuido.processar(ruido.proxima());
        // Africada: oclusão curta antes da fricção.
        const inicio = a.tipo === "africada" ? 0.35 : 0;
        if (t < inicio) {
          excitacao = 0;
        } else {
          excitacao = turb * (a.ganho ?? 0.5) * 1.6;
          if (a.voz) excitacao += glote.proxima() * 0.55;
        }
        rFric.ajustar(Math.min(a.f3, 5200), 1100);
        excitacao = excitacao * 0.35 + rFric.processar(excitacao) * 0.75;
      } else if (a.tipo === "tepe") {
        // Tepe [ɾ]: batida rápida — fecha e abre.
        const fechamento = Math.sin(Math.PI * t);
        excitacao = glote.proxima() * (1 - 0.85 * fechamento);
      } else {
        // Vogais, nasais, laterais e glides.
        excitacao = glote.proxima();
        if (a.tipo === "nasal" || a.tipo === "lateral") amplitude = 0.82;
        // Um sopro discreto evita o timbre "elétrico" puro.
        excitacao += ruido.proxima() * 0.012;
      }

      /* ---- filtro (trato vocal) ---- */
      // Estrutura paralela em vez de cascata pura: numa cascata, cada
      // ressoador atenua o seguinte e F2/F3 somem, deixando a voz abafada.
      // Em paralelo controlamos o peso de cada formante — e são justamente
      // F2/F3 que carregam a inteligibilidade das vogais e consoantes.
      // O ganho precisa entrar na EXCITAÇÃO de F2/F3, não na saída: aplicado
      // depois, ele é cancelado pela normalização por pico (F1 domina o pico
      // e a razão F2/F1 permanece a mesma).
      const y1 = r1.processar(excitacao);
      const y2 = r2.processar(excitacao * ganhoF2);
      const y3 = r3.processar(excitacao * ganhoF3);
      // Pesos por formante, com sinais alternados (padrão Klatt paralelo).
      // Amplitudes decrescentes reproduzem a inclinação natural do espectro
      // da voz; sem isso o resultado fica sibilante.
      let y = y1 * 0.72 - y2 * 0.90 + y3 * 0.46;
      y -= r4.processar(excitacao) * 0.14;
      y += r5.processar(excitacao) * 0.05;

      // Nasalidade: polo extra a ~270 Hz e zero a ~450 Hz.
      if (a.nasal) {
        rNasal.ajustar(270, 120);
        aNasal.ajustar(450, 180);
        const nasalizado = aNasal.processar(rNasal.processar(excitacao));
        y = y * 0.55 + nasalizado * 0.85;
      }

      /* ---- envelope ---- */
      // Rampa nas bordas para não estalar.
      const rampa = Math.min(1, Math.min(s, amostras - s) / (taxa * 0.006));
      y *= amplitude * suave(Math.max(0, Math.min(1, rampa)));

      // Fricativas mantêm o brilho; vozeados recebem a inclinação natural.
      if (!ehFric) y = radiacao.processar(y) * 1.5;
      saida[pos] += dc.processar(y) * 0.34 * ganhoTipo;
    }
  }

  normalizar(saida);
  return new Audio(saida, taxa);
}

/**
 * Normaliza usando percentil (não o pico absoluto) e comprime a dinâmica.
 *
 * Normalizar pelo pico é frágil: um único burst de oclusiva define o ganho de
 * toda a frase e o resto fica inaudível. O percentil 99 ignora esses
 * transientes, e a compressão aproxima trechos fortes e fracos — é o que
 * mantém a fala com volume uniforme.
 */
function normalizar(buf, alvo = 0.85) {
  const n = buf.length;
  if (!n) return;

  // Percentil 99 por amostragem (evita ordenar milhões de amostras).
  const passo = Math.max(1, Math.floor(n / 4096));
  const amostras = [];
  for (let i = 0; i < n; i += passo) amostras.push(Math.abs(buf[i]));
  amostras.sort((a, b) => a - b);
  const p99 = amostras[Math.floor(amostras.length * 0.99)] || 0;
  if (p99 < 1e-6) return;

  const g = alvo / p99;
  for (let i = 0; i < n; i++) {
    const v = buf[i] * g;
    // Compressão suave: realça trechos fracos preservando os fortes.
    const sinal = v < 0 ? -1 : 1;
    const mag = Math.abs(v);
    const comprimido = mag <= 1 ? Math.pow(mag, 0.78) : 1 + Math.tanh(mag - 1) * 0.1;
    buf[i] = sinal * Math.tanh(comprimido * 0.95) * 0.92;
  }
}

/**
 * Motor de síntese em código puro.
 *
 *   import { Sintetizador } from "@pedrobef/vozz/sintetizador";
 *   const tts = new Sintetizador();
 *   const audio = tts.falar("Olá, tudo bem?");
 *   await audio.salvar("ola.wav");
 */
export class Sintetizador {
  /**
   * @param {{voz?:string, velocidade?:number, f0?:number, entonacao?:number, taxa?:number}} [opcoes]
   */
  constructor(opcoes = {}) {
    this.opcoes = {
      voz: "clara",
      velocidade: 1,
      entonacao: 1,
      taxa: TAXA_PADRAO,
      ...opcoes,
    };
  }

  /** Lista as vozes deste motor. */
  static vozes() {
    return Object.entries(VOZES_CODIGO).map(([id, v]) => ({ id, ...v }));
  }

  /** Texto → IPA (mesmo G2P do motor neural). */
  static fonemizar(texto, opcoes) {
    return fonemizar(texto, opcoes);
  }

  /**
   * Sintetiza texto em português.
   * @param {string} texto
   * @param {{voz?:string, velocidade?:number, f0?:number, entonacao?:number, lexico?:object}} [opcoes]
   * @returns {Audio}
   */
  falar(texto, opcoes = {}) {
    const o = { ...this.opcoes, ...opcoes };
    const cfg = VOZES_CODIGO[o.voz] ?? VOZES_CODIGO.clara;

    const partes = [];
    for (const sentenca of dividirEmSentencas(String(texto ?? ""))) {
      const ipa = fonemizar(sentenca, { lexico: o.lexico });
      if (!ipa) continue;
      partes.push(sintetizarIPA(ipa, {
        vozConfig: cfg,
        velocidade: o.velocidade,
        entonacao: o.entonacao,
        f0: o.f0,
        taxa: o.taxa,
      }));
    }
    if (!partes.length) return new Audio(new Float32Array(0), o.taxa);
    return Audio.concatenar(partes, 0.11);
  }

  /** Sintetiza direto de uma cadeia IPA (pula o G2P). */
  falarIPA(ipa, opcoes = {}) {
    const o = { ...this.opcoes, ...opcoes };
    const cfg = VOZES_CODIGO[o.voz] ?? VOZES_CODIGO.clara;
    return sintetizarIPA(ipa, {
      vozConfig: cfg, velocidade: o.velocidade,
      entonacao: o.entonacao, f0: o.f0, taxa: o.taxa,
    });
  }
}

export default Sintetizador;
export { Audio } from "./audio.js";
export { fonemizar } from "./g2p/index.js";
