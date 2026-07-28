/**
 * Normalização de texto pt-BR: transforma números, datas, horas, moedas,
 * abreviações e símbolos em palavras antes da fonemização.
 */

import {
  inteiroPorExtenso,
  decimalPorExtenso,
  ordinalPorExtenso,
  soletrarDigitos,
  anoPorExtenso,
} from "./numbers.js";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const ABREVIACOES = new Map(Object.entries({
  "sr.": "senhor",
  "sr": "senhor",
  "sra.": "senhora",
  "sra": "senhora",
  "srta.": "senhorita",
  "dr.": "doutor",
  "dra.": "doutora",
  "prof.": "professor",
  "profa.": "professora",
  "eng.": "engenheiro",
  "av.": "avenida",
  "r.": "rua",
  "pç.": "praça",
  "ed.": "edifício",
  "apto.": "apartamento",
  "ap.": "apartamento",
  "pág.": "página",
  "pag.": "página",
  "págs.": "páginas",
  "fig.": "figura",
  "obs.": "observação",
  "ex.": "exemplo",
  "etc.": "etcétera",
  "etc": "etcétera",
  "cia.": "companhia",
  "ltda.": "limitada",
  "s.a.": "sociedade anônima",
  "núm.": "número",
  "nº": "número",
  "n°": "número",
  "no.": "número",
  "tel.": "telefone",
  "cel.": "celular",
  "kg": "quilogramas",
  "km": "quilômetros",
  "km/h": "quilômetros por hora",
  "cm": "centímetros",
  "mm": "milímetros",
  "ml": "mililitros",
  "mg": "miligramas",
  "gb": "gigabytes",
  "mb": "megabytes",
  "kb": "kilobytes",
  "tb": "terabytes",
}));

const SIMBOLOS = new Map(Object.entries({
  "%": " por cento ",
  "&": " e ",
  "@": " arroba ",
  "+": " mais ",
  "=": " igual a ",
  "€": " euros ",
  "£": " libras ",
  "©": " copyright ",
  "®": " marca registrada ",
  "°c": " graus celsius ",
  "°f": " graus fahrenheit ",
  "º": " graus ",
  "#": " cerquilha ",
  "/": " barra ",
  "\\": " barra invertida ",
  "*": " asterisco ",
  "_": " ",
  "~": " ",
  "^": " ",
  "|": " ",
}));

/** Siglas que se leem como palavra (não soletrar). */
const SIGLAS_PALAVRA = new Set([
  "onu", "otan", "fifa", "ibama", "inss", "cpf", "cep", "brics", "mercosul",
  "petrobras", "embraer", "unesco", "unicef", "senai", "sesc", "usp", "puc",
  "enem", "sus", "detran", "procon", "ipva", "fies", "prouni", "sisu",
]);

const LETRAS_FALADAS = {
  a: "á", b: "bê", c: "cê", d: "dê", e: "é", f: "éfe", g: "gê", h: "agá",
  i: "i", j: "jota", k: "cá", l: "éle", m: "ême", n: "êne", o: "ó", p: "pê",
  q: "quê", r: "érre", s: "ésse", t: "tê", u: "u", v: "vê", w: "dábliu",
  x: "xis", y: "ípsilon", z: "zê",
};

/** Soletra uma sigla letra a letra. */
function soletrarSigla(sigla) {
  return sigla
    .toLowerCase()
    .split("")
    .map((c) => LETRAS_FALADAS[c] ?? c)
    .join(" ");
}

/**
 * Normaliza o texto de entrada para fonemização.
 * @param {string} texto
 * @param {{expandirNumeros?: boolean, expandirSiglas?: boolean}} [opts]
 * @returns {string}
 */
