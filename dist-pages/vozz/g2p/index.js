/**
 * @pedrobef/vozz/g2p — Conversor grafema→fonema (G2P) para português do Brasil, em JS puro.
 *
 * Gera IPA na mesma convenção do espeak-ng `pt-br`, que é exatamente a convenção
 * com que o modelo neural foi treinado. Não usa WASM, não baixa dados e roda em
 * qualquer runtime JS (navegador, Node, Deno, Bun, Web Worker).
 *
 * Pipeline:
 *   normalizar → segmentar em unidades → silabificar → acentuar
 *   → mapear onset/núcleo/coda → sândi entre palavras → IPA
 */

import { normalizar } from "./normalize.js";
import { buscarLexico, buscarClitico } from "./lexicon.js";

/* ------------------------------------------------------------------ *
 * Tabelas básicas
 * ------------------------------------------------------------------ */

const FORTES = "aeoáéóâêôãõà";      // vogais fortes (núcleo pleno)
const FRACAS = "iu";                 // vogais fracas (podem virar glide)
const FRACAS_ACENT = "íúï";          // fracas acentuadas = fortes (hiato)
const VOGAIS = FORTES + FRACAS + FRACAS_ACENT + "ü";

const ACENTO_GRAFICO = "áéíóúâêô";
const TIL = "ãõ";

const eVogal = (c) => !!c && VOGAIS.includes(c);
const eForte = (c) => !!c && (FORTES.includes(c) || FRACAS_ACENT.includes(c));
const eFraca = (c) => !!c && FRACAS.includes(c);
const eConsoante = (c) => !!c && /[a-zç]/.test(c) && !VOGAIS.includes(c);

/** Dígrafos consonantais que contam como uma única unidade. */
const DIGRAFOS = ["ch", "lh", "nh", "rr", "ss", "qu", "gu"];

/** Consoantes que podem formar ataque ramificado com líquida. */
const OBSTRUINTES = "pbtdkgfvc";

/* ------------------------------------------------------------------ *
 * 1. Segmentação em unidades (consonantais e vocálicas)
 * ------------------------------------------------------------------ */

/**
 * @param {string} p palavra minúscula
 * @returns {{tipo:'C'|'V', txt:string}[]}
 */
function segmentar(p) {
  const un = [];
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (eVogal(c)) {
      un.push({ tipo: "V", txt: c });
      i++;
      continue;
    }
    const par = p.slice(i, i + 2);
    // "qu"/"gu" só são dígrafo diante de e/i (quero, guerra); senão são C+glide.
    if ((par === "qu" || par === "gu") && "eiéêíì".includes(p[i + 2] ?? "")) {
      un.push({ tipo: "C", txt: par });
      i += 2;
      continue;
    }
    if (DIGRAFOS.includes(par)) {
      un.push({ tipo: "C", txt: par });
      i += 2;
      continue;
    }
    un.push({ tipo: "C", txt: c });
    i++;
  }
  return un;
}

/* ------------------------------------------------------------------ *
 * 2. Silabificação
 * ------------------------------------------------------------------ */

/**
 * @typedef {{onset:string[], nucleo:string[], coda:string[], tonica?:boolean}} Silaba
 */

/**
 * Divide a palavra em sílabas (estrutura ataque–núcleo–coda).
 * @param {string} palavra
 * @returns {Silaba[]}
 */
