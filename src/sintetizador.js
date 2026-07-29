/**
 * vozz/sintetizador — TTS por síntese de formantes, 100% em código.
 *
 * Sem rede neural, sem download de pesos, sem dependências. O áudio é
 * calculado amostra a amostra por um modelo fonte-filtro:
 *
 *   pregas vocais / turbulência  ->  trato vocal (formantes)  ->  radiação
 *
 * Roda em qualquer runtime JS — navegador, Node, Deno, Bun, Cloudflare
 * Workers — porque é aritmética pura sobre Float32Array.
 */

import { PassaBaixa, PassaAlta, Biquad } from "./dsp/filtros.js";
import { FonteGlotal, FonteRuido } from "./dsp/fontes.js";
import { TratoVocal, TratoFricativo } from "./dsp/trato.js";
import { buscarFonema, segmentarIPA, BANDAS_PADRAO, LOCUS } from "./dsp/fonemas.js";
import { fonemizar } from "./g2p/index.js";
import { Audio, TAXA_PADRAO } from "./audio.js";
import { dividirEmSentencas } from "./splitter.js";

/**
 * Vozes do motor em código.
 *
 * Aqui a voz não vem de um modelo treinado: é definida por parâmetros
 * físicos. `f0` é a altura da laringe; `escalaFormante` corresponde ao
 * comprimento do trato vocal (tratos mais curtos produzem formantes mais
 * altos, que é a principal diferença acústica entre vozes).
 */
export const VOZES_CODIGO = Object.freeze({
  clara: {
    nome: "Clara", genero: "feminina",
    f0: 196, escalaFormante: 1.15, tenso: 0.66, sopro: 0.030,
    descricao: "Voz feminina clara. Boa para leitura e assistentes.",
  },
  bruno: {
    nome: "Bruno", genero: "masculina",
    f0: 112, escalaFormante: 0.96, tenso: 0.70, sopro: 0.022,
    descricao: "Voz masculina neutra. Boa para conteúdo geral.",
  },
  grave: {
    nome: "Grave", genero: "masculina",
    f0: 88, escalaFormante: 0.90, tenso: 0.76, sopro: 0.018,
    descricao: "Voz masculina grave, para narração.",
  },
});

/**
 * Constantes acústicas do motor.
 *
 * Os valores não são arbitrários: foram encontrados por busca automática
 * (`npm run calibrar`), minimizando a distância entre o perfil acústico da
 * saída e o de fala humana medida. Ver scripts/calibrar.mjs.
 */
export const CAL = {
  ganhoFricativa: 0.28,
  ganhoOclusiva: 0.28,
  tiltCorte1: 2000,
  tiltCorte2: 4200,
  tiltPeso1: 1.2,
  tiltPeso2: 0.7,
  radiacao: 0.74,
  realceF2Db: 6,
  shelfAgudoDb: -9,
};

/** Durante a calibração, permite sobrescrever as constantes. */
function cal() {
  return (typeof globalThis !== "undefined" && globalThis.__VOZZ_CAL)
    ? { ...CAL, ...globalThis.__VOZZ_CAL }
    : CAL;
}

const lerp = (a, b, t) => a + (b - a) * t;
const limitar = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ *
 * 1. Planejamento: fonemas -> alvos acústicos com duração e F0
 * ------------------------------------------------------------------ */

/**
 * Duração de cada segmento, considerando efeitos prosódicos reais.
 *
 * Três regras de fala natural que fazem diferença perceptual:
 *  - sílaba tônica alonga;
 *  - a última sílaba antes de uma pausa alonga bastante (final lengthening);
 *  - vogal átona em fala contínua encurta e se aproxima do schwa.
 */
function calcularDuracao(f, seg, ctx) {
  let dur = f.dur;
  if (seg.tonica) dur *= 1.32;
  else if (seg.secundaria) dur *= 1.12;
  else if (f.tipo === "vogal") dur *= 0.88;
  if (seg.longa) dur *= 1.45;
  if (ctx.antesDePausa && f.tipo === "vogal") dur *= 1.35;
  if (ctx.finalDeFrase && f.tipo === "vogal") dur *= 1.18;
  return dur / ctx.velocidade;
}

