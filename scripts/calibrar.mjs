/**
 * Calibração automática do sintetizador.
 *
 * Em vez de ajustar ganhos no olho, varremos o espaço de parâmetros e
 * escolhemos a combinação cuja saída fica mais próxima do perfil acústico da
 * fala humana. A função de custo penaliza desvio em cada métrica.
 *
 *   node scripts/calibrar.mjs
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { sintetizarIPA, VOZES_CODIGO } from "../src/sintetizador.js";
import { fonemizar } from "../src/g2p/index.js";

const FRASES = [
  "A raposa marrom saltou sobre o cachorro preguiçoso na tarde de domingo.",
  "Hoje o tempo está bom para caminhar no parque com as crianças.",
  "Preciso comprar pão, leite e café antes que o mercado feche.",
];

/** Faixas-alvo medidas em fala humana. */
const ALVO = {
  b300_1000: [25, 50],
  b1000_3000: [20, 45],
  b3000_8000: [5, 30],
  silencio: [18, 42],
  inclinacao: [-14, -5],
  modulacao: [2.5, 7.0],
};

function custoFaixa(valor, [lo, hi]) {
  if (valor == null) return 10;
  if (valor >= lo && valor <= hi) return 0;
  const alvo = valor < lo ? lo : hi;
  return Math.abs(valor - alvo) / Math.max(1, Math.abs(hi - lo)) ;
}

function medir(caminho) {
  const saida = execFileSync("python3", ["scripts/medir_json.py", caminho], { encoding: "utf8" });
  return JSON.parse(saida);
}

function custo(m) {
  const b = m.bandas;
  return (
    custoFaixa(b["300-1000"], ALVO.b300_1000) * 1.2 +
    custoFaixa(b["1000-3000"], ALVO.b1000_3000) * 2.0 +   // inteligibilidade
    custoFaixa(b["3000-8000"], ALVO.b3000_8000) * 1.5 +
    custoFaixa(m.silencio, ALVO.silencio) * 0.8 +
    custoFaixa(m.inclinacao, ALVO.inclinacao) * 1.2 +
    custoFaixa(m.modulacao, ALVO.modulacao) * 0.8
  );
}

async function avaliar(params) {
  globalThis.__VOZZ_CAL = params;
  let total = 0;
  for (let i = 0; i < FRASES.length; i++) {
    const ipa = fonemizar(FRASES[i]);
    const audio = sintetizarIPA(ipa, { vozConfig: VOZES_CODIGO.clara });
    const arq = `/tmp/cal_${i}.wav`;
    await audio.salvar(arq);
    total += custo(medir(arq));
  }
  return total / FRASES.length;
}

const GRADE = {
  ganhoFricativa: [0.16, 0.22, 0.28, 0.34],
  ganhoOclusiva: [0.20, 0.28, 0.36],
  tiltCorte1: [1400, 2000, 2800],
  tiltPeso1: [0.9, 1.2, 1.5],
  tiltPeso2: [0.4, 0.7, 1.0],
  radiacao: [0.62, 0.74, 0.86],
};

const nomes = Object.keys(GRADE);
let melhor = null;

// Busca coordenada: otimiza um parâmetro por vez, repetindo em passadas.
let atual = Object.fromEntries(nomes.map((n) => [n, GRADE[n][Math.floor(GRADE[n].length / 2)]]));
let custoAtual = await avaliar(atual);
console.log("inicial:", custoAtual.toFixed(3), JSON.stringify(atual));

for (let passada = 0; passada < 3; passada++) {
  let melhorou = false;
  for (const nome of nomes) {
    for (const v of GRADE[nome]) {
      if (v === atual[nome]) continue;
      const cand = { ...atual, [nome]: v };
      const c = await avaliar(cand);
      if (c < custoAtual - 1e-4) {
        custoAtual = c; atual = cand; melhorou = true;
        console.log(`  ${nome}=${v} -> custo ${c.toFixed(3)}`);
      }
    }
  }
  if (!melhorou) break;
}

melhor = { custo: custoAtual, params: atual };
console.log("\nMELHOR:", JSON.stringify(melhor, null, 1));
writeFileSync("/tmp/calibracao.json", JSON.stringify(melhor, null, 1));