export function silabificar(palavra) {
  const p = String(palavra).toLowerCase();
  const un = segmentar(p);
  if (!un.length) return [];

  /* 2a. Agrupa vogais em núcleos, aplicando ditongo decrescente. */
  const nucleos = []; // {vogais:string[], idxIni:number, idxFim:number}
  const consAntes = []; // consoantes acumuladas antes de cada núcleo
  let buffer = [];

  for (let i = 0; i < un.length; i++) {
    const u = un[i];
    if (u.tipo === "C") {
      buffer.push(u.txt);
      continue;
    }
    // Início de um novo núcleo.
    const vogais = [u.txt];
    // Ditongo decrescente: forte (ou fraca) + fraca átona.
    const prox = un[i + 1];
    if (prox && prox.tipo === "V" && eFraca(prox.txt)) {
      const depois = un[i + 2];
      // "ui"/"iu" só formam ditongo se não houver hiato marcado.
      const proxProx = depois && depois.tipo === "V";
      if (!(eFraca(u.txt) && eFraca(prox.txt) && proxProx)) {
        vogais.push(prox.txt);
        i++;
      }
    }
    nucleos.push({ vogais });
    consAntes.push(buffer);
    buffer = [];
  }
  const consFinais = buffer;

  if (!nucleos.length) {
    // Palavra sem vogais (sigla solta): devolve tudo como coda.
    return [{ onset: [], nucleo: [], coda: consFinais, tonica: true }];
  }

  /* 2b. Distribui consoantes entre coda anterior e ataque seguinte. */
  const silabas = /** @type {Silaba[]} */ ([]);
  for (let s = 0; s < nucleos.length; s++) {
    silabas.push({ onset: [], nucleo: nucleos[s].vogais, coda: [] });
  }
  // Consoantes antes do 1º núcleo -> ataque da 1ª sílaba.
  silabas[0].onset = consAntes[0];

  for (let s = 1; s < nucleos.length; s++) {
    const grupo = consAntes[s];
    if (grupo.length === 0) continue;
    if (grupo.length === 1) {
      silabas[s].onset = [grupo[0]];
      continue;
    }
    const ult = grupo[grupo.length - 1];
    const penult = grupo[grupo.length - 2];
    const clusterValido =
      (ult === "l" || ult === "r") &&
      penult.length === 1 &&
      OBSTRUINTES.includes(penult);
    if (clusterValido) {
      silabas[s - 1].coda = grupo.slice(0, -2);
      silabas[s].onset = [penult, ult];
    } else {
      silabas[s - 1].coda = grupo.slice(0, -1);
      silabas[s].onset = [ult];
    }
  }
  silabas[silabas.length - 1].coda = consFinais;

  return silabas;
}

/* ------------------------------------------------------------------ *
 * 3. Tonicidade
 * ------------------------------------------------------------------ */

/**
 * Marca a sílaba tônica (in place) e devolve seu índice.
 * @param {Silaba[]} sil
 * @param {string} palavra
 */
export function acentuar(sil, palavra) {
  if (!sil.length) return -1;

  // (a) Acento gráfico agudo/circunflexo manda.
  for (let i = 0; i < sil.length; i++) {
    if (sil[i].nucleo.some((v) => ACENTO_GRAFICO.includes(v))) {
      sil[i].tonica = true;
      return i;
    }
  }
  if (sil.length === 1) {
    sil[0].tonica = true;
    return 0;
  }

  // (b) Til na última sílaba é tônico (irmão, então) — exceto "-ão(s)" átono raro.
  const ultima = sil[sil.length - 1];
  if (ultima.nucleo.some((v) => TIL.includes(v))) {
    ultima.tonica = true;
    return sil.length - 1;
  }

  // (c) Oxítona por terminação.
  const nucUlt = ultima.nucleo.join("");
  const codaUlt = ultima.coda.join("");
  const term = nucUlt + codaUlt;

  const oxitona =
    // terminações consonantais r, l, z, x, n
    /^[rlzxn]$/.test(codaUlt) ||
    // "-ais/-eis/-óis": ditongo + s (papéis, reais)
    (codaUlt === "s" && ultima.nucleo.length === 2) ||
    // "-im/-um/-ins/-uns"
    /^(i|u)(m|ns|m s)?$/.test(term) && /m|ns/.test(codaUlt) ||
    // tônica em i/u finais (ex.: caqui, urubu) quando sem coda
    (codaUlt === "" && /[iu]$/.test(nucUlt) && nucUlt.length === 1);

  // "-em/-ens" e "-am" são paroxítonos (homem, jovens, falam).
  const paroxitonaForcada = /^(em|ens|am|ams)$/.test(term) || /^(am|em|ens)$/.test(nucUlt + codaUlt);

  if (oxitona && !paroxitonaForcada) {
    ultima.tonica = true;
    return sil.length - 1;
  }

  const idx = sil.length - 2;
  sil[idx].tonica = true;
  return idx;
}

/**
 * Marca acento secundário na 1ª sílaba de palavras com 3+ sílabas,
 * quando ela não é a tônica nem lhe é adjacente — convenção do espeak pt-br
 * (ex.: "banana" -> bˌænˈɐ̃næ, "hospital" -> ˌospitˈaʊ).
 */
function acentoSecundario(sil, iTon) {
  if (sil.length < 3 || iTon <= 1) return;
  sil[0].secundaria = true;
}

/* ------------------------------------------------------------------ *
 * 4. Mapeamento para IPA
 * ------------------------------------------------------------------ */

