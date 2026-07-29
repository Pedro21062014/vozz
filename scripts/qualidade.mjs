/**
 * Relatório de qualidade do sintetizador.
 *
 *   npm run qualidade
 *
 * Roda a bateria completa de medições acústicas e imprime o placar. Serve
 * como referência antes e depois de qualquer mudança no motor.
 */
import { execFileSync } from "node:child_process";
import { Sintetizador } from "../src/sintetizador.js";

const FRASES = [
  "A raposa marrom saltou sobre o cachorro preguiçoso na tarde de domingo.",
  "Hoje o tempo está bom para caminhar no parque com as crianças.",
  "Preciso comprar pão, leite e café antes que o mercado feche.",
  "Você poderia repetir a pergunta, por favor?",
  "O trabalho dele é muito importante para toda a equipe.",
];

const tts = new Sintetizador();
let somaOk = 0, somaTotal = 0;

console.log("=".repeat(64));
console.log("RELATÓRIO DE QUALIDADE — motor de síntese por formantes");
console.log("=".repeat(64));

for (const [i, frase] of FRASES.entries()) {
  const audio = tts.falar(frase);
  const arq = `/tmp/qual_${i}.wav`;
  await audio.salvar(arq);

  const saida = execFileSync("python3", ["scripts/analisar.py", arq], { encoding: "utf8" });
  const linhas = saida.split("\n").filter((l) => l.includes("[OK") || l.includes("[RUIM"));
  const ok = linhas.filter((l) => l.includes("[OK")).length;
  somaOk += ok;
  somaTotal += linhas.length;

  console.log(`\n"${frase.slice(0, 52)}${frase.length > 52 ? "..." : ""}"`);
  console.log(`  ${ok}/${linhas.length} critérios | ${audio.duracao.toFixed(2)}s`);
  for (const l of linhas.filter((x) => x.includes("[RUIM"))) {
    console.log(`  ${l.trim()}`);
  }
}

console.log("\n" + "=".repeat(64));
console.log(`TOTAL: ${somaOk}/${somaTotal} critérios acústicos aprovados ` +
            `(${((somaOk / somaTotal) * 100).toFixed(0)}%)`);
console.log("=".repeat(64));

// Velocidade
const t0 = Date.now();
const longo = tts.falar(FRASES.join(" "));
const dt = (Date.now() - t0) / 1000;
console.log(`\nDesempenho: ${longo.duracao.toFixed(1)}s de áudio em ${dt.toFixed(2)}s ` +
            `= ${(longo.duracao / dt).toFixed(0)}x tempo real`);
