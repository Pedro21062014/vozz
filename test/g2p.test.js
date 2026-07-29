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

/* --------------------- compatibilidade com navegador --------------------- */

test("nenhum módulo do Node é importado estaticamente (quebraria bundlers web)", () => {
  // Um `import ... from "node:fs"` literal faz Vite/webpack/esbuild falharem
  // ao compilar para o navegador, que é o alvo principal do pacote.
  const arquivos = [
    "../src/index.js", "../src/audio.js", "../src/voices.js", "../src/splitter.js",
    "../src/g2p/index.js", "../src/g2p/normalize.js", "../src/g2p/numbers.js",
    "../src/g2p/lexicon.js",
  ];
  for (const rel of arquivos) {
    const codigo = readFileSync(new URL(rel, import.meta.url), "utf8");
    const estatico = /^\s*import\s[^;]*from\s+["'](node:|fs|path|os|crypto)["']/m.test(codigo);
    assert.equal(estatico, false, `${rel} importa módulo do Node de forma estática`);
    const dinamicoLiteral = /import\(\s*["']node:[^"']+["']\s*\)/.test(codigo);
    assert.equal(dinamicoLiteral, false, `${rel} tem import() com literal "node:..." — use especificador montado em runtime`);
  }
});

test("o subpath /g2p não depende de nada externo", () => {
  const arquivos = ["../src/g2p/index.js", "../src/g2p/normalize.js", "../src/g2p/numbers.js", "../src/g2p/lexicon.js"];
  for (const rel of arquivos) {
    const codigo = readFileSync(new URL(rel, import.meta.url), "utf8");
    for (const m of codigo.matchAll(/^\s*import\s[^;]*from\s+["']([^"']+)["']/gm)) {
      assert.ok(m[1].startsWith("./") || m[1].startsWith("../"),
        `${rel} importa "${m[1]}" — o G2P deve ser 100% autocontido`);
    }
  }
});

/* ------------------ motor de síntese em código (formantes) ------------------ */

test("sintetizador gera áudio audível sem rede neural", async () => {
  const { Sintetizador } = await import("../src/sintetizador.js");
  const tts = new Sintetizador();
  const audio = tts.falar("Olá, tudo bem?");

  assert.ok(audio.duracao > 0.4, `duração muito curta: ${audio.duracao}s`);

  let pico = 0, soma = 0;
  for (const v of audio.amostras) { pico = Math.max(pico, Math.abs(v)); soma += v * v; }
  const rms = Math.sqrt(soma / audio.amostras.length);
  assert.ok(pico > 0.2, `sinal fraco demais (pico ${pico.toFixed(3)})`);
  assert.ok(pico <= 1.0, `sinal estourado (pico ${pico.toFixed(3)})`);
  assert.ok(rms > 0.02, `energia média baixa (rms ${rms.toFixed(4)})`);
});

test("sintetizador é determinístico", async () => {
  const { Sintetizador } = await import("../src/sintetizador.js");
  const tts = new Sintetizador();
  const a = tts.falar("teste de repetição");
  const b = tts.falar("teste de repetição");
  assert.equal(a.amostras.length, b.amostras.length);
  // Mesma entrada deve produzir exatamente o mesmo áudio.
  let iguais = true;
  for (let i = 0; i < a.amostras.length; i += 97) {
    if (Math.abs(a.amostras[i] - b.amostras[i]) > 1e-9) { iguais = false; break; }
  }
  assert.ok(iguais, "duas chamadas idênticas geraram áudios diferentes");
});

test("vozes do sintetizador têm timbres distintos", async () => {
  const { Sintetizador } = await import("../src/sintetizador.js");
  const tts = new Sintetizador();
  const clara = tts.falar("teste", { voz: "clara" });
  const grave = tts.falar("teste", { voz: "grave" });
  // Vozes diferentes -> durações/formas diferentes.
  let diferenca = 0;
  const n = Math.min(clara.amostras.length, grave.amostras.length);
  for (let i = 0; i < n; i += 13) diferenca += Math.abs(clara.amostras[i] - grave.amostras[i]);
  assert.ok(diferenca / (n / 13) > 0.01, "vozes soam idênticas");
});

test("sintetizador não depende de nada externo (roda em edge/Workers)", () => {
  for (const rel of ["../src/sintetizador.js", "../src/dsp/filtros.js", "../src/dsp/fontes.js", "../src/dsp/fonemas.js"]) {
    const codigo = readFileSync(new URL(rel, import.meta.url), "utf8");
    for (const m of codigo.matchAll(/^\s*import\s[^;]*from\s+["']([^"']+)["']/gm)) {
      assert.ok(m[1].startsWith("./") || m[1].startsWith("../"),
        `${rel} importa "${m[1]}" — o motor em código deve ser autocontido`);
    }
  }
});

test("velocidade e entonação afetam o resultado", async () => {
  const { Sintetizador } = await import("../src/sintetizador.js");
  const tts = new Sintetizador();
  const normal = tts.falar("uma frase de teste");
  const rapido = tts.falar("uma frase de teste", { velocidade: 1.8 });
  assert.ok(rapido.duracao < normal.duracao * 0.75,
    `velocidade não encurtou: ${normal.duracao.toFixed(2)}s -> ${rapido.duracao.toFixed(2)}s`);
});

/* -------------------- qualidade acústica do sintetizador -------------------- */

/**
 * Estes testes protegem as propriedades acústicas conquistadas por
 * calibração. Sem eles, um ajuste inocente em qualquer ganho volta a
 * degradar a inteligibilidade sem que ninguém perceba.
 */

/** Energia relativa por banda de frequência (DFT simples, sem dependências). */
function bandasEnergia(amostras, taxa) {
  const N = 1 << Math.floor(Math.log2(Math.min(amostras.length, 32768)));
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    re[i] = amostras[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  // FFT iterativa (Cooley-Tukey).
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
  const faixas = { grave: 0, medio: 0, agudo: 0 };
  let total = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * taxa) / N;
    const m = Math.hypot(re[k], im[k]);
    total += m;
    if (f >= 300 && f < 1000) faixas.grave += m;
    else if (f >= 1000 && f < 3000) faixas.medio += m;
    else if (f >= 3000 && f < 8000) faixas.agudo += m;
  }
  if (!total) return { grave: 0, medio: 0, agudo: 0 };
  return {
    grave: (100 * faixas.grave) / total,
    medio: (100 * faixas.medio) / total,
    agudo: (100 * faixas.agudo) / total,
  };
}