const NASALIZAVEL = new Set(["m", "n"]);

/** Nasaliza a vogal segundo a convenção do espeak pt-br. */
function nucleoNasal(v) {
  switch (v) {
    case "a": case "á": case "à": case "â": case "ã": return "ɐ̃";
    case "e": case "é": case "ê": return "eɪ";
    case "i": case "í": return "i";
    case "o": case "ó": case "ô": case "õ": return "o";
    case "u": case "ú": return "ũ";
    default: return v;
  }
}

/** Vogal oral, considerando tonicidade e posição. */
function vogalOral(v, { tonica, finalPalavra, pretonicaNasal }) {
  switch (v) {
    // "a" pretônico diante de nasal reduz para [æ] (banana, caneta, amarelo).
    case "a": return (finalPalavra && !tonica) || pretonicaNasal ? "æ" : "a";
    case "á": case "à": return "a";
    case "â": return "ɐ";
    case "ã": return "ɐ̃";
    case "e": return finalPalavra && !tonica ? "y" : "e";
    case "é": return "ɛ";
    case "ê": return "e";
    case "i": case "í": return "i";
    case "o": return finalPalavra && !tonica ? "ʊ" : "o";
    case "ó": return "ɔ";
    case "ô": return "o";
    case "õ": return "õ";
    case "u": case "ú": case "ü": return "u";
    default: return v;
  }
}

/** Semivogal (offglide) de ditongo decrescente. */
function offglide(v, nasal) {
  if (v === "i" || v === "í") return nasal ? "ɪ̃" : "ɪ";
  if (v === "u" || v === "ú") return nasal ? "ʊ̃" : "ʊ";
  if (v === "o") return nasal ? "ʊ̃" : "ʊ";
  if (v === "e") return nasal ? "ɪ̃" : "ɪ";
  return v;
}

/** Converte o núcleo (1–2 vogais) em IPA. */
function mapearNucleo(sil, ctx) {
  const { tonica = false } = sil;
  const { finalPalavra, nasalPorCoda, pretonicaNasal = false } = ctx;
  const vs = sil.nucleo;
  if (!vs.length) return "";

  const temTil = vs.some((v) => TIL.includes(v));
  const nasal = nasalPorCoda || temTil;

  // Ditongos nasais gráficos: ão, ãe, õe.
  if (vs.length === 2 && temTil) {
    const [a, b] = vs;
    const base = nucleoNasal(a);
    if (b === "o" || b === "u") return `${base}ʊ̃`;
    if (b === "e" || b === "i") return `${base}ɪ̃`;
    return base + offglide(b, true);
  }

  if (vs.length === 1) {
    const v = vs[0];
    if (nasal) return nucleoNasal(v);
    return vogalOral(v, { tonica, finalPalavra, pretonicaNasal });
  }

  // Ditongo oral decrescente.
  const [a, b] = vs;
  // "ou" -> ow na convenção espeak pt-br.
  if (a === "o" && b === "u") return "oʊ";
  const base = nasal ? nucleoNasal(a) : vogalOral(a, { tonica, finalPalavra: false, pretonicaNasal });
  return base + offglide(b, nasal);
}

/** Consoante de coda nasal: m diante de labial, senão ŋ. */
function nasalCoda(proxOnset) {
  const c = (proxOnset ?? "")[0] ?? "";
  // Atenção: "".includes("") é true — por isso o teste explícito de vazio.
  return c !== "" && "pbm".includes(c) ? "m" : "ŋ";
}