/**
 * Monta a lista de alvos acústicos a partir dos segmentos fonéticos.
 */
function planejar(segmentos, opcoes) {
  const { velocidade, voz } = opcoes;
  const alvos = [];
  const esc = voz.escalaFormante;

  for (let i = 0; i < segmentos.length; i++) {
    const seg = segmentos[i];
    const f = buscarFonema(seg.simbolo);
    if (!f) continue;

    const prox = segmentos[i + 1] ? buscarFonema(segmentos[i + 1].simbolo) : null;
    const antesDePausa = prox?.tipo === "pausa" || i === segmentos.length - 1;

    const dur = calcularDuracao(f, seg, {
      velocidade, antesDePausa, finalDeFrase: i >= segmentos.length - 2,
    });

    // Escala dos formantes conforme o trato vocal da voz. F4/F5 são fixos
    // por fonema mas escalam junto: eles carregam a "assinatura" do timbre.
    alvos.push({
      simbolo: seg.simbolo,
      tipo: f.tipo,
      freqs: [
        f.f1 * esc, f.f2 * esc, f.f3 * esc,
        (f.f4 ?? 3500) * esc, (f.f5 ?? 4600) * esc,
      ],
      bandas: [
        f.b1 ?? BANDAS_PADRAO.b1,
        f.b2 ?? BANDAS_PADRAO.b2,
        f.b3 ?? BANDAS_PADRAO.b3,
        250, 320,
      ],
      voz: f.voz ?? 1,
      nasal: f.nasal ?? 0,
      lugar: f.lugar ?? null,
      ganhoFric: f.ganho ?? 0.5,
      dur,
      tonica: seg.tonica,
      secundaria: seg.secundaria,
    });
  }
  return alvos;
}

/**
 * Curva de entonação (F0 ao longo do tempo).
 *
 * Fala monótona é o que mais denuncia síntese. Modelamos três componentes
 * que a fonética descreve como universais:
 *   - declinação: F0 cai lentamente ao longo do enunciado;
 *   - acentos de altura: cada tônica recebe um pico;
 *   - contorno final: sobe em pergunta, cai em afirmação.
 */
function curvaF0(alvos, f0Base, forca) {
  const n = alvos.length;
  if (!n) return;

  const ultimoSimbolo = alvos[n - 1]?.simbolo;
  const pergunta = ultimoSimbolo === "?";
  const exclamacao = ultimoSimbolo === "!";

  // Posição temporal real (em vez do índice) para a curva não depender de
  // quantos fonemas curtos existem no meio.
  const total = alvos.reduce((s, a) => s + a.dur, 0) || 1;
  let acumulado = 0;

  for (let i = 0; i < n; i++) {
    const a = alvos[i];
    const pos = acumulado / total;
    acumulado += a.dur;

    // Declinação global.
    let f0 = f0Base * (1 - 0.20 * pos * forca);

    // Acento de altura na tônica, com subida e descida ao redor.
    if (a.tonica) f0 *= 1 + 0.13 * forca;
    else if (a.secundaria) f0 *= 1 + 0.05 * forca;

    // Contorno final.
    if (pos > 0.68) {
      const t = (pos - 0.68) / 0.32;
      if (pergunta) f0 *= 1 + 0.40 * t * forca;
      else if (exclamacao) f0 *= 1 + 0.10 * t * forca - 0.06 * t;
      else f0 *= 1 - 0.20 * t * forca;
    }

    // Micro-prosódia: vogais após consoante surda começam levemente mais
    // agudas. É sutil, mas contribui para não soar mecânico.
    if (i > 0 && alvos[i - 1].voz === 0 && a.tipo === "vogal") f0 *= 1.012;

    a.f0 = limitar(f0, 55, 420);
  }
}

