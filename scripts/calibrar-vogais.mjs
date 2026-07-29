/**
 * Calibra a tabela de formantes das vogais.
 *
 * O problema: a cascata de ressoadores desloca ligeiramente os picos em
 * relação às frequências dos polos (interação entre formantes vizinhos e
 * efeito da radiação). Então declarar "F1 = 300" não garante que o LPC
 * meça 300 na saída.
 *
 * A solução: medir o que sai, comparar com o alvo fonético e corrigir a
 * frequência declarada na direção oposta ao erro. Repetimos até convergir.
 * É calibração em malha fechada — o mesmo princípio de ajustar um
 * instrumento comparando-o com um padrão.
 *
 *   node scripts/calibrar-vogais.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { sintetizarIPA, VOZES_CODIGO } from "../src/sintetizador.js";
import { FONEMAS } from "../src/dsp/fonemas.js";

/**
 * Alvos de F1/F2 para vogais tônicas do português brasileiro.
 * Valores de referência da literatura de fonética acústica (falante feminino
 * adulto; o motor escala para as demais vozes).
 */
const ALVOS = {
  i:   [320, 2350],
  e:   [420, 2100],
  "ɛ": [560, 1900],
  a:   [760, 1400],
  "ɔ": [580, 1000],
  o:   [450, 850],
  u:   [340, 750],
  "ɐ": [620, 1450],
  æ:   [650, 1500],
  "ʊ": [400, 950],
  "ɪ": [380, 2150],
  y:   [360, 2150],
  "ə": [500, 1500],
};

function medir(caminho) {
  const saida = execFileSync("python3", ["scripts/medir_formantes.py", caminho], { encoding: "utf8" });
  return JSON.parse(saida);
}

async function medirVogal(simbolo, f1, f2) {
  // Sobrescreve temporariamente a entrada da tabela.
  const orig = { ...FONEMAS[simbolo] };
  FONEMAS[simbolo] = { ...orig, f1, f2 };
  const audio = sintetizarIPA(simbolo.repeat(7), {
    vozConfig: { ...VOZES_CODIGO.clara, escalaFormante: 1 },
  });
  const arq = `/tmp/vog_${encodeURIComponent(simbolo)}.wav`;
  await audio.salvar(arq);
  FONEMAS[simbolo] = orig;
  return medir(arq);
}

const resultado = {};
console.log("calibrando formantes das vogais (malha fechada)\n");

for (const [simbolo, [alvoF1, alvoF2]] of Object.entries(ALVOS)) {
  if (!FONEMAS[simbolo]) continue;
  // Parte do valor atual da tabela.
  let f1 = FONEMAS[simbolo].f1;
  let f2 = FONEMAS[simbolo].f2;
  let melhor = null;

  for (let iter = 0; iter < 14; iter++) {
    const m = await medirVogal(simbolo, f1, f2);
    if (!m.f1 || !m.f2) break;
    const e1 = (m.f1 - alvoF1) / alvoF1;
    const e2 = (m.f2 - alvoF2) / alvoF2;
    const erro = Math.abs(e1) + Math.abs(e2);
    if (!melhor || erro < melhor.erro) {
      melhor = { f1: Math.round(f1), f2: Math.round(f2), erro, m1: m.f1, m2: m.f2 };
    }
    if (erro < 0.05) break;
    // Correção proporcional ao erro, com passo amortecido para não oscilar.
    f1 -= f1 * e1 * 0.7;
    f2 -= f2 * e2 * 0.7;
    f1 = Math.max(200, Math.min(1000, f1));
    f2 = Math.max(550, Math.min(2900, f2));
  }

  if (melhor) {
    resultado[simbolo] = { f1: melhor.f1, f2: melhor.f2 };
    const pct1 = (100 * Math.abs(melhor.m1 - alvoF1) / alvoF1).toFixed(1);
    const pct2 = (100 * Math.abs(melhor.m2 - alvoF2) / alvoF2).toFixed(1);
    console.log(
      `[${simbolo}] declarar F1=${melhor.f1} F2=${melhor.f2}  ` +
      `-> mede ${melhor.m1}/${melhor.m2}  (alvo ${alvoF1}/${alvoF2}, erro ${pct1}%/${pct2}%)`,
    );
  }
}

writeFileSync("/tmp/vogais-calibradas.json", JSON.stringify(resultado, null, 1));
console.log("\nsalvo em /tmp/vogais-calibradas.json");
