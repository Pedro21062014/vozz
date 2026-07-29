/**
 * Tabela acústica dos fonemas do português brasileiro.
 *
 * Cada entrada descreve como produzir o som:
 *   f1,f2,f3 — frequências dos formantes (Hz); definem a identidade da vogal
 *   b1,b2,b3 — larguras de banda (Hz)
 *   tipo     — como excitar: vogal, oclusiva, fricativa, nasal, líquida...
 *   dur      — duração base em ms
 *   voz      — 1 = com vibração das pregas vocais, 0 = surdo
 *
 * Valores de F1/F2 para o pt-BR baseados na literatura de fonética acústica
 * (medições de vogais tônicas de falantes brasileiros). O ouvido identifica
 * a vogal essencialmente por F1 (altura) e F2 (anterioridade).
 */

/** @typedef {{f1:number,f2:number,f3:number,b1?:number,b2?:number,b3?:number,tipo:string,dur:number,voz?:number,nasal?:number,lugar?:string,ganho?:number}} Fonema */

/** @type {Record<string, Fonema>} */
export const FONEMAS = {
  /* ---------------- vogais orais ---------------- */
  //        F1    F2    F3
  a:  { f1: 770, f2: 1384, f3: 2600, tipo: "vogal", dur: 105 },
  ɐ:  { f1: 620, f2: 1400, f3: 2600, tipo: "vogal", dur: 80 },
  æ:  { f1: 645, f2: 1496, f3: 2600, tipo: "vogal", dur: 70 },
  ɛ:  { f1: 570, f2: 1932, f3: 2650, tipo: "vogal", dur: 100 },
  e:  { f1: 434, f2: 2470, f3: 2700, tipo: "vogal", dur: 100 },
  i:  { f1: 283, f2: 2662, f3: 2900, tipo: "vogal", dur: 95 },
  ɪ:  { f1: 350, f2: 2150, f3: 2800, tipo: "vogal", dur: 60 },
  ɔ:  { f1: 582, f2: 963,  f3: 2550, tipo: "vogal", dur: 100 },
  o:  { f1: 430, f2: 800,  f3: 2550, tipo: "vogal", dur: 100 },
  u:  { f1: 262, f2: 693,  f3: 2450, tipo: "vogal", dur: 95 },
  ʊ:  { f1: 399, f2: 801,  f3: 2500, tipo: "vogal", dur: 60 },
  ə:  { f1: 500, f2: 1500, f3: 2500, tipo: "vogal", dur: 55 },
  y:  { f1: 342, f2: 2900, f3: 2800, tipo: "vogal", dur: 60 },

  /* ---------------- vogais nasais ---------------- */
  // A nasalidade vem do par polo/zero em `nasal`, não de formantes diferentes.
  "ɐ̃": { f1: 620, f2: 1300, f3: 2600, tipo: "vogal", dur: 115, nasal: 1 },
  "ẽ": { f1: 430, f2: 2000, f3: 2700, tipo: "vogal", dur: 110, nasal: 1 },
  "ĩ": { f1: 320, f2: 2200, f3: 2850, tipo: "vogal", dur: 105, nasal: 1 },
  "õ": { f1: 440, f2: 850,  f3: 2550, tipo: "vogal", dur: 110, nasal: 1 },
  "ũ": { f1: 330, f2: 750,  f3: 2450, tipo: "vogal", dur: 105, nasal: 1 },
  "ɪ̃": { f1: 360, f2: 2100, f3: 2800, tipo: "vogal", dur: 65, nasal: 1 },
  "ʊ̃": { f1: 390, f2: 880,  f3: 2500, tipo: "vogal", dur: 65, nasal: 1 },

  /* ---------------- oclusivas ---------------- */
  // "lugar" define os formantes do burst e a transição para a vogal seguinte.
  p: { f1: 300, f2: 1100, f3: 2200, tipo: "oclusiva", dur: 75, voz: 0, lugar: "labial" },
  b: { f1: 250, f2: 1100, f3: 2200, tipo: "oclusiva", dur: 65, voz: 1, lugar: "labial" },
  t: { f1: 300, f2: 1800, f3: 2600, tipo: "oclusiva", dur: 75, voz: 0, lugar: "alveolar" },
  d: { f1: 250, f2: 1750, f3: 2600, tipo: "oclusiva", dur: 65, voz: 1, lugar: "alveolar" },
  k: { f1: 300, f2: 2000, f3: 2600, tipo: "oclusiva", dur: 80, voz: 0, lugar: "velar" },
  ɡ: { f1: 250, f2: 1900, f3: 2500, tipo: "oclusiva", dur: 68, voz: 1, lugar: "velar" },

  /* ---------------- africadas ---------------- */
  "tʃ": { f1: 300, f2: 1900, f3: 2700, tipo: "africada", dur: 105, voz: 0 },
  "dʒ": { f1: 260, f2: 1800, f3: 2600, tipo: "africada", dur: 95, voz: 1 },

  /* ---------------- fricativas ---------------- */
  f: { f1: 400, f2: 1300, f3: 2400, tipo: "fricativa", dur: 95, voz: 0, ganho: 0.30 },
  v: { f1: 350, f2: 1300, f3: 2400, tipo: "fricativa", dur: 80, voz: 1, ganho: 0.25 },
  s: { f1: 400, f2: 1800, f3: 6500, tipo: "fricativa", dur: 105, voz: 0, ganho: 0.55 },
  z: { f1: 350, f2: 1700, f3: 5500, tipo: "fricativa", dur: 90, voz: 1, ganho: 0.40 },
  "ʃ": { f1: 400, f2: 1900, f3: 3200, tipo: "fricativa", dur: 110, voz: 0, ganho: 0.60 },
  "ʒ": { f1: 350, f2: 1800, f3: 3000, tipo: "fricativa", dur: 95, voz: 1, ganho: 0.45 },
  x: { f1: 450, f2: 1200, f3: 2300, tipo: "fricativa", dur: 95, voz: 0, ganho: 0.32 },
  h: { f1: 500, f2: 1500, f3: 2500, tipo: "fricativa", dur: 70, voz: 0, ganho: 0.20 },

  /* ---------------- nasais ---------------- */
  m: { f1: 280, f2: 1100, f3: 2200, tipo: "nasal", dur: 80, voz: 1, nasal: 1, lugar: "labial" },
  n: { f1: 280, f2: 1600, f3: 2600, tipo: "nasal", dur: 78, voz: 1, nasal: 1, lugar: "alveolar" },
  "ɲ": { f1: 280, f2: 2000, f3: 2800, tipo: "nasal", dur: 90, voz: 1, nasal: 1, lugar: "palatal" },
  "ŋ": { f1: 280, f2: 1400, f3: 2400, tipo: "nasal", dur: 70, voz: 1, nasal: 1, lugar: "velar" },

  /* ---------------- líquidas ---------------- */
  l: { f1: 380, f2: 1200, f3: 2700, tipo: "lateral", dur: 70, voz: 1 },
  "ʎ": { f1: 320, f2: 1900, f3: 2800, tipo: "lateral", dur: 85, voz: 1 },
  "ɾ": { f1: 400, f2: 1500, f3: 2600, tipo: "tepe", dur: 32, voz: 1 },
  r: { f1: 400, f2: 1400, f3: 2500, tipo: "tepe", dur: 40, voz: 1 },
  "ʁ": { f1: 450, f2: 1150, f3: 2300, tipo: "fricativa", dur: 90, voz: 1, ganho: 0.25 },

  /* ---------------- glides ---------------- */
  j: { f1: 280, f2: 2300, f3: 2900, tipo: "glide", dur: 50, voz: 1 },
  w: { f1: 300, f2: 700,  f3: 2300, tipo: "glide", dur: 50, voz: 1 },

  /* ---------------- pausas ---------------- */
  " ": { f1: 500, f2: 1500, f3: 2500, tipo: "pausa", dur: 38 },
  ",": { f1: 500, f2: 1500, f3: 2500, tipo: "pausa", dur: 130 },
  ";": { f1: 500, f2: 1500, f3: 2500, tipo: "pausa", dur: 150 },
  ":": { f1: 500, f2: 1500, f3: 2500, tipo: "pausa", dur: 150 },
  ".": { f1: 500, f2: 1500, f3: 2500, tipo: "pausa", dur: 240 },
  "!": { f1: 500, f2: 1500, f3: 2500, tipo: "pausa", dur: 240 },
  "?": { f1: 500, f2: 1500, f3: 2500, tipo: "pausa", dur: 240 },
  "…": { f1: 500, f2: 1500, f3: 2500, tipo: "pausa", dur: 280 },
  "—": { f1: 500, f2: 1500, f3: 2500, tipo: "pausa", dur: 150 },
};