/* ------------------------------------------------------------------ *
 * 2. Espectro das fricativas
 * ------------------------------------------------------------------ */

/**
 * Cada fricativa tem uma assinatura espectral própria. Modelamos por regiões
 * de energia, não por formantes de tubo — é o que distingue [s] de [ʃ].
 */
function polosFricativa(simbolo, esc) {
  const t = {
    // [s]: energia alta e estreita acima de 4.5 kHz.
    s:  [{ f: 5200, bw: 1100, a: 1.0 }, { f: 7000, bw: 1400, a: 0.55 }, { f: 3600, bw: 700, a: 0.12 }],
    z:  [{ f: 4900, bw: 1150, a: 0.9 }, { f: 6600, bw: 1500, a: 0.42 }, { f: 3400, bw: 700, a: 0.14 }],
    // [ʃ]: pico bem mais grave (~2.2 kHz) e queda acima de 4 kHz. É esse
    // contraste que separa "sapato" de "chapéu" — medindo o centroide, as
    // duas fricativas estavam a apenas 217 Hz uma da outra.
    "ʃ": [{ f: 2200, bw: 550, a: 1.0 }, { f: 3200, bw: 900, a: 0.5 }, { f: 4600, bw: 1300, a: 0.10 }],
    "ʒ": [{ f: 2050, bw: 600, a: 0.95 }, { f: 3000, bw: 950, a: 0.42 }, { f: 4300, bw: 1300, a: 0.09 }],
    // [f]/[v]: espectro difuso e plano, sem pico marcado — é a ausência de
    // concentração que os caracteriza. Energia mais baixa que as sibilantes.
    f:  [{ f: 1600, bw: 2400, a: 0.55 }, { f: 4000, bw: 3000, a: 0.30 }, { f: 6200, bw: 2600, a: 0.10 }],
    v:  [{ f: 1500, bw: 2400, a: 0.50 }, { f: 3800, bw: 3000, a: 0.24 }, { f: 5800, bw: 2600, a: 0.08 }],
    x:  [{ f: 1300, bw: 1000, a: 0.7 }, { f: 2300, bw: 1400, a: 0.5 }, { f: 3600, bw: 1800, a: 0.22 }],
    "ʁ": [{ f: 1250, bw: 950, a: 0.65 }, { f: 2200, bw: 1300, a: 0.45 }, { f: 3400, bw: 1700, a: 0.2 }],
    h:  [{ f: 700, bw: 900, a: 0.5 }, { f: 1800, bw: 1500, a: 0.4 }, { f: 3200, bw: 2000, a: 0.25 }],
  }[simbolo];
  if (!t) return [{ f: 2000 * esc, bw: 1200, a: 0.6 }, { f: 4000 * esc, bw: 1600, a: 0.4 }, null];
  // Fricativas escalam menos que vogais: a constrição é mais anterior e
  // depende menos do comprimento total do trato.
  const e = 1 + (esc - 1) * 0.45;
  return t.map((p) => (p ? { ...p, f: p.f * e } : null));
}

/** Espectro do burst de uma oclusiva, por lugar de articulação. */
function polosBurst(lugar, esc) {
  const t = {
    labial:   [{ f: 900, bw: 900, a: 0.65 }, { f: 1800, bw: 1400, a: 0.30 }, null],
    alveolar: [{ f: 3800, bw: 1100, a: 1.0 }, { f: 5200, bw: 1500, a: 0.55 }, { f: 2200, bw: 900, a: 0.2 }],
    velar:    [{ f: 1900, bw: 700, a: 1.0 }, { f: 2600, bw: 1000, a: 0.55 }, { f: 3800, bw: 1600, a: 0.2 }],
  }[lugar ?? "alveolar"];
  const e = 1 + (esc - 1) * 0.5;
  return t.map((p) => (p ? { ...p, f: p.f * e } : null));
}

/* ------------------------------------------------------------------ *
 * 3. Síntese
 * ------------------------------------------------------------------ */

