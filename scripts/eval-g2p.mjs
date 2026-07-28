/**
 * Avalia o G2P puro-JS contra o corpus de referência (espeak-ng pt-br).
 * Métrica: PER (phoneme error rate) via distância de Levenshtein.
 */
import { readFileSync } from "node:fs";
import { fonemizar } from "../src/g2p/index.js";

const corpus = JSON.parse(readFileSync(new URL("../test/corpus.json", import.meta.url), "utf8"));

/** Normaliza diferenças notacionais irrelevantes para o modelo. */
function canon(s) {
  return s
    .normalize("NFD")
    .replace(/\u02CC/g, "")            // ignora acento secundário (não muda a fala)
    .replace(/\s+/g, " ")
    .replace(/g/g, "ɡ")
    .trim();
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  const cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur.slice();
  }
  return prev[n];
}

let totDist = 0, totLen = 0, exatos = 0;
const piores = [];

for (const it of corpus) {
  const obtido = fonemizar(it.texto);
  const a = canon(obtido), b = canon(it.esperado);
  const d = lev([...a], [...b]);
  totDist += d;
  totLen += b.length;
  if (a === b) exatos++;
  else piores.push({ texto: it.texto, esperado: it.esperado, obtido, d, rel: d / Math.max(1, b.length) });
}

piores.sort((x, y) => y.rel - x.rel);

const per = (totDist / totLen) * 100;
console.log(`itens:        ${corpus.length}`);
console.log(`match exato:  ${exatos} (${((exatos / corpus.length) * 100).toFixed(1)}%)`);
console.log(`PER:          ${per.toFixed(2)}%`);
console.log(`acurácia:     ${(100 - per).toFixed(2)}%`);
console.log("\n--- 25 piores ---");
for (const p of piores.slice(0, 25)) {
  console.log(`${p.texto}\n  esperado: ${p.esperado}\n  obtido:   ${p.obtido}\n`);
}