/** Larguras de banda padrão por tipo (Hz). */
export const BANDAS_PADRAO = { b1: 80, b2: 110, b3: 170 };

/** Locus de F2 por lugar de articulação — origem das transições formânticas. */
export const LOCUS = {
  labial:   { f2: 800,  f3: 2200 },
  alveolar: { f2: 1750, f3: 2600 },
  palatal:  { f2: 2100, f3: 2800 },
  velar:    { f2: 1900, f3: 2400 },
};

/**
 * Procura um fonema na tabela, tolerando símbolos compostos.
 * @param {string} simbolo
 * @returns {Fonema|null}
 */
export function buscarFonema(simbolo) {
  if (FONEMAS[simbolo]) return FONEMAS[simbolo];
  // Tenta sem o til combinante.
  const semTil = simbolo.normalize("NFD").replace(/\u0303/g, "");
  if (FONEMAS[semTil]) return { ...FONEMAS[semTil], nasal: 1 };
  return null;
}

/**
 * Divide uma cadeia IPA nos símbolos da tabela (maior correspondência primeiro).
 * @param {string} ipa
 * @returns {{simbolo:string, tonica:boolean, secundaria:boolean}[]}
 */
export function segmentarIPA(ipa) {
  const saida = [];
  const texto = ipa.normalize("NFD");
  let tonica = false;
  let secundaria = false;
  let i = 0;

  while (i < texto.length) {
    const c = texto[i];

    if (c === "ˈ") { tonica = true; i++; continue; }
    if (c === "ˌ") { secundaria = true; i++; continue; }
    if (c === "ː") { // alongamento aplica-se ao anterior
      if (saida.length) saida[saida.length - 1].longa = true;
      i++; continue;
    }

    // Tenta 3, 2 e 1 caractere (para "tʃ", "dʒ", vogal + til...).
    let achou = null;
    for (const n of [3, 2, 1]) {
      const trecho = texto.slice(i, i + n);
      if (!trecho) continue;
      const composto = trecho.normalize("NFC");
      if (FONEMAS[trecho] || FONEMAS[composto]) {
        achou = { simbolo: FONEMAS[trecho] ? trecho : composto, n };
        break;
      }
      // Vogal seguida de til combinante.
      if (n === 2 && texto[i + 1] === "\u0303" && FONEMAS[trecho.normalize("NFC")]) {
        achou = { simbolo: trecho.normalize("NFC"), n: 2 };
        break;
      }
    }

    if (achou) {
      saida.push({ simbolo: achou.simbolo, tonica, secundaria, longa: false });
      tonica = false;
      secundaria = false;
      i += achou.n;
    } else {
      i++; // símbolo desconhecido: ignora
    }
  }
  return saida;
}
