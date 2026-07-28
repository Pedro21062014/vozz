import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { fonemizar, silabificar, normalizar } from "../src/g2p/index.js";
import { inteiroPorExtenso, ordinalPorExtenso, decimalPorExtenso } from "../src/g2p/numbers.js";
import { dividirEmSentencas, DivisorDeTexto } from "../src/splitter.js";
import { codificarWav, Audio } from "../src/audio.js";
import { resolverVoz, listarVozes } from "../src/voices.js";

/* ------------------------------ números ------------------------------ */

test("números por extenso", () => {
  assert.equal(inteiroPorExtenso(0), "zero");
  assert.equal(inteiroPorExtenso(1), "um");
  assert.equal(inteiroPorExtenso(15), "quinze");
  assert.equal(inteiroPorExtenso(21), "vinte e um");
  assert.equal(inteiroPorExtenso(100), "cem");
  assert.equal(inteiroPorExtenso(101), "cento e um");
  assert.equal(inteiroPorExtenso(1000), "mil");
  assert.equal(inteiroPorExtenso(1500), "mil e quinhentos");
  assert.equal(inteiroPorExtenso(2026), "dois mil e vinte e seis");
  assert.equal(inteiroPorExtenso(1000000), "um milhão");
  assert.equal(inteiroPorExtenso(-5), "menos cinco");
});

test("ordinais e decimais", () => {
  assert.equal(ordinalPorExtenso(1), "primeiro");
  assert.equal(ordinalPorExtenso(1, { feminino: true }), "primeira");
  assert.equal(ordinalPorExtenso(42), "quadragésimo segundo");
  assert.match(decimalPorExtenso("3", "14"), /três vírgula/);
});

/* ---------------------------- normalização ---------------------------- */

test("normalização de números, moeda, hora e data", () => {
  assert.match(normalizar("Custa R$ 25,50"), /vinte e cinco reais e cinquenta centavos/);
  assert.match(normalizar("São 14h30"), /quatorze horas e trinta minutos/);
  assert.match(normalizar("Em 07/09/2025"), /sete de setembro de dois mil e vinte e cinco/);
  assert.match(normalizar("Cresceu 15%"), /quinze por cento/);
  assert.match(normalizar("Está 23°C"), /vinte e três graus celsius/);
  assert.match(normalizar("O 1º lugar"), /primeiro/);
});

test("normalização não quebra texto comum", () => {
  assert.equal(normalizar("Olá, tudo bem?"), "Olá, tudo bem?");
});

/* ------------------------------ sílabas ------------------------------ */

test("silabificação", () => {
  const junta = (w) => silabificar(w).map((s) => s.onset.join("") + s.nucleo.join("") + s.coda.join("")).join("-");
  assert.equal(junta("casa"), "ca-sa");
  assert.equal(junta("problema"), "pro-ble-ma");
  assert.equal(junta("trabalho"), "tra-ba-lho");
  assert.equal(junta("computador"), "com-pu-ta-dor");
});

/* -------------------------------- G2P -------------------------------- */

test("fonemas de palavras-chave", () => {
  const casos = {
    casa: "kˈazæ",
    carro: "kˈaxʊ",
    caro: "kˈaɾʊ",
    trabalho: "trˌabˈaljʊ",
    nomes: "nˈomys",
    livros: "lˈivrʊs",
    dia: "dʒˈiæ",
    noite: "nˈoɪtʃy",
  };
  for (const [palavra, esperado] of Object.entries(casos)) {
    assert.equal(fonemizar(palavra), esperado, `falhou em "${palavra}"`);
  }
});

test("G2P nunca emite 'g' ASCII (fora do vocabulário do modelo)", () => {
  const amostra = "gato guerra agora água gigante organização grande";
  assert.ok(!fonemizar(amostra).includes("g"), "encontrou g ASCII em vez de ɡ");
});

