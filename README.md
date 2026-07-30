<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/vozz-logo-dark.png">
  <img src="./assets/vozz-logo-light.png" alt="vozz" width="440">
</picture>

**Voz neural em português do Brasil, direto no navegador.**

Sem API key. Sem servidor. Sem custo por caractere.

[![npm](https://img.shields.io/npm/v/@pedrobef/vozz?color=7ac943&label=npm)](https://www.npmjs.com/package/@pedrobef/vozz)
[![CI](https://github.com/Pedro21062014/vozz/actions/workflows/ci.yml/badge.svg)](https://github.com/Pedro21062014/vozz/actions/workflows/ci.yml)
[![licença](https://img.shields.io/badge/licença-Apache--2.0-blue.svg)](./LICENSE)

</div>

---

```bash
npm install @pedrobef/vozz
```

```js
import { Piper } from "@pedrobef/vozz/piper";

const tts = await Piper.carregar();
const audio = await tts.falar("Olá! Tudo bem com você?");
audio.tocar();
```

Três linhas. O texto nunca sai do dispositivo do usuário.

---

## Índice

- [Por que existe](#por-que-existe)
- [Os três motores](#os-três-motores)
- [Começando](#começando)
- [Receitas por framework](#receitas-por-framework)
- [API](#api)
- [Problemas comuns](#problemas-comuns) ← **comece por aqui se algo falhou**
- [Quanto pesa](#quanto-pesa)

---

## Por que existe

Já havia bibliotecas de TTS neural em JavaScript, mas **nenhuma falava
português**. O motivo é técnico: modelos de voz não recebem letras, recebem
**fonemas IPA**. O fonemizador disponível em JS (`phonemizer`) só traz inglês
compilado:

```js
phonemize("Olá", "pt-br")
// Erro: Invalid language identifier. Should be one of: en, en-us, en-gb...
```

Sem fonemizador de português, passar texto brasileiro por um motor inglês
produz sotaque grotesco:

```
"Eu sou a Dora"
  fonemizador inglês →  ˌiːjˈuː sˈuː ɐ dˈoːɹə     ✗  "iiu su a dôra"
  vozz               →  ˈeʊ sˈoʊ a dˈoɾæ          ✓
```

O núcleo do `vozz` é um **conversor grafema→fonema (G2P) de português
brasileiro escrito em JavaScript puro** — sem WASM, sem binário nativo, sem
rede. Ele implementa silabificação, acentuação tônica, nasalização,
palatalização de /d/ e /t/, vocalização do /l/ em coda, vibrante múltipla,
redução de vogais átonas e sândi entre palavras.

**Fidelidade medida:** 94,97% contra o `espeak-ng pt-br` (PER de 5,03% em
319 palavras e frases). O teste roda em `npm test`.

---

## Os três motores

| | `piper` ⭐ | `index` (Kokoro) | `sintetizador` |
| --- | --- | --- | --- |
| **Qualidade** | voz natural pt-BR | natural, multilíngue | robótica |
| **Download** | 18,7 MB | ~86 MB | **nada** |
| **Velocidade** | ~2× tempo real | ~1× | **~70×** |
| **Navegador** | ✅ | ✅ | ✅ |
| **Workers / edge** | importa apenas¹ | ❌ | ✅ **executa** |
| **Node / SSR** | ✅ | ✅ | ✅ |

<sub>¹ O Piper precisa de ~11 MB de WASM + 18,7 MB de modelo, o que estoura o
limite de memória do edge. Por design, a síntese neural roda no dispositivo do
usuário — onde é gratuita e escala sozinha.</sub>

**Escolha rápida:** quer voz boa em pt-BR? `piper`. Precisa rodar dentro de um
Worker ou não pode baixar nada? `sintetizador`. Só precisa dos fonemas
(lipsync, legendas, visemas)? `g2p`.

---

## Começando

### Voz neural (recomendado)

```js
import { Piper } from "@pedrobef/vozz/piper";

const tts = await Piper.carregar({
  aoProgredir: (p) => {
    if (p.status === "baixando") {
      console.log(`${Math.round(p.progresso * 100)}% — ${p.arquivo}`);
    }
  },
});

const audio = await tts.falar("Bom dia! Hoje são 14h30.", { velocidade: 1.1 });
audio.tocar();
```

O modelo baixa **uma vez** e fica na Cache API do navegador. Visitas seguintes
carregam instantaneamente.

### Streaming — tocar sem esperar o texto inteiro

```js
for await (const { texto, audio } of tts.falarEmFluxo(textoLongo)) {
  console.log("tocando:", texto);
  await audio.tocar();
}
```

### Ler a resposta de um LLM em tempo real

```js
import { DivisorDeTexto } from "@pedrobef/vozz/piper";

const divisor = new DivisorDeTexto();

(async () => {
  for await (const { audio } of tts.falarEmFluxo(divisor)) await audio.tocar();
})();

for await (const token of respostaDoLLM) divisor.empurrar(token);
divisor.fechar();
```

O divisor acumula tokens e libera **frases completas** — evita prosódia
picotada no meio da sentença.

### Sem download nenhum (roda até no edge)

```js
import { Sintetizador } from "@pedrobef/vozz/sintetizador";

const tts = new Sintetizador();          // sem await: não há I/O
const audio = tts.falar("Olá!", { voz: "clara" });
audio.tocar();
```

Vozes: `clara` (feminina), `bruno` (masculina), `grave` (narração).

### Só os fonemas

```js
import { fonemizar } from "@pedrobef/vozz/g2p";

fonemizar("Olá, tudo bem?");        // "olˈa, tˈudʊ bˈeɪŋ?"
fonemizar("Custa R$ 25,50 às 9h");  // números e moeda já expandidos
```

Zero dependências, ~36 kB. Útil para lipsync, visemas e legendas fonéticas.

### Salvar e exportar

```js
const audio = await tts.falar("Olá!");

audio.duracao;              // segundos
audio.paraWav();            // ArrayBuffer (WAV PCM 16-bit)
audio.paraBlob();           // Blob audio/wav
audio.paraURL();            // object URL para <audio src>
await audio.salvar("ola.wav");  // baixa no navegador, grava em disco no Node
```

### Normalização automática

O texto é preparado antes de virar fala:

| Entrada | Falado como |
| --- | --- |
| `R$ 1.234,56` | mil duzentos e trinta e quatro reais e cinquenta e seis centavos |
| `14h30` | quatorze horas e trinta minutos |
| `07/09/2025` | sete de setembro de dois mil e vinte e cinco |
| `23°C` | vinte e três graus celsius |
| `15%` | quinze por cento |
| `1º` | primeiro |
| `Dr. Silva` | doutor Silva |
| `IBGE` | i-bê-gê-é |

Desligar: `tts.falar(texto, { normalizar: false })`.

### Pronúncia customizada

```js
await tts.falar("Rodamos em Kubernetes.", {
  lexico: { kubernetes: "kubeɾnˈetʃis" },
});
```

Para descobrir o IPA de qualquer texto: `Piper.fonemizar("...")`.

---

## Receitas por framework

### Next.js (Vercel)

O Piper só existe no cliente:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";

export default function BotaoFalar() {
  const tts = useRef<any>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    (async () => {
      const { Piper } = await import("@pedrobef/vozz/piper");
      tts.current = await Piper.carregar();
      setPronto(true);
    })();
  }, []);

  return (
    <button disabled={!pronto} onClick={async () => (await tts.current.falar("Olá!")).tocar()}>
      {pronto ? "Falar" : "Carregando..."}
    </button>
  );
}
```

### Vite / React / Astro / SvelteKit

```js
import { Piper } from "@pedrobef/vozz/piper";
const tts = await Piper.carregar();
(await tts.falar("Olá!")).tocar();
```

Sem `optimizeDeps`, sem config, sem instalar `onnxruntime-web`.

### Cloudflare Pages

Site estático comum — a síntese roda no navegador, então não há backend.
Faça o deploy normalmente; nenhuma configuração especial é necessária.

### Cloudflare Workers / Pages Functions

No edge funcionam o G2P e o sintetizador (JS puro, sem dependências):

```js
import { Sintetizador } from "@pedrobef/vozz/sintetizador";

export default {
  fetch(request) {
    const texto = new URL(request.url).searchParams.get("t") ?? "Olá!";
    const audio = new Sintetizador().falar(texto);
    return new Response(audio.paraWav(), {
      headers: { "content-type": "audio/wav" },
    });
  },
};
```

### Node (gerar arquivos em lote)

```bash
npm i @pedrobef/vozz onnxruntime-node
```

```js
import { Piper } from "@pedrobef/vozz/piper";
const tts = await Piper.carregar();
await (await tts.falar("Olá!")).salvar("saida.wav");
```

### Deno / Bun

```js
import { fonemizar } from "npm:@pedrobef/vozz/g2p";
```

Mais exemplos em [`exemplos/README.md`](./exemplos/README.md).

---

## API

| Símbolo | Descrição |
| --- | --- |
| `Piper.carregar(opcoes?)` | Baixa o modelo e inicializa. Devolve `Piper`. |
| `Piper.fonemizar(texto)` | Texto → IPA, sem sintetizar. |
| `Piper.usarRuntime(ort)` | Injeta o runtime ONNX manualmente. |
| `Piper.limparCache()` | Remove o modelo do cache do navegador. |
| `tts.falar(texto, opcoes?)` | Sintetiza tudo. Devolve `Audio`. |
| `tts.falarEmFluxo(entrada, o?)` | Gera frase a frase (async generator). |
| `new Sintetizador(opcoes?)` | Motor por formantes, síncrono. |
| `fonemizar(texto, opcoes?)` | G2P puro (`@pedrobef/vozz/g2p`). |
| `DivisorDeTexto` | Divisor incremental para saída de LLM. |
| `Audio` | `tocar`, `parar`, `salvar`, `paraWav/Blob/URL`, `duracao`. |

**Opções de `carregar`:** `dispositivo` (`auto`/`wasm`/`webgpu`), `cdn`,
`urlModelo`, `urlConfig`, `urlRuntime`, `cache`, `aoProgredir`.

**Opções de `falar`:** `velocidade` (0.5–2), `ruido` (expressividade),
`ruidoW`, `lexico`, `normalizar`.

Tipos TypeScript inclusos.

---

## Problemas comuns

<details>
<summary><b>"Vite não consegue resolver o specifier onnxruntime-web"</b></summary>

<br>

Corrigido na **0.2.2**. Atualize:

```bash
npm i @pedrobef/vozz@latest
```

O runtime agora é importado do CDN por URL absoluta, que o navegador resolve
sozinho — nenhum bundler precisa resolvê-lo. Não é preciso instalar
`onnxruntime-web` nem mexer em `optimizeDeps`.

Se você usa uma CSP restritiva, veja *"CSP bloqueando o CDN"* abaixo.

</details>

<details>
<summary><b>"no available backend found" / a sessão não é criada</b></summary>

<br>

Corrigido na **0.2.3**. Atualize:

```bash
npm i @pedrobef/vozz@latest
```

**O que acontecia:** o modelo é quantizado em int8 e usa os operadores
`ConvInteger` e `DynamicQuantizeLinear`. O backend WebGPU do
`onnxruntime-web` é voltado a ponto flutuante e **não implementa** esses
operadores — a sessão falhava ao ser criada.

O pacote agora inspeciona o modelo e usa WASM automaticamente. Se você fixou
o dispositivo na mão, remova a opção:

```js
await Piper.carregar({ dispositivo: "webgpu" });  // ❌
await Piper.carregar();                           // ✅ detecta sozinho
```

WebGPU só acelera modelos fp32/fp16.

</details>

<details>
<summary><b>O build do servidor tenta empacotar o onnxruntime</b></summary>

<br>

Importe o Piper apenas em código de cliente (dentro de `useEffect`,
`onMount`, ou `await import()` sob `if (typeof window !== "undefined")`).

No Next.js, se ainda ocorrer, marque como externo:

```js
// next.config.js
module.exports = {
  webpack: (config, { isServer }) => {
    if (isServer) config.externals = [...(config.externals ?? []), "onnxruntime-web"];
    return config;
  },
};
```

</details>

<details>
<summary><b>CSP bloqueando o CDN</b></summary>

<br>

Se a sua Content-Security-Policy restringe origens, libere o jsDelivr:

```
script-src  'self' https://cdn.jsdelivr.net;
connect-src 'self' https://cdn.jsdelivr.net;
worker-src  'self' blob:;
```

Ou hospede tudo no seu domínio:

```js
await Piper.carregar({
  cdn: "/modelo",                          // seu .onnx e .json
  urlRuntime: "/vendor/ort.min.mjs",       // build ESM do onnxruntime-web
});
```

</details>

<details>
<summary><b>O modelo baixa toda vez</b></summary>

<br>

Ele fica na Cache API do navegador. Se estiver rebaixando sempre:

- **Modo anônimo** descarta o cache ao fechar a aba — é esperado.
- **Sem HTTPS**: a Cache API exige contexto seguro (`https://` ou
  `localhost`).
- **Cota cheia**: o pacote ignora falhas de cache em silêncio e continua
  funcionando; libere espaço no navegador.

Para forçar o redownload: `await Piper.limparCache()`.

</details>

<details>
<summary><b>A síntese está lenta</b></summary>

<br>

Ative WASM multi-thread com estes cabeçalhos (SharedArrayBuffer):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

No Cloudflare Pages, crie um arquivo `_headers` na raiz do deploy:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

Outras opções: use `falarEmFluxo` para tocar a primeira frase enquanto o
resto gera; ou `Sintetizador`, que é ~70× tempo real (voz robótica).

Atenção: COEP quebra recursos de terceiros sem CORS. Se algo parar de
carregar, teste sem esses cabeçalhos primeiro.

</details>

<details>
<summary><b>"Instale o runtime ONNX para Node"</b></summary>

<br>

Em Node não há import por URL. Instale o pacote nativo:

```bash
npm i onnxruntime-node
```

</details>

<details>
<summary><b>Erro ao importar em Cloudflare Workers</b></summary>

<br>

Importar `/piper` no Worker é seguro (0.2.1+), mas a **síntese neural não
roda no edge** — falta memória para o WASM. Use o sintetizador:

```js
import { Sintetizador } from "@pedrobef/vozz/sintetizador";
```

Padrão recomendado: o Worker devolve os fonemas (`/g2p`, rápido e leve) e o
navegador faz a síntese neural.

</details>

<details>
<summary><b>Uma palavra sai com pronúncia errada</b></summary>

<br>

Nomes próprios e estrangeirismos podem escapar do léxico. Corrija com IPA:

```js
await tts.falar("Trabalho na Zendesk.", {
  lexico: { zendesk: "zẽndˈɛski" },
});
```

Use `Piper.fonemizar("palavra")` para ver o que o G2P está gerando.

</details>

<details>
<summary><b>O áudio não toca no iOS / Safari</b></summary>

<br>

Navegadores móveis exigem que a reprodução venha de um gesto do usuário.
Chame `tocar()` dentro do handler de clique — não em `useEffect` nem em
`setTimeout`:

```js
botao.onclick = async () => (await tts.falar("Olá!")).tocar();
```

</details>

---

## Quanto pesa

| Item | Tamanho | Quando |
| --- | --- | --- |
| código do `vozz` | ~52 kB | sempre |
| `/g2p` sozinho | ~36 kB | se usar só os fonemas |
| runtime ONNX (JS) | ~435 kB | só com o Piper |
| runtime ONNX (WASM) | ~11 MB | só com o Piper |
| modelo de voz | 18,7 MB | só com o Piper, **uma vez** |

Tudo fica em cache. Se o peso for proibitivo, `vozz/sintetizador` gera voz
sem baixar **nada** (~72 kB, roda no edge) — mais robótica, mas inteligível.

---

## Desenvolvimento

```bash
npm test          # 39 testes, incluindo a fidelidade do G2P
npm run qualidade # relatório acústico do sintetizador
npm run eval      # PER contra o espeak-ng
npm run pages     # demo local em http://localhost:8080
```

---

## Créditos e licença

Código em **Apache-2.0**. Uso comercial liberado.

- Modelo de voz: [Piper](https://github.com/rhasspy/piper) (VITS), voz
  `pt_BR-faber-medium`, quantizada em int8 — MIT.
- Motor alternativo: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
  de `hexgrad` — Apache-2.0.
- Inferência: [onnxruntime-web](https://github.com/microsoft/onnxruntime) — MIT.

Os pesos **não** vão dentro do pacote: são baixados sob demanda.
