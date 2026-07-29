# vozz

**TTS ultrarrealista em português do Brasil, 100% offline no navegador.**

Sem API key. Sem servidor. Sem custo por caractere. O modelo neural roda no
próprio dispositivo do usuário — o texto nunca sai da máquina.

```bash
npm install @pedrobef/vozz
```

[![CI](https://github.com/Pedro21062014/vozz/actions/workflows/ci.yml/badge.svg)](https://github.com/Pedro21062014/vozz/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@pedrobef/vozz.svg)](https://www.npmjs.com/package/@pedrobef/vozz)
[![licença](https://img.shields.io/badge/licen%C3%A7a-Apache--2.0-blue.svg)](./LICENSE)

```js
import { Vozz } from "@pedrobef/vozz";

const tts = await Vozz.carregar();
const audio = await tts.falar("Olá! Tudo bem com você?");
audio.tocar();
```

É isso. Três linhas.

---

## Por que este pacote existe

Já existem bibliotecas JS que rodam o modelo Kokoro no navegador — mas **nenhuma
delas fala português**. A razão é técnica:

O modelo não recebe letras, recebe **fonemas IPA**. Para gerar esses fonemas
usa-se o `espeak-ng`, que em JS só existe compilado para inglês
(`phonemizer` aceita apenas `en`, `en-us`, `en-gb`…). Sem fonemizador de
português, as vozes `pf_dora`, `pm_alex` e `pm_santa` — que existem nos pesos
do modelo — ficam inacessíveis. Passar texto português por um fonemizador
inglês produz sotaque grotesco:

```
"Eu sou a Dora"
  fonemizador inglês →  ˌiːjˈuː sˈuː ɐ dˈoːɹə     ✗ "iiu su a dôra"
  vozz               →  ˈeʊ sˈoʊ a dˈoɾæ          ✓
```

O `vozz` resolve isso com um **conversor grafema→fonema (G2P) de português
brasileiro escrito em JavaScript puro** — sem WASM, sem download extra, sem
binário nativo. Ele implementa silabificação, regras de acentuação tônica,
nasalização, palatalização de /d/ e /t/, vocalização do /l/ em coda, vibrante
múltipla, redução de vogais átonas finais e sândi entre palavras.

**Fidelidade medida:** 94,97% contra o `espeak-ng pt-br` (PER de 5,03% em um
corpus de 319 palavras e frases) — e o `espeak-ng pt-br` é exatamente o
fonemizador com que o modelo foi treinado. O teste está em `npm test`.

---

## Três motores

| | `vozz/piper` ⭐ | `vozz` (Kokoro) | `vozz/sintetizador` |
| --- | --- | --- | --- |
| Qualidade | **voz natural pt-BR** | natural (multilíngue) | robótica |
| Download | 18,7 MB | ~86 MB | **nenhum** |
| Velocidade | ~2x tempo real | ~1x | **~70x** |
| Onde roda | navegador (Pages/estático) | navegador, Node | **qualquer lugar** |

**O `piper` é a recomendação para pt-BR**: modelo VITS quantizado em int8,
treinado especificamente em português brasileiro. Baixa 18,7 MB uma vez, fica
no cache do navegador e sintetiza no dispositivo do usuário.

```js
import { Piper } from "@pedrobef/vozz/piper";

const tts = await Piper.carregar({
  aoProgredir: (p) => console.log(`${Math.round(p.progresso * 100)}%`),
});

const audio = await tts.falar("Olá! Tudo bem com você?");
audio.tocar();
```

```bash
npm i @pedrobef/vozz
```

O runtime ONNX é resolvido sozinho: se o `onnxruntime-web` não estiver
instalado, o pacote importa o build ESM do CDN por URL absoluta. Não há
nada para configurar no Vite, no Next ou no Astro.

### Deploy em Cloudflare Pages

Hospedagem estática pura — não há backend, porque a síntese roda no navegador:

```bash
npm run build:pages
npx wrangler pages deploy dist-pages --project-name vozz
```

O build sai com ~150 KB: o modelo vem do jsDelivr, que já entrega com CORS e
cache de CDN. Para servir o modelo do próprio domínio (evitando dependência
externa), use `npm run build:pages -- --com-modelo`.

O arquivo `pages/_headers` já traz `COOP`/`COEP`, que liberam WASM
multi-thread e aceleram a inferência. Sem eles funciona igual, só mais devagar.

### Backend de inferência

O `dispositivo` padrão é `"auto"`. Como o modelo é quantizado em int8, o
pacote escolhe **WASM**: o backend WebGPU do onnxruntime-web não implementa
`ConvInteger` nem `DynamicQuantizeLinear`, e a sessão falharia ao ser criada.

A detecção é automática — não há nada a configurar. Para forçar:

```js
await Piper.carregar({ dispositivo: "wasm" });  // padrão para modelos int8
```

WebGPU só acelera modelos em fp32/fp16. Se você quantizar uma versão fp16 do
Piper, o pacote passa a usar a GPU sozinho.

### Servindo o modelo de outro lugar

```js
await Piper.carregar({ cdn: "/modelo" });          // mesmo domínio
await Piper.carregar({ urlModelo: "https://..." }); // URL completa
```

### Compatibilidade com plataformas

Verificado com builds reais (esbuild) e execução no `workerd`, o runtime de
produção do Cloudflare:

| | Navegador | Cloudflare Workers / Pages Functions | Node / SSR |
| --- | --- | --- | --- |
| `vozz/g2p` | ✅ | ✅ | ✅ |
| `vozz/sintetizador` | ✅ | ✅ | ✅ |
| `vozz/piper` | ✅ | ✅ importa; síntese no cliente | ✅ |

Nenhum módulo toca em `window` ao ser importado, então o pacote é seguro em
SSR (Next.js, Nuxt, SvelteKit, Astro).

Se o seu bundler bloquear o import dinâmico do runtime ONNX — o caso do
Cloudflare Workers —, injete-o explicitamente:

```js
import { Piper } from "@pedrobef/vozz/piper";
import * as ort from "onnxruntime-web";
Piper.usarRuntime(ort);
```

Exemplos prontos para Next.js, Vite, Astro, Workers e Node em
[`exemplos/README.md`](./exemplos/README.md).

## Outros motores



O pacote traz dois motores de síntese. Eles resolvem problemas diferentes:

| | `vozz` (neural) | `vozz/sintetizador` (código) |
| --- | --- | --- |
| Qualidade | ultrarrealista | robótica, inteligível |
| Download | ~86 MB (uma vez) | **nenhum** |
| Dependências | `@huggingface/transformers` | **nenhuma** |
| Velocidade | ~1x tempo real (WASM) | **~50x tempo real** |
| Onde roda | navegador, Node | **qualquer lugar**, inclusive Workers/edge |
| Latência inicial | segundos (baixar pesos) | **instantânea** |

```js
// Motor neural — quando a prioridade é soar humano
import { Vozz } from "@pedrobef/vozz";
const tts = await Vozz.carregar();
(await tts.falar("Olá!")).tocar();

// Motor em código — quando a prioridade é ser leve e rodar em qualquer lugar
import { Sintetizador } from "@pedrobef/vozz/sintetizador";
const tts = new Sintetizador();
tts.falar("Olá!").tocar();          // síncrono, sem await
```

O motor em código usa **síntese por formantes** (modelo fonte-filtro, na
linha do sintetizador de Klatt): as pregas vocais geram um pulso, uma cascata
de ressoadores reproduz as ressonâncias do trato vocal, e o áudio sai
calculado amostra a amostra.

Ele **não soa como uma pessoa** — soa como uma voz sintética clássica. Mas é
inteligível, e isso foi verificado por medição, não por impressão. O motor é
calibrado em malha fechada contra o perfil acústico da fala humana:

| Métrica | Fala humana | `vozz` |
| --- | --- | --- |
| Energia 300–1000 Hz | 25–50% | 34,6% |
| Energia 1000–3000 Hz (inteligibilidade) | 20–45% | 26,3% |
| Energia 3000–8000 Hz | 5–30% | 29,1% |
| Pausas e oclusivas | 18–42% | 28,3% |
| Inclinação espectral | −14 a −5 dB/oitava | −6,7 |
| Ritmo silábico | 2,5–7 Hz | 3,9 Hz |

**30/30 critérios aprovados** em 5 frases de teste (`npm run qualidade`).
As 7 vogais são acusticamente separáveis (distância mínima de 1,34 Bark, acima
do limiar de confusão perceptual), e o erro dos formantes em relação aos
valores de referência do português é de ~15% — contra 40% antes da calibração.

Os parâmetros do motor não foram escolhidos no ouvido: vieram de busca
automática (`npm run calibrar`) minimizando a distância para o perfil humano.

Vozes: `clara` (feminina), `bruno` (masculina), `grave` (masculina grave).

```js
tts.falar("Bom dia!", { voz: "bruno", velocidade: 1.2, entonacao: 1.5 });
```

## Vozes

| Voz     | Gênero    | Timbre                                          |
| ------- | --------- | ----------------------------------------------- |
| `dora`  | feminina  | Clara e natural. Narração, leitura, assistentes. |
| `alex`  | masculina | Neutra e equilibrada. Tutoriais, conteúdo geral. |
| `santa` | masculina | Mais grave e encorpada. Narração dramática.      |

```js
await tts.falar("Bom dia!", { voz: "alex", velocidade: 1.1 });
```

Aliases aceitos: `feminina`/`masculina`, `pf_dora`/`pm_alex`/`pm_santa`.

---

## Desempenho

| Item                     | Valor                                            |
| ------------------------ | ------------------------------------------------ |
| Pesos do modelo (int8)   | ~86 MB, baixados uma vez e mantidos em cache      |
| Embedding por voz        | ~520 KB                                           |
| Tamanho do pacote em si  | ~60 KB (o G2P é código, não dados)                |
| Latência (WebGPU)        | tempo real ou mais rápido                         |
| Latência (WASM, desktop) | ~1× tempo real                                    |
| Áudio                    | PCM mono 24 kHz                                   |

O backend é escolhido sozinho: **WebGPU** quando disponível, **WASM** como
alternativa. Para forçar: `Vozz.carregar({ dispositivo: "wasm" })`.

---

## Uso

### Barra de progresso no primeiro carregamento

```js
const tts = await Vozz.carregar({
  aoProgredir: ({ status, progresso }) => {
    console.log(status, Math.round((progresso ?? 0) * 100) + "%");
  },
});
```

### Streaming — comece a tocar sem esperar o texto todo

```js
for await (const { texto, audio } of tts.falarEmFluxo(textoLongo, { voz: "dora" })) {
  console.log("tocando:", texto);
  await audio.tocar();
}
```

### Ler a resposta de um LLM em tempo real

```js
import { DivisorDeTexto } from "@pedrobef/vozz";

const divisor = new DivisorDeTexto();

(async () => {
  for await (const { audio } of tts.falarEmFluxo(divisor)) await audio.tocar();
})();

for await (const token of respostaDoLLM) divisor.empurrar(token);
divisor.fechar();
```

O divisor acumula tokens e libera **sentenças completas**, evitando prosódia
picotada no meio da frase.

### Baixar / salvar

```js
const audio = await tts.falar("Olá!");
audio.paraWav();          // ArrayBuffer (WAV PCM 16-bit)
audio.paraBlob();         // Blob audio/wav
audio.paraURL();          // object URL para <audio src>
await audio.salvar("ola.wav"); // baixa no navegador, grava em disco no Node
audio.duracao;            // segundos
```

### Atalho de uma linha

```js
import { falar } from "@pedrobef/vozz";
(await falar("Olá, mundo!")).tocar();  // carrega na 1ª chamada e reusa
```

---

## Normalização automática

O texto é preparado antes de virar fala:

| Entrada       | Falado como                              |
| ------------- | ---------------------------------------- |
| `R$ 1.234,56` | mil duzentos e trinta e quatro reais e cinquenta e seis centavos |
| `14h30`       | quatorze horas e trinta minutos          |
| `07/09/2025`  | sete de setembro de dois mil e vinte e cinco |
| `23°C`        | vinte e três graus celsius               |
| `15%`         | quinze por cento                         |
| `1º`          | primeiro                                 |
| `Dr. Silva`   | doutor Silva                             |
| `IBGE`        | i-bê-gê-é                                |
| `ONU`         | onu (sigla pronunciável)                 |

Para desligar: `tts.falar(texto, { normalizar: false })`.

---

## Pronúncia customizada

Nomes próprios, termos técnicos e estrangeirismos:

```js
await tts.falar("Rodamos em Kubernetes.", {
  lexico: { kubernetes: "kubeɾnˈetʃis" },
});
```

Para descobrir o IPA de qualquer texto sem sintetizar:

```js
Vozz.fonemizar("Olá, tudo bem?");  // "olˈa, tˈudʊ bˈeɪ̃ŋ?"
```

O G2P também é importável sozinho — sem carregar o modelo, sem rede,
útil para lipsync, visemas ou legendas fonéticas:

```js
import { fonemizar, silabificar } from "@pedrobef/vozz/g2p";
```

---

## Notas de integração

**Bundlers.** O pacote é ESM puro. Vite/Next/Webpack funcionam direto. Em
projetos com SSR, carregue no cliente: `const { Vozz } = await import("@pedrobef/vozz")`.

**Dependências nativas (`onnxruntime-node`, `sharp`).** Elas aparecem na árvore
do `npm ls` porque vêm dentro do `@huggingface/transformers`, mas **não vão para
o bundle do navegador**: o transformers.js usa *exports condicionais* e resolve
para a build web, marcando esses módulos como ignorados. Verificado com esbuild
em `--platform=browser` — o bundle sai com `onnxruntime-node (ignored)` e
`sharp (ignored)`, sem binário nativo.

**Cloudflare Workers / edge.** O runtime de edge não tem WebGPU nem WASM
threads, então a *síntese* não roda lá — ela é feita no dispositivo do usuário,
que é justamente a proposta do pacote. O que roda perfeitamente no edge é o
fonemizador, que é JS puro e não importa nada:

```js
import { fonemizar } from "@pedrobef/vozz/g2p"; // zero dependências
```

**COOP/COEP.** Não são obrigatórios. Ative-os apenas se quiser WASM
multi-thread (mais velocidade):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Node.js.** Funciona (≥18) para gerar arquivos em lote — use
`dispositivo: "cpu"` e `audio.salvar()`.

**Offline total.** Os pesos vêm do Hugging Face na primeira execução. Para
ambientes sem internet, hospede o repositório e aponte `repo`.

---

## API

| Símbolo                          | Descrição                                       |
| -------------------------------- | ----------------------------------------------- |
| `Vozz.carregar(opcoes?)`         | Baixa e inicializa o modelo.                     |
| `Vozz.vozes()`                   | Lista as vozes disponíveis.                      |
| `Vozz.fonemizar(texto, opcoes?)` | Texto → IPA, sem sintetizar.                     |
| `tts.falar(texto, opcoes?)`      | Sintetiza tudo. Devolve `Audio`.                 |
| `tts.falarEmFluxo(entrada, o?)`  | Gera sentença a sentença (async generator).      |
| `falar(texto, opcoes?)`          | Atalho com instância única.                      |
| `preAquecer(opcoes?)`            | Pré-carrega o modelo.                            |
| `DivisorDeTexto`                 | Divisor incremental de sentenças.                |
| `Audio`                          | `tocar`, `parar`, `salvar`, `paraWav/Blob/URL`.  |

Tipos TypeScript inclusos.

---

## Demo

```bash
npm run demo    # gera WAVs no Node
npm run serve   # abre a demo do navegador em http://localhost:8080
npm test        # 17 testes, incluindo a métrica de fidelidade do G2P
```

---

## Licença

Apache-2.0 — código e pesos (Kokoro-82M, `hexgrad`). Uso comercial liberado.