test("distribuição espectral compatível com fala humana", async () => {
  const { Sintetizador } = await import("../src/sintetizador.js");
  const audio = new Sintetizador().falar(
    "A raposa marrom saltou sobre o cachorro preguiçoso na tarde de domingo.",
  );
  const b = bandasEnergia(audio.amostras, audio.taxa);

  // Faixas medidas em fala humana natural. A banda média (1-3 kHz) é a que
  // carrega a inteligibilidade: se ela desaparece, a fala vira murmúrio.
  assert.ok(b.grave >= 20 && b.grave <= 55, `300-1000Hz fora da faixa: ${b.grave.toFixed(1)}%`);
  assert.ok(b.medio >= 15, `1000-3000Hz baixo demais (inteligibilidade): ${b.medio.toFixed(1)}%`);
  assert.ok(b.agudo <= 38, `3000-8000Hz alto demais (estridente): ${b.agudo.toFixed(1)}%`);
});

test("proporção de silêncio típica de fala contínua", async () => {
  const { Sintetizador } = await import("../src/sintetizador.js");
  const audio = new Sintetizador().falar("Preciso comprar pão, leite e café no mercado hoje.");
  const janela = Math.floor(audio.taxa * 0.02);
  const env = [];
  for (let i = 0; i + janela < audio.amostras.length; i += janela) {
    let s = 0;
    for (let k = 0; k < janela; k++) s += audio.amostras[i + k] ** 2;
    env.push(Math.sqrt(s / janela));
  }
  const max = Math.max(...env);
  const silencio = (100 * env.filter((e) => e < 0.1 * max).length) / env.length;
  // Pausas e oclusivas produzem silêncio; nem demais (entrecortado) nem de
  // menos (sem ritmo silábico).
  assert.ok(silencio >= 12 && silencio <= 48, `silêncio fora do natural: ${silencio.toFixed(1)}%`);
});

test("vogais são acusticamente distinguíveis entre si", async () => {
  const { Sintetizador } = await import("../src/sintetizador.js");
  const tts = new Sintetizador();
  // Se as vogais convergirem para o mesmo espectro, nenhuma palavra é
  // compreensível. Comparamos o perfil de bandas de cada uma.
  const perfis = {};
  for (const v of ["a", "i", "u"]) {
    const audio = tts.falarIPA(v.repeat(6));
    perfis[v] = bandasEnergia(audio.amostras, audio.taxa);
  }
  const dist = (x, y) =>
    Math.abs(x.grave - y.grave) + Math.abs(x.medio - y.medio) + Math.abs(x.agudo - y.agudo);

  assert.ok(dist(perfis.a, perfis.i) > 8, `[a] e [i] espectralmente iguais: ${dist(perfis.a, perfis.i).toFixed(1)}`);
  assert.ok(dist(perfis.a, perfis.u) > 8, `[a] e [u] espectralmente iguais: ${dist(perfis.a, perfis.u).toFixed(1)}`);
  assert.ok(dist(perfis.i, perfis.u) > 8, `[i] e [u] espectralmente iguais: ${dist(perfis.i, perfis.u).toFixed(1)}`);
});

