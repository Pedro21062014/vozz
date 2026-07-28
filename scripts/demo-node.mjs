/**
 * Demo em Node: gera amostras .wav para cada voz.
 *
 *   npm run demo
 *
 * No navegador o backend é WebGPU/WASM; aqui usamos CPU.
 */

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Vozz } from "../src/index.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = join(RAIZ, "examples");

const AMOSTRAS = [
  ["dora", "Olá! Eu sou a Dora. Esta voz roda cem por cento no seu navegador, sem nenhuma API."],
  ["alex", "Bom dia! São 14h30 e a temperatura em Pindamonhangaba é de 23°C."],
  ["santa", "O pacote custa R$ 0,00 e processa 1.500 caracteres por segundo."],
];

await mkdir(SAIDA, { recursive: true });

console.time("carregar modelo");
const tts = await Vozz.carregar({ dispositivo: "cpu" });
console.timeEnd("carregar modelo");

for (const [voz, texto] of AMOSTRAS) {
  console.log(`\n[${voz}] ${texto}`);
  console.log(`  IPA: ${Vozz.fonemizar(texto)}`);

  const inicio = Date.now();
  const audio = await tts.falar(texto, { voz });
  const decorrido = (Date.now() - inicio) / 1000;

  const destino = join(SAIDA, `amostra-${voz}.wav`);
  await audio.salvar(destino);

  console.log(
    `  ${audio.duracao.toFixed(2)}s de áudio em ${decorrido.toFixed(2)}s ` +
    `(${(audio.duracao / decorrido).toFixed(2)}× tempo real) -> ${destino}`,
  );
}