test("todo símbolo gerado existe no vocabulário do modelo", () => {
  // Se um símbolo não estiver no vocabulário, o token vira desconhecido e o
  // trecho sai mudo. Este é o teste de regressão mais importante do G2P.
  const VOCAB = new Set([
    "$", ";", ":", ",", ".", "!", "?", "—", "…", '"', "(", ")", "“", "”", " ",
    "\u0303", "ʣ", "ʥ", "ʦ", "ʨ", "ᵝ", "ꭧ", "A", "I", "O", "Q", "S", "T", "W", "Y", "ᵊ",
    "a", "b", "c", "d", "e", "f", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q",
    "r", "s", "t", "u", "v", "w", "x", "y", "z", "ɑ", "ɐ", "ɒ", "æ", "β", "ɔ", "ɕ",
    "ç", "ɖ", "ð", "ʤ", "ə", "ɚ", "ɛ", "ɜ", "ɟ", "ɡ", "ɥ", "ɨ", "ɪ", "ʝ", "ɯ", "ɰ",
    "ŋ", "ɳ", "ɲ", "ɴ", "ø", "ɸ", "θ", "œ", "ɹ", "ɾ", "ɻ", "ʁ", "ɽ", "ʂ", "ʃ", "ʈ",
    "ʧ", "ʊ", "ʋ", "ʌ", "ɣ", "ɤ", "χ", "ʎ", "ʒ", "ʔ", "ˈ", "ˌ", "ː", "ʰ", "ʲ",
    "↓", "→", "↗", "↘", "ᵻ",
  ]);
  const amostras = [
    "Olá, tudo bem? São 14h30 e custa R$ 1.500,00.",
    "um mundo junto nunca algum comum atum bom sim",
    "coração pão irmão mãe cães põe ação",
    "trabalho filho vinho banho guerra carro exemplo táxi",
    "O Sr. Silva pagou 100% em 07/09/2025 na ONU.",
  ];
  const fora = new Set();
  for (const s of amostras) {
    for (const ch of fonemizar(s)) if (!VOCAB.has(ch)) fora.add(ch);
  }
  assert.equal(fora.size, 0, `símbolos fora do vocabulário: ${[...fora].map((c) => JSON.stringify(c)).join(", ")}`);
});

test("G2P mantém a pontuação (prosódia)", () => {
  const ipa = fonemizar("Olá, tudo bem? Sim!");
  assert.ok(ipa.includes(","));
  assert.ok(ipa.includes("?"));
  assert.ok(ipa.includes("!"));
});

test("léxico customizado tem prioridade", () => {
  const ipa = fonemizar("kubernetes", { lexico: { kubernetes: "kubeɾnˈetʃis" } });
  assert.equal(ipa, "kubeɾnˈetʃis");
});

test("texto vazio não quebra", () => {
  assert.equal(fonemizar(""), "");
  assert.equal(fonemizar("   "), "");
});

/* ------------------------- qualidade vs. espeak ------------------------- */

test("PER contra o corpus de referência do espeak-ng fica abaixo de 8%", () => {
  const corpus = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8"));
  const canon = (s) => s.normalize("NFD").replace(/\u02CC/g, "").replace(/\s+/g, " ").replace(/g/g, "ɡ").trim();

  const lev = (a, b) => {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  };

  let dist = 0, len = 0;
  for (const it of corpus) {
    const a = canon(fonemizar(it.texto));
    const b = canon(it.esperado);
    dist += lev([...a], [...b]);
    len += b.length;
  }
  const per = (dist / len) * 100;
  assert.ok(per < 8, `PER de ${per.toFixed(2)}% acima do limite de 8%`);
});

/* ------------------------------ sentenças ------------------------------ */

test("divisão em sentenças", () => {
  assert.deepEqual(dividirEmSentencas("Oi. Tudo bem?"), ["Oi.", "Tudo bem?"]);
  assert.equal(dividirEmSentencas("O Sr. Silva chegou.").length, 1, "abreviação não divide");
  assert.equal(dividirEmSentencas("Custa 3.14 reais.").length, 1, "decimal não divide");
  assert.equal(dividirEmSentencas("Ele disse: 'Oi!' e saiu.").length, 1);
});

test("divisor incremental emite sentenças completas", async () => {
  const d = new DivisorDeTexto();
  const recebidas = [];
  const consumo = (async () => {
    for await (const s of d) recebidas.push(s);
  })();
  d.empurrar("Primeira frase. ", "Segunda ", "frase!");
  d.fechar();
  await consumo;
  assert.equal(recebidas.length, 2);
  assert.equal(recebidas[0], "Primeira frase.");
});

/* -------------------------------- áudio -------------------------------- */

test("WAV tem cabeçalho válido", () => {
  const wav = codificarWav(new Float32Array([0, 0.5, -0.5, 1, -1]), 24000);
  const dv = new DataView(wav);
  const txt = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  assert.equal(txt(0), "RIFF");
  assert.equal(txt(8), "WAVE");
  assert.equal(dv.getUint32(24, true), 24000, "taxa de amostragem");
  assert.equal(dv.getUint16(34, true), 16, "bits por amostra");
});

test("concatenação soma as durações", () => {
  const a = new Audio(new Float32Array(24000), 24000);
  const b = new Audio(new Float32Array(12000), 24000);
  assert.equal(Audio.concatenar([a, b]).duracao, 1.5);
});

/* -------------------------------- vozes -------------------------------- */

test("resolução de vozes e aliases", () => {
  assert.equal(resolverVoz("dora").id, "pf_dora");
  assert.equal(resolverVoz("pf_dora").id, "pf_dora");
  assert.equal(resolverVoz("feminina").id, "pf_dora");
  assert.equal(listarVozes().length, 3);
  assert.throws(() => resolverVoz("inexistente"), /não existe/);
});