test("fricativas sibilantes têm assinaturas distintas ([s] vs [ʃ])", async () => {
  const { Sintetizador } = await import("../src/sintetizador.js");
  const tts = new Sintetizador();
  // Contraste essencial do português: "sapato" vs "chapéu".
  const centroide = (ipa) => {
    const a = tts.falarIPA(ipa);
    const n = Math.floor(a.taxa * 0.06);
    const b = bandasEnergia(a.amostras.slice(0, n), a.taxa);
    return b.agudo - b.medio; // [s] concentra agudo; [ʃ] puxa para o médio
  };
  const s = centroide("sasasa");
  const sh = centroide("ʃaʃaʃa");
  assert.ok(s - sh > 5, `[s] e [ʃ] pouco contrastados: ${s.toFixed(1)} vs ${sh.toFixed(1)}`);
});

test("entonação de pergunta difere da de afirmação", async () => {
  const { Sintetizador } = await import("../src/sintetizador.js");
  const tts = new Sintetizador();
  const afirma = tts.falar("Você vem hoje.");
  const pergunta = tts.falar("Você vem hoje?");
  // Uma pergunta termina com F0 subindo; a diferença aparece na energia
  // do trecho final.
  const finalRms = (a) => {
    const ini = Math.floor(a.amostras.length * 0.75);
    let s = 0;
    for (let i = ini; i < a.amostras.length; i++) s += a.amostras[i] ** 2;
    return Math.sqrt(s / (a.amostras.length - ini));
  };
  assert.notEqual(
    finalRms(afirma).toFixed(3),
    finalRms(pergunta).toFixed(3),
    "pergunta e afirmação produziram o mesmo contorno final",
  );
});

/* ---------------------------- motor Piper ---------------------------- */

test("tokenização do Piper segue o formato esperado pelo modelo", async () => {
  const cfg = JSON.parse(readFileSync(
    new URL("../pt_BR-faber-medium-quantized.onnx.json", import.meta.url), "utf8"));
  const mapa = cfg.phoneme_id_map;
  const pad = mapa["_"][0];

  // Reproduz idsDeFonemas sem carregar o runtime ONNX (que é pesado).
  const ids = (ipa) => {
    const out = [mapa["^"][0], pad];
    for (const ch of ipa.normalize("NFD")) {
      const e = mapa[ch];
      if (e) out.push(e[0], pad);
    }
    out.push(mapa["$"][0]);
    return out;
  };

  const seq = ids(fonemizar("Olá, tudo bem?"));
  assert.equal(seq[0], mapa["^"][0], "falta o símbolo de início");
  assert.equal(seq[1], pad, "falta o separador após o início");
  assert.equal(seq.at(-1), mapa["$"][0], "falta o símbolo de fim");
  // O separador entre fonemas é obrigatório no Piper: sem ele o
  // alinhamento interno do VITS sai errado e a fala fica arrastada.
  for (let i = 3; i < seq.length - 1; i += 2) {
    assert.equal(seq[i], pad, `separador ausente na posição ${i}`);
  }
});

test("G2P cobre o vocabulário do modelo Piper", () => {
  // Se o G2P emitir um símbolo que o modelo não conhece, aquele fonema é
  // descartado e a palavra sai incompleta. Este teste garante cobertura.
  const cfg = JSON.parse(readFileSync(
    new URL("../pt_BR-faber-medium-quantized.onnx.json", import.meta.url), "utf8"));
  const mapa = cfg.phoneme_id_map;

  const amostras = [
    "Olá, tudo bem com você?",
    "O rato roeu a roupa do rei de Roma.",
    "coração pão irmão mãe cães põe ação",
    "trabalho filho vinho banho guerra carro exemplo táxi",
    "Custa R$ 1.500,00 às 14h30 do dia 07/09/2025.",
    "A raposa marrom saltou sobre o cachorro preguiçoso.",
  ];

  const fora = new Set();
  for (const texto of amostras) {
    for (const ch of fonemizar(texto).normalize("NFD")) {
      if (!mapa[ch]) fora.add(ch);
    }
  }
  assert.equal(fora.size, 0,
    `símbolos que o modelo não conhece: ${[...fora].map((c) => JSON.stringify(c)).join(", ")}`);
});