export function normalizar(texto, opts = {}) {
  const { expandirNumeros = true, expandirSiglas = true } = opts;
  let t = String(texto ?? "");

  // Unicode e espaços.
  t = t.normalize("NFC");
  t = t.replace(/[\u2018\u2019\u02BC]/g, "'");
  t = t.replace(/[\u201C\u201D\u00AB\u00BB]/g, '"');
  t = t.replace(/[\u2013\u2014\u2212]/g, "—");
  t = t.replace(/\u2026/g, "...");
  t = t.replace(/[\t\f\v\u00A0\u200B]/g, " ");

  // URLs e e-mails -> leitura amigável.
  t = t.replace(/https?:\/\/(?:www\.)?([^\s/]+)\S*/gi, (_, dom) => ` ${dom.replace(/\./g, " ponto ")} `);
  t = t.replace(/\b([\w.+-]+)@([\w.-]+)\b/g, (_, u, d) =>
    ` ${u.replace(/\./g, " ponto ")} arroba ${d.replace(/\./g, " ponto ")} `);

  // Horas: 14h30, 14:30, 9h.
  t = t.replace(/\b(\d{1,2})\s*[h:]\s*(\d{2})\b(?!\s*[:h])/gi, (_, h, m) => {
    const hh = Number(h), mm = Number(m);
    const hora = `${inteiroPorExtenso(hh, { feminino: true })} ${hh === 1 ? "hora" : "horas"}`;
    if (mm === 0) return ` ${hora} `;
    return ` ${hora} e ${inteiroPorExtenso(mm)} ${mm === 1 ? "minuto" : "minutos"} `;
  });
  t = t.replace(/\b(\d{1,2})\s*h\b/gi, (_, h) => {
    const hh = Number(h);
    return ` ${inteiroPorExtenso(hh, { feminino: true })} ${hh === 1 ? "hora" : "horas"} `;
  });

  // Datas: 07/09/2025 ou 07-09-2025.
  t = t.replace(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/g, (m, d, mo, y) => {
    const dia = Number(d), mes = Number(mo);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return m;
    const diaTxt = dia === 1 ? "primeiro" : inteiroPorExtenso(dia);
    return ` ${diaTxt} de ${MESES[mes - 1]} de ${anoPorExtenso(y)} `;
  });

  // Moeda: R$ 1.234,56.
  t = t.replace(/R\$\s?([\d.]+)(?:,(\d{1,2}))?/gi, (_, int, cent) => {
    const i = int.replace(/\./g, "");
    const n = Number(i);
    let out = ` ${inteiroPorExtenso(i)} ${n === 1 ? "real" : "reais"}`;
    if (cent && Number(cent) > 0) {
      const c = Number(cent.padEnd(2, "0"));
      out += ` e ${inteiroPorExtenso(c)} ${c === 1 ? "centavo" : "centavos"}`;
    }
    return `${out} `;
  });
  t = t.replace(/US\$\s?([\d.]+)(?:,(\d{1,2}))?/gi, (_, int) =>
    ` ${inteiroPorExtenso(int.replace(/\./g, ""))} dólares `);

  // Percentual antes da regra geral de números.
  t = t.replace(/(\d+(?:,\d+)?)\s*%/g, (_, n) => {
    const [i, f] = n.split(",");
    return ` ${f ? decimalPorExtenso(i, f) : inteiroPorExtenso(i)} por cento `;
  });

  // Temperatura.
  t = t.replace(/(\d+)\s*°\s*C\b/gi, (_, n) => ` ${inteiroPorExtenso(n)} graus celsius `);

  // Ordinais: 1º, 2ª, 3o, 10ª.
  t = t.replace(/\b(\d{1,3})\s*([ºª°])/g, (_, n, marca) =>
    ` ${ordinalPorExtenso(n, { feminino: marca === "ª" })} `);

  // Telefones: (12) 99999-8888.
  t = t.replace(/\(?\b(\d{2})\)?\s?9?\d{4}-\d{4}\b/g, (m) => ` ${soletrarDigitos(m.replace(/[()]/g, ""))} `);

  if (expandirNumeros) {
    // Decimais com vírgula.
    t = t.replace(/\b(\d{1,3}(?:\.\d{3})+|\d+),(\d+)\b/g, (_, i, f) =>
      ` ${decimalPorExtenso(i.replace(/\./g, ""), f)} `);
    // Milhares com ponto.
    t = t.replace(/\b\d{1,3}(?:\.\d{3})+\b/g, (m) => ` ${inteiroPorExtenso(m.replace(/\./g, ""))} `);
    // Inteiros simples.
    t = t.replace(/\d+/g, (m) => ` ${inteiroPorExtenso(m)} `);
  }

  // Abreviações (palavra inteira, sem distinguir caixa).
  t = t.replace(/\b([a-zà-ÿ]{1,6}\.?)/gi, (m) => {
    const chave = m.toLowerCase();
    return ABREVIACOES.has(chave) ? ABREVIACOES.get(chave) : m;
  });

  // Siglas em CAIXA ALTA.
  if (expandirSiglas) {
    t = t.replace(/\b[A-ZÀ-Þ]{2,6}\b/g, (m) => {
      const baixa = m.toLowerCase();
      if (SIGLAS_PALAVRA.has(baixa)) return baixa;
      // Se tem vogal e parece pronunciável, mantém como palavra.
      if (/[AEIOUÀ-Þ]/.test(m) && m.length >= 4 && /^[A-ZÀ-Þ]*[AEIOU][A-ZÀ-Þ]*$/.test(m) === false) {
        return baixa;
      }
      return ` ${soletrarSigla(m)} `;
    });
  }

  // Símbolos restantes.
  for (const [sim, txt] of SIMBOLOS) {
    t = t.split(sim).join(txt);
  }

  // Limpeza final.
  t = t.replace(/ {2,}/g, " ").trim();
  return t;
}

export { MESES, ABREVIACOES, LETRAS_FALADAS, soletrarSigla };