/**
 * Sintetiza uma cadeia IPA.
 * @param {string} ipa
 * @param {object} opcoes
 * @returns {Audio}
 */
export function sintetizarIPA(ipa, opcoes = {}) {
  const taxa = opcoes.taxa ?? TAXA_PADRAO;
  const voz = opcoes.vozConfig ?? VOZES_CODIGO.clara;
  const velocidade = opcoes.velocidade ?? 1;
  const entonacao = opcoes.entonacao ?? 1;

  const segmentos = segmentarIPA(ipa);
  const alvos = planejar(segmentos, { velocidade, voz });
  if (!alvos.length) return new Audio(new Float32Array(0), taxa);

  curvaF0(alvos, opcoes.f0 ?? voz.f0, entonacao);

  const duracaoTotal = alvos.reduce((s, a) => s + a.dur, 0) / 1000;
  const n = Math.ceil(duracaoTotal * taxa) + Math.round(taxa * 0.04);
  const saida = new Float32Array(n);

  const trato = new TratoVocal(taxa);
  const fric = new TratoFricativo(taxa);
  const glote = new FonteGlotal(taxa);
  glote.tenso = voz.tenso;
  const ruido = new FonteRuido();
  const filtroSopro = new PassaBaixa(taxa, 4000);
  const dc = new PassaAlta(taxa, 70);

  // Radiação labial: a boca irradia proporcionalmente à derivada do fluxo,
  // o que equivale a +6 dB/oitava. Usado sozinho, deixa o sinal estridente
  // (57% da energia acima de 3 kHz na medição). Compensamos com um
  // passa-baixa que reproduz o tilt espectral da fonte glotal — o resultado
  // líquido fica próximo dos -8 dB/oitava da fala humana.
  const C = cal();
  let radAnterior = 0;
  const radiacao = (x) => { const y = x - C.radiacao * radAnterior; radAnterior = x; return y; };
  const tiltFonte = new PassaBaixa(taxa, C.tiltCorte1);
  const tiltFonte2 = new PassaBaixa(taxa, C.tiltCorte2);

  // Estado interpolado dos formantes (evita saltos entre fonemas).
  const cf = [...alvos[0].freqs];
  const cb = [...alvos[0].bandas];
  let cNasal = alvos[0].nasal;

  let pos = 0;

  for (let k = 0; k < alvos.length; k++) {
    const a = alvos[k];
    const prox = alvos[k + 1];
    const amostras = Math.max(1, Math.round((a.dur / 1000) * taxa));

    const ehVogal = a.tipo === "vogal";
    const ehOclusiva = a.tipo === "oclusiva";
    const ehAfricada = a.tipo === "africada";
    const ehFricativa = a.tipo === "fricativa";
    const ehPausa = a.tipo === "pausa";
    const ehNasal = a.tipo === "nasal";

    // Coarticulação: consoantes não têm formantes próprios estáveis; o que
    // o ouvido usa para identificá-las é a *transição* a partir do locus em
    // direção à vogal seguinte. Sem isso, consoantes viram ruído neutro.
    // Alvos de INÍCIO e FIM do segmento.
    //
    // Antes havia um alvo único: os formantes chegavam nele em ~50 ms e
    // congelavam pelo resto da vogal. Medindo "casa", F1/F2 ficavam em
    // 874/1564 Hz por 150 ms sem variar 1 Hz — e um formante estático soa
    // como zumbido, não como fala. Em fala real os formantes estão sempre
    // em movimento, puxados pelos sons vizinhos.
    const ant = alvos[k - 1];
    const inicio = [...a.freqs];
    const fim = [...a.freqs];

    if (ehVogal) {
      // Vogal: parte do locus da consoante anterior e caminha para o alvo,
      // depois já se inclina em direção ao próximo som. Essa curvatura é
      // exatamente a pista acústica que identifica a consoante.
      if (ant && ant.lugar) {
        const L = LOCUS[ant.lugar];
        if (L) {
          inicio[1] = lerp(L.f2 * voz.escalaFormante, a.freqs[1], 0.32);
          inicio[2] = lerp(L.f3 * voz.escalaFormante, a.freqs[2], 0.45);
        }
      } else if (ant && ant.tipo !== "pausa") {
        inicio[1] = lerp(ant.freqs[1], a.freqs[1], 0.45);
        inicio[2] = lerp(ant.freqs[2], a.freqs[2], 0.55);
      }
      if (prox && prox.lugar) {
        const L = LOCUS[prox.lugar];
        if (L) {
          fim[1] = lerp(a.freqs[1], L.f2 * voz.escalaFormante, 0.34);
          fim[2] = lerp(a.freqs[2], L.f3 * voz.escalaFormante, 0.30);
        }
      } else if (prox && prox.tipo !== "pausa") {
        fim[1] = lerp(a.freqs[1], prox.freqs[1], 0.30);
        fim[2] = lerp(a.freqs[2], prox.freqs[2], 0.34);
      }
    } else if ((ehOclusiva || ehNasal) && a.lugar) {
      const L = LOCUS[a.lugar];
      if (L) {
        inicio[1] = L.f2 * voz.escalaFormante;
        inicio[2] = L.f3 * voz.escalaFormante;
        const destinoF2 = prox ? prox.freqs[1] : a.freqs[1];
        const destinoF3 = prox ? prox.freqs[2] : a.freqs[2];
        fim[1] = lerp(L.f2 * voz.escalaFormante, destinoF2, 0.55);
        fim[2] = lerp(L.f3 * voz.escalaFormante, destinoF3, 0.45);
      }
    }

    // Alvo de nasalização com propagação: a vogal antes de uma nasal já
    // nasaliza parcialmente — fenômeno forte no português.
    let alvoNasal = a.nasal ? 1 : 0;
    if (ehVogal && prox?.tipo === "nasal") alvoNasal = Math.max(alvoNasal, 0.45);

    // Ganho por tipo: equaliza a percepção de volume entre classes de som.
    // Ganho por classe. Em fala natural as fricativas são cerca de 12 dB
    // mais fracas que as vogais; medindo o sintetizador, [s] e [a] saíam com
    // o mesmo RMS e as fricativas dominavam o espectro da frase inteira
    // (43% da energia acima de 3 kHz). Os valores abaixo reproduzem as
    // relações de intensidade medidas em fala humana.
    const ganhoTipo =
      ehVogal ? 1.0 :
      ehNasal ? 0.50 :
      a.tipo === "lateral" ? 0.58 :
      a.tipo === "glide" ? 0.55 :
      a.tipo === "tepe" ? 0.45 :
      ehAfricada ? C.ganhoFricativa * 1.15 :
      ehFricativa ? C.ganhoFricativa :
      ehOclusiva ? C.ganhoOclusiva : 0;

    // Velocidade de transição dos formantes: oclusivas movem rápido,
    // vogais deslizam devagar.
    // Suavização do movimento: a língua tem inércia, então o caminho entre
    // dois alvos é uma curva em S, não uma reta nem um degrau.
    const suavidade = ehOclusiva ? 0.55 : ehVogal ? 0.30 : 0.42;

    for (let s = 0; s < amostras && pos < n; s++, pos++) {
      const t = s / amostras;

      // Alvo instantâneo: percorre início -> fim ao longo do segmento.
      const cur = t < suavidade
        ? (t / suavidade) * 0.5
        : 0.5 + ((t - suavidade) / (1 - suavidade)) * 0.5;
      const sMov = cur * cur * (3 - 2 * cur);

      for (let i = 0; i < 5; i++) {
        const alvoAgora = inicio[i] + (fim[i] - inicio[i]) * sMov;
        // Filtro de 1ª ordem = inércia articulatória (sem saltos bruscos).
        cf[i] += (alvoAgora - cf[i]) * (ehOclusiva ? 0.35 : 0.22);
        cb[i] += ((a.bandas[i] ?? 200) - cb[i]) * 0.10;
      }
      cNasal += (alvoNasal - cNasal) * 0.06;

      trato.ajustar(cf, cb);
      trato.ajustarNasal(cNasal);
      glote.ajustarF0(a.f0);

      let amostra = 0;

      if (ehPausa) {
        amostra = 0;
      } else if (ehOclusiva) {
        // Oclusiva = silêncio (oclusão) + explosão (burst) + aspiração.
        const fimOclusao = 0.55;
        if (t < fimOclusao) {
          // Murmúrio grave se for sonora; silêncio se for surda.
          amostra = a.voz ? trato.processar(glote.proxima() * 0.10) : 0;
        } else {
          const u = (t - fimOclusao) / (1 - fimOclusao);
          const envBurst = Math.exp(-u * 7);
          fric.ajustar(polosBurst(a.lugar, voz.escalaFormante));
          const explosao = fric.processar(ruido.proxima()) * envBurst;
          // Vozeamento retomando após o burst (VOT).
          const vozeado = a.voz
            ? trato.processar(glote.proxima()) * (1 - envBurst) * 0.8
            : trato.processar(ruido.proxima() * 0.10) * (1 - envBurst) * envBurst * 2;
          // Burst mais forte: é a pista acústica que identifica a
          // oclusiva. Medindo "ka", a explosão saía com 4% da amplitude
          // da vogal e simplesmente não era ouvida.
          amostra = explosao * 3.2 + vozeado;
        }
      } else if (ehFricativa || ehAfricada) {
        const inicio = ehAfricada ? 0.32 : 0;
        if (t < inicio) {
          amostra = a.voz ? trato.processar(glote.proxima() * 0.08) : 0;
        } else {
          const u = ehAfricada ? (t - inicio) / (1 - inicio) : t;
          // Envelope suave evita o "clique" no início da fricção.
          const env = Math.min(1, u * 6) * Math.min(1, (1 - u) * 6 + 0.4);
          fric.ajustar(polosFricativa(a.simbolo, voz.escalaFormante));
          amostra = fric.processar(ruido.proxima()) * a.ganhoFric * env * 1.9;
          // Fricativa sonora soma vozeamento pelo trato.
          if (a.voz) amostra += trato.processar(glote.proxima()) * 0.42;
        }
      } else if (a.tipo === "tepe") {
        // Tepe: a língua bate rápido no alvéolo — amplitude cai e volta.
        const fechamento = Math.sin(Math.PI * t) ** 2;
        amostra = trato.processar(glote.proxima() * (1 - 0.92 * fechamento));
      } else {
        // Vogais, nasais, laterais e glides: fonte glotal pelo trato.
        let exc = glote.proxima();
        // Sopro: ruído fraco somado à fonte. É o que diferencia uma voz
        // humana de um oscilador — sem ele o timbre soa eletrônico.
        exc += filtroSopro.processar(ruido.proxima()) * voz.sopro;
        amostra = trato.processar(exc);
      }

      // Envelope de amplitude do segmento.
      //
      // Antes era só uma rampa de 4 ms nas bordas, o que deixava a vogal com
      // amplitude constante por 140 ms — um platô que o ouvido interpreta
      // como zumbido, não como sílaba. Vogais reais têm ataque, um pico
      // logo após o início e decaimento gradual.
      const bordaAmostras = Math.max(2, Math.round(taxa * 0.006));
      const rampa = Math.min(1, Math.min(s, amostras - 1 - s) / bordaAmostras);
      let env = rampa * rampa * (3 - 2 * rampa);

      if (ehVogal) {
        // Curva de sílaba: sobe rápido, pico em ~25% da duração, decai.
        const ataque = Math.min(1, t / 0.16);
        const decaimento = 1 - 0.42 * Math.max(0, (t - 0.30) / 0.70) ** 1.4;
        env *= (0.58 + 0.42 * ataque * ataque * (3 - 2 * ataque)) * decaimento;
      } else if (ehNasal || a.tipo === "lateral") {
        env *= 0.90 - 0.18 * t;
      }

      // Tilt aplicado apenas aos sons vozeados: fricativas precisam manter
      // o brilho, pois é ele que distingue [s] de [f].
      let y = radiacao(amostra);
      if (!ehFricativa && !ehAfricada && !ehOclusiva) {
        y = tiltFonte.processar(y) * C.tiltPeso1 + tiltFonte2.processar(y) * C.tiltPeso2;
      }
      saida[pos] += y * ganhoTipo * env;
    }
  }

  // Remove offset DC antes de normalizar.
  for (let i = 0; i < n; i++) saida[i] = dc.processar(saida[i]);

  // Modelagem espectral final. O modelo de formantes produz mais energia
  // acima de 4 kHz do que a fala humana e menos na faixa de F2/F3; estes
  // dois filtros corrigem o balanço sem tocar nas frequências dos formantes.
  const realceF2 = new Biquad().pico(taxa, 1800, 0.9, C.realceF2Db);
  const cortaAgudo = new Biquad().shelfAlto(taxa, 3800, C.shelfAgudoDb);
  for (let i = 0; i < n; i++) {
    saida[i] = cortaAgudo.processar(realceF2.processar(saida[i]));
  }

  normalizar(saida, taxa);
  return new Audio(saida, taxa);
}