test("piper.js não importa módulos do Node estaticamente", () => {
  const codigo = readFileSync(new URL("../src/piper.js", import.meta.url), "utf8");
  for (const m of codigo.matchAll(/^\s*import\s[^;]*from\s+["']([^"']+)["']/gm)) {
    assert.ok(m[1].startsWith("./") || m[1].startsWith("../"),
      `import estático de "${m[1]}" quebraria o build para navegador`);
  }
  // O runtime ONNX não pode aparecer em nenhum import analisável
  // estaticamente: bundlers (esbuild, wrangler, webpack) seguem esses
  // especificadores em build-time e travam ao tentar empacotar o
  // onnxruntime-web dentro de um Cloudflare Worker.
  // O que quebra bundlers é um `import("onnxruntime-...")` que o
  // analisador estático consiga enxergar. Dentro de `new Function` o
  // especificador é apenas texto, invisível ao build.
  const semComentarios = codigo.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const linhas = semComentarios.split("\n").filter((l) => !l.includes("new Function"));
  assert.ok(!/\bimport\s*\(\s*["'`]onnxruntime/.test(linhas.join("\n")),
    "import() com literal de onnxruntime trava o build do Worker");
  assert.ok(codigo.includes("new Function"),
    "o runtime deve ser carregado de forma opaca ao bundler");
});

test("subpaths de edge não arrastam dependências pesadas", () => {
  // Um projeto em Cloudflare Workers importa /g2p ou /sintetizador; se
  // algum deles puxar onnxruntime ou @huggingface, o build do Worker
  // falha ou estoura o limite de tamanho.
  const proibidos = ["onnxruntime", "@huggingface", "sharp"];
  const arquivos = [
    "../src/g2p/index.js", "../src/g2p/normalize.js", "../src/g2p/numbers.js",
    "../src/g2p/lexicon.js", "../src/sintetizador.js", "../src/splitter.js",
    "../src/audio.js", "../src/dsp/trato.js", "../src/dsp/filtros.js",
    "../src/dsp/fontes.js", "../src/dsp/fonemas.js",
  ];
  for (const rel of arquivos) {
    const codigo = readFileSync(new URL(rel, import.meta.url), "utf8");
    for (const p of proibidos) {
      assert.ok(!codigo.includes(p), `${rel} referencia "${p}" — quebraria o edge`);
    }
  }
});

test("Piper expõe usarRuntime para bundlers restritivos", async () => {
  const mod = await import("../src/piper.js");
  assert.equal(typeof mod.usarRuntime, "function");
  assert.equal(typeof mod.Piper.usarRuntime, "function");
  // Injetar um runtime falso deve ser aceito sem tocar na rede.
  const falso = { InferenceSession: { create: async () => ({}) }, Tensor: class {} };
  assert.equal(mod.Piper.usarRuntime(falso), mod.Piper);
  mod.usarRuntime(null); // limpa para não afetar outros testes
});

test("nenhum módulo toca em globais de navegador ao ser importado", async () => {
  // Se um módulo acessar window/document no topo, o import quebra no SSR
  // (Next.js, Nuxt, SvelteKit) e no edge.
  for (const rel of ["../src/g2p/index.js", "../src/sintetizador.js",
                     "../src/piper.js", "../src/audio.js", "../src/splitter.js"]) {
    await assert.doesNotReject(() => import(rel), `${rel} falhou ao importar sem DOM`);
  }
});

test("runtime ONNX tem URL de CDN como alternativa (não exige instalação)", async () => {
  const mod = await import("../src/piper.js");
  // Sem essa URL, o Vite falha ao resolver o especificador "onnxruntime-web"
  // em runtime e o Piper fica inutilizável no navegador.
  assert.ok(typeof mod.ORT_CDN === "string" && mod.ORT_CDN.startsWith("https://"),
    "ORT_CDN deve ser uma URL absoluta");
  assert.ok(mod.ORT_CDN.includes("onnxruntime-web"), "ORT_CDN deve apontar para o onnxruntime-web");
  // Versão fixada: um "latest" quebraria o pacote sem aviso.
  assert.ok(/@\d+\.\d+\.\d+/.test(mod.ORT_CDN), "a versão do runtime deve estar fixada na URL");
});

test("piper.js resolve o runtime sem depender do bundler", () => {
  const codigo = readFileSync(new URL("../src/piper.js", import.meta.url), "utf8");
  // No navegador o caminho precisa ser import por URL; import de pacote
  // exigiria que o bundler resolvesse "onnxruntime-web", que é justamente
  // o que falha no Vite.
  assert.ok(codigo.includes("urlCdn") || codigo.includes("ORT_CDN"),
    "deve haver caminho de carregamento por URL");
  assert.ok(codigo.includes("globalThis.ort"),
    "deve reconhecer o runtime carregado por <script>");
});