/** Mapeia o ataque silábico. */
function mapearOnset(cons, ctx) {
  const { nucleoIPA, inicioPalavra, codaAnterior } = ctx;
  let out = "";

  for (let i = 0; i < cons.length; i++) {
    const c = cons[i];
    const proximaCons = cons[i + 1];
    const primeiro = i === 0;
    // Vogal que este ataque introduz (para palatalização e c/g brandos).
    const vSeg = nucleoIPA[0] ?? "";
    const brando = "iɪeɛy".includes(vSeg) && !proximaCons;

    switch (c) {
      case "ch": out += "ʃ"; break;
      case "lh": out += "lj"; break;
      case "nh": out += "ɲ"; break;
      case "rr": out += "x"; break;
      case "ss": out += "s"; break;
      case "qu": out += "k"; break;
      case "gu": out += "ɡ"; break;

      case "b": out += "b"; break;
      case "c": out += brando ? "s" : "k"; break;
      case "ç": out += "s"; break;
      case "d": out += "iɪ".includes(vSeg) || vSeg === "y" ? (proximaCons ? "d" : "dʒ") : "d"; break;
      case "f": out += "f"; break;
      case "g": out += brando ? "ʒ" : "ɡ"; break;
      case "h": break;
      case "j": out += "ʒ"; break;
      case "k": out += "k"; break;
      case "l": out += "l"; break;
      case "m": out += "m"; break;
      case "n": out += "n"; break;
      case "p": out += "p"; break;
      case "q": out += "k"; break;
      case "r":
        // R forte: início absoluto de palavra ou depois de coda consonantal.
        if (primeiro && (inicioPalavra || /[nlsɾ]$/.test(codaAnterior))) out += "x";
        else if (primeiro && codaAnterior === "") out += "ɾ";
        else out += "r"; // em ataque ramificado (pr, br, tr...)
        break;
      case "s":
        // Intervocálico -> z; senão s.
        out += ctx.intervocalico && primeiro ? "z" : "s";
        break;
      case "t": out += "iɪ".includes(vSeg) || vSeg === "y" ? (proximaCons ? "t" : "tʃ") : "t"; break;
      case "v": out += "v"; break;
      case "w": out += "w"; break;
      case "x": out += "ʃ"; break;
      case "y": out += "j"; break;
      case "z": out += "z"; break;
      default: out += c;
    }
  }
  return out;
}

/** Mapeia a coda silábica. */
function mapearCoda(cons, ctx) {
  const { proxOnset, finalPalavra, sonorizarS } = ctx;
  let out = "";
  for (let i = 0; i < cons.length; i++) {
    const c = cons[i];
    const ehUltima = i === cons.length - 1;
    const seguinte = cons[i + 1] ?? (ehUltima ? (proxOnset ?? "")[0] ?? "" : "");
    switch (c) {
      case "m": case "n":
        // Já nasalizou o núcleo; aqui entra só a consoante de apoio.
        out += nasalCoda(seguinte);
        break;
      case "r":
        // Coda: [ɾ] com epêntese antes de consoante, [r] em fim de palavra.
        out += finalPalavra && ehUltima ? "r" : "ɾə";
        break;
      case "l":
        out += "ʊ";
        break;
      case "s": case "ss":
        if (finalPalavra && ehUltima) out += sonorizarS ? "z" : "s";
        else out += "bdgjlmnrvzç".includes(seguinte) ? "z" : "s";
        break;
      case "z":
        out += finalPalavra && ehUltima ? (sonorizarS ? "z" : "s") : "z";
        break;
      case "x": out += "s"; break;
      case "c": out += "k"; break;
      case "ç": out += "s"; break;
      case "b": out += "b"; break;
      case "d": out += "dʒ"; break;
      case "g": out += "ɡ"; break;
      case "p": out += "p"; break;
      case "t": out += "tʃ"; break;
      case "ch": out += "ʃ"; break;
      default: out += c;
    }
  }
  return out;
}

/**
 * Converte uma palavra em IPA.
 * @param {string} palavra
 * @param {{proximaInicial?:string}} [ctx]
 */
export function palavraParaIPA(palavra, ctx = {}) {
  const { proximaInicial = "" } = ctx;
  const p = String(palavra).toLowerCase();
  if (!p) return "";

  const sil = silabificar(p);
  if (!sil.length) return "";
  const iTon = acentuar(sil, p);
  acentoSecundario(sil, iTon);

  const sonorizarS =
    !!proximaInicial && (eVogal(proximaInicial) || "bdgjlmnrvz".includes(proximaInicial));

  let out = "";
  let codaAnterior = "";

  for (let s = 0; s < sil.length; s++) {
    const cur = sil[s];
    const prox = sil[s + 1];
    const finalPalavra = s === sil.length - 1;

    // A coda nasal (m/n) nasaliza o núcleo desta sílaba.
    const nasalPorCoda = cur.coda.length > 0 && NASALIZAVEL.has(cur.coda[0]);
    // "a" também nasaliza diante de nasal intervocálica (cama, ano).
    // "a" diante de nasal intervocálica: nasaliza se tônico (cama, ano),
    // mas apenas reduz para [æ] se pretônico (banana, caneta).
    const contatoNasal =
      !nasalPorCoda &&
      !!prox &&
      prox.onset.length === 1 &&
      NASALIZAVEL.has(prox.onset[0]) &&
      cur.nucleo.length === 1 &&
      "aáà".includes(cur.nucleo[0]);
    const nasalIntervoc = contatoNasal && !!cur.tonica;
    const pretonicaNasal = contatoNasal && !cur.tonica;

    // Vogal final reduz também quando a coda é só o /s/ de plural: nomes, livros.
    const codaSoS = cur.coda.length === 1 && (cur.coda[0] === "s" || cur.coda[0] === "ss");
    const nucleoIPA = mapearNucleo(cur, {
      finalPalavra: finalPalavra && (cur.coda.length === 0 || codaSoS),
      nasalPorCoda: nasalPorCoda || nasalIntervoc,
      pretonicaNasal,
    });

    const intervocalico = s > 0 && sil[s - 1].coda.length === 0;

    const onsetIPA = mapearOnset(cur.onset, {
      nucleoIPA,
      inicioPalavra: s === 0,
      codaAnterior,
      intervocalico,
    });

    const codaIPA = mapearCoda(cur.coda, {
      proxOnset: prox ? prox.onset.join("") : "",
      finalPalavra,
      sonorizarS,
    });

    codaAnterior = codaIPA;
    const marca = cur.tonica ? "ˈ" : cur.secundaria ? "ˌ" : "";
    out += onsetIPA + marca + nucleoIPA + codaIPA;
  }

  return limpar(out);
}