/**
 * Normalização com compressão de dinâmica.
 *
 * Normalizar pelo pico absoluto é frágil: um único burst define o ganho de
 * toda a frase e o restante fica inaudível. Usamos o percentil 99 (ignora
 * transientes) e comprimimos a faixa dinâmica, que é o que um compressor de
 * estúdio faz em locução.
 */
function normalizar(buf, taxa, alvo = 0.86) {
  const n = buf.length;
  if (!n) return;

  const passo = Math.max(1, Math.floor(n / 8192));
  const amostras = [];
  for (let i = 0; i < n; i += passo) amostras.push(Math.abs(buf[i]));
  if (!amostras.length) return;
  amostras.sort((a, b) => a - b);
  const p99 = amostras[Math.min(amostras.length - 1, Math.floor(amostras.length * 0.99))];
  if (!p99 || p99 < 1e-7) return;

  const g = alvo / p99;
  for (let i = 0; i < n; i++) {
    const v = buf[i] * g;
    const sinal = v < 0 ? -1 : 1;
    const mag = Math.abs(v);
    // Expoente < 1 realça trechos fracos preservando os fortes.
    const comprimido = mag <= 1 ? Math.pow(mag, 0.82) : 1 + Math.tanh(mag - 1) * 0.12;
    buf[i] = sinal * Math.min(0.97, comprimido * 0.9);
  }
}

/* ------------------------------------------------------------------ *
 * 4. API pública
 * ------------------------------------------------------------------ */

/**
 * Motor de síntese por formantes.
 *
 *   import { Sintetizador } from "@pedrobef/vozz/sintetizador";
 *   const tts = new Sintetizador();
 *   tts.falar("Olá, tudo bem?").tocar();
 */
export class Sintetizador {
  constructor(opcoes = {}) {
    this.opcoes = {
      voz: "clara", velocidade: 1, entonacao: 1, taxa: TAXA_PADRAO, ...opcoes,
    };
  }

  static vozes() {
    return Object.entries(VOZES_CODIGO).map(([id, v]) => ({ id, ...v }));
  }

  static fonemizar(texto, opcoes) {
    return fonemizar(texto, opcoes);
  }

  /**
   * Sintetiza texto em português. Síncrono: não há I/O nem download.
   * @param {string} texto
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
        vozConfig: cfg, velocidade: o.velocidade,
        entonacao: o.entonacao, f0: o.f0, taxa: o.taxa,
      }));
    }
    if (!partes.length) return new Audio(new Float32Array(0), o.taxa);
    return Audio.concatenar(partes, 0.13);
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
