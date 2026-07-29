/**
 * Extenso de números em português do Brasil.
 * Usado pelo normalizador antes da fonemização.
 */

const UNIDADES = [
  "zero", "um", "dois", "três", "quatro",
  "cinco", "seis", "sete", "oito", "nove",
];

const DEZ_A_DEZENOVE = [
  "dez", "onze", "doze", "treze", "quatorze",
  "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];

const DEZENAS = [
  "", "", "vinte", "trinta", "quarenta",
  "cinquenta", "sessenta", "setenta", "oitenta", "noventa",
];

const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos",
  "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos",
];

const ESCALAS = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
  ["trilhão", "trilhões"],
  ["quatrilhão", "quatrilhões"],
];

const ORDINAIS_U = [
  "", "primeiro", "segundo", "terceiro", "quarto",
  "quinto", "sexto", "sétimo", "oitavo", "nono",
];
const ORDINAIS_D = [
  "", "décimo", "vigésimo", "trigésimo", "quadragésimo",
  "quinquagésimo", "sexagésimo", "septuagésimo", "octogésimo", "nonagésimo",
];
const ORDINAIS_C = [
  "", "centésimo", "ducentésimo", "trecentésimo", "quadringentésimo",
  "quingentésimo", "seiscentésimo", "septingentésimo", "octingentésimo", "noningentésimo",
];

/** Converte 0–999 por extenso. */
function ate999(n, feminino = false) {
  if (n === 0) return "";
  if (n === 100) return "cem";

  const partes = [];
  const c = Math.floor(n / 100);
  const resto = n % 100;

  if (c > 0) {
    let centena = CENTENAS[c];
    if (feminino && c >= 2) centena = centena.replace(/tos$/, "tas");
    partes.push(centena);
  }

  if (resto > 0) {
    if (resto < 10) {
      partes.push(feminino ? femininizar(UNIDADES[resto]) : UNIDADES[resto]);
    } else if (resto < 20) {
      partes.push(DEZ_A_DEZENOVE[resto - 10]);
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      if (u === 0) partes.push(DEZENAS[d]);
      else partes.push(`${DEZENAS[d]} e ${feminino ? femininizar(UNIDADES[u]) : UNIDADES[u]}`);
    }
  }

  return partes.join(" e ");
}

function femininizar(palavra) {
  if (palavra === "um") return "uma";
  if (palavra === "dois") return "duas";
  return palavra;
}

/**
 * Número inteiro por extenso.
 * @param {number|bigint|string} valor
 * @param {{feminino?: boolean}} [opts]
 */
export function inteiroPorExtenso(valor, opts = {}) {
  const { feminino = false } = opts;
  let n = typeof valor === "string" ? BigInt(valor.replace(/\D/g, "") || "0") : BigInt(Math.trunc(Number(valor)));

  let negativo = false;
  if (n < 0n) {
    negativo = true;
    n = -n;
  }
  if (n === 0n) return negativo ? "menos zero" : "zero";

  // Quebra em grupos de 3 dígitos.
  const grupos = [];
  while (n > 0n) {
    grupos.push(Number(n % 1000n));
    n /= 1000n;
  }
  if (grupos.length > ESCALAS.length) {
    // Muito grande: soletra dígito a dígito.
    return soletrarDigitos(String(valor));
  }

  const trechos = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (g === 0) continue;

    if (i === 1) {
      // "mil" nunca leva "um" na frente.
      trechos.push(g === 1 ? "mil" : `${ate999(g, feminino)} mil`);
    } else if (i === 0) {
      trechos.push(ate999(g, feminino));
    } else {
      const [sing, plur] = ESCALAS[i];
      trechos.push(`${ate999(g, false)} ${g === 1 ? sing : plur}`);
    }
  }

  let texto = juntarTrechos(trechos, grupos);
  if (negativo) texto = `menos ${texto}`;
  return texto;
}

/** Junta os trechos usando "e" quando a norma pede. */
function juntarTrechos(trechos, grupos) {
  if (trechos.length === 1) return trechos[0];
  const ultimo = grupos[0];
  const out = trechos.slice(0, -1).join(", ");
  // "e" antes do último grupo se < 100 ou múltiplo redondo de 100.
  if (ultimo > 0 && (ultimo < 100 || ultimo % 100 === 0)) {
    return `${out} e ${trechos[trechos.length - 1]}`;
  }
  return `${out}, ${trechos[trechos.length - 1]}`;
}

/** Decimais: 3,14 -> "três vírgula catorze" (com unidade opcional). */
export function decimalPorExtenso(inteiro, fracao, opts = {}) {
  const parteInt = inteiroPorExtenso(inteiro, opts);
  if (!fracao) return parteInt;
  const limpa = fracao.replace(/0+$/, "") === "" ? "0" : fracao;
  // Zeros à esquerda precisam ser ditos.
  const zerosIniciais = /^0+/.exec(limpa)?.[0]?.length ?? 0;
  const resto = limpa.slice(zerosIniciais);
  const ditos = [];
  for (let i = 0; i < zerosIniciais; i++) ditos.push("zero");
  if (resto) ditos.push(inteiroPorExtenso(resto, opts));
  return `${parteInt} vírgula ${ditos.join(" ")}`;
}

/** Ordinais: 1 -> "primeiro", 42 -> "quadragésimo segundo". */
export function ordinalPorExtenso(n, opts = {}) {
  const { feminino = false } = opts;
  n = Math.trunc(Number(n));
  if (n <= 0 || n > 999) return inteiroPorExtenso(n, opts);

  const partes = [];
  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;
  if (c) partes.push(ORDINAIS_C[c]);
  if (d) partes.push(ORDINAIS_D[d]);
  if (u) partes.push(ORDINAIS_U[u]);

  let texto = partes.join(" ");
  if (feminino) texto = texto.replace(/o\b/g, "a");
  return texto;
}

/** Soletra dígito a dígito (telefones, códigos). */
export function soletrarDigitos(str) {
  return String(str)
    .split("")
    .map((c) => (/\d/.test(c) ? UNIDADES[Number(c)] : c === "-" ? "" : c))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ano: 1998 -> "mil novecentos e noventa e oito". */
export function anoPorExtenso(n) {
  return inteiroPorExtenso(n);
}

export const _tabelas = { UNIDADES, DEZ_A_DEZENOVE, DEZENAS, CENTENAS, ESCALAS };