/** Ajustes finais na cadeia IPA. */
function limpar(ipa) {
  return ipa
    // NFD: o vocabulário do modelo usa vogal + til combinante (U+0303),
    // nunca formas pré-compostas como "ũ" (U+0169), que virariam token
    // desconhecido e sairiam mudas na fala.
    .normalize("NFD")
    .replace(/g/g, "ɡ")        // "g" ASCII não existe no vocabulário do modelo
    .replace(/ˈ{2,}/g, "ˈ")
    .replace(/\u0303{2,}/g, "\u0303")
    .trim();
}

/* ------------------------------------------------------------------ *
 * 5. API pública
 * ------------------------------------------------------------------ */

const PONTUACAO = /^[;:,.!?¡¿—…"«»“”(){}[\]]+$/;

/**
 * Converte texto pt-BR em fonemas IPA prontos para o modelo neural.
 *
 * @param {string} texto
 * @param {{normalizar?:boolean, lexico?:Record<string,string>}} [opts]
 * @returns {string}
 */
export function fonemizar(texto, opts = {}) {
  const { normalizar: usarNorm = true, lexico: extra = null } = opts;

  const t = usarNorm ? normalizar(texto) : String(texto ?? "");
  if (!t) return "";

  const tokens = t.match(/[\p{L}\p{M}'-]+|[;:,.!?—…"«»“”(){}[\]]|\s+/gu) ?? [];
  const palavras = tokens.filter((x) => /\p{L}/u.test(x));

  const partes = [];
  let idx = 0;

  for (const tk of tokens) {
    if (/^\s+$/.test(tk)) {
      if (partes.length && partes[partes.length - 1] !== " ") partes.push(" ");
      continue;
    }
    if (PONTUACAO.test(tk)) {
      while (partes.length && partes[partes.length - 1] === " ") partes.pop();
      partes.push(tk, " ");
      continue;
    }

    const proxima = palavras[idx + 1] ?? "";
    idx++;

    const bruta = tk.toLowerCase().replace(/^['-]+|['-]+$/g, "");
    if (!bruta) continue;

    // Palavras compostas com hífen: fonemiza cada parte.
    if (bruta.includes("-")) {
      const sub = bruta.split("-").filter(Boolean);
      partes.push(sub.map((w) => resolverPalavra(w, "", extra)).join(" "));
      continue;
    }

    partes.push(resolverPalavra(bruta, proxima[0] ?? "", extra));
  }

  return partes
    .join("")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([;:,.!?…])/g, "$1")
    .trim();
}

/** Resolve uma palavra: léxico do usuário → léxico interno → clítico → regras. */
function resolverPalavra(palavra, proximaInicial, extra) {
  if (extra && Object.hasOwn(extra, palavra)) return extra[palavra];
  const lex = buscarLexico(palavra);
  if (lex) return lex;
  const cli = buscarClitico(palavra);
  if (cli) return cli;
  return palavraParaIPA(palavra, { proximaInicial });
}

/** Alias em inglês. */
export const phonemize = fonemizar;

export { normalizar } from "./normalize.js";
export { LEXICO, CLITICOS } from "./lexicon.js";
