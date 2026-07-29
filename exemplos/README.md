# Usando o `vozz` em cada plataforma

Todos os exemplos abaixo foram verificados: os builds de navegador, edge e
Node passam, e o subpath `/piper` foi importado dentro do `workerd` (o runtime
real do Cloudflare) sem travar.

## Onde cada motor roda

| Motor | Navegador | Cloudflare Workers / Pages Functions | Node / SSR |
| --- | --- | --- | --- |
| `vozz/g2p` (texto → IPA) | ✅ | ✅ | ✅ |
| `vozz/sintetizador` (formantes) | ✅ | ✅ | ✅ |
| `vozz/piper` (neural, 18,7 MB) | ✅ | ⚠️ só importa; a síntese roda no cliente | ✅ |
| `vozz` (Kokoro, ~86 MB) | ✅ | ❌ | ✅ |

O Piper e o Kokoro precisam do runtime ONNX, que carrega binários WASM
grandes. No edge, isso esbarra no limite de memória e no tempo de CPU — por
isso a síntese neural acontece **no dispositivo do usuário**, que é
exatamente onde ela é gratuita e escala sozinha.

---

## Sobre o runtime ONNX

A partir da 0.2.2 **não é preciso instalar nem configurar nada**. Se o
`onnxruntime-web` não estiver presente, o pacote importa o build ESM
direto do CDN por URL absoluta — que qualquer navegador resolve sozinho,
sem passar pelo bundler.

Por isso não existe mais o erro *"Vite não consegue resolver o specifier
onnxruntime-web"*: nenhum bundler precisa resolvê-lo.

Se preferir controlar a versão, há três caminhos:

```js
// 1) instalar e injetar (evita o download do CDN)
import * as ort from "onnxruntime-web";
Piper.usarRuntime(ort);

// 2) apontar outra URL
await Piper.carregar({ urlRuntime: "https://meu-cdn/ort.min.mjs" });

// 3) carregar por <script>; o pacote detecta globalThis.ort
// <script src="https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js"></script>
```

### Quanto pesa

| | Tamanho | Quando |
| --- | --- | --- |
| `vozz` (código) | ~52 kB | sempre |
| runtime ONNX (JS) | ~435 kB | só ao usar o Piper |
| runtime ONNX (WASM) | ~11 MB | só ao usar o Piper |
| modelo de voz | 18,7 MB | só ao usar o Piper, uma vez |

Tudo isso fica no cache do navegador. Se o peso for proibitivo para o seu
caso, `vozz/sintetizador` gera voz sem baixar **nada** — é mais robótica,
mas custa ~72 kB e roda em qualquer lugar, inclusive no edge.

## Next.js (Vercel)

O Piper só existe no cliente, então carregue-o dentro de `useEffect`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";

export default function Falar() {
  const tts = useRef<any>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    (async () => {
      const { Piper } = await import("@pedrobef/vozz/piper");
      tts.current = await Piper.carregar();   // runtime vem do CDN sozinho
      setPronto(true);
    })();
  }, []);

  return (
    <button
      disabled={!pronto}
      onClick={async () => (await tts.current.falar("Olá!")).tocar()}
    >
      {pronto ? "Falar" : "Carregando..."}
    </button>
  );
}
```

No `next.config.js`, evite que o servidor tente empacotar o runtime:

```js
module.exports = {
  webpack: (config, { isServer }) => {
    if (isServer) config.externals = [...(config.externals ?? []), "onnxruntime-web"];
    return config;
  },
};
```

## Cloudflare Pages (site estático — Astro, SvelteKit, Vite, React)

Nada de especial: é código de cliente.

```js
import { Piper } from "@pedrobef/vozz/piper";

const tts = await Piper.carregar({
  aoProgredir: (p) => console.log(`${Math.round(p.progresso * 100)}%`),
});
(await tts.falar("Olá!")).tocar();
```

Sem `vite.config.js` especial, sem `optimizeDeps`, sem instalar o
`onnxruntime-web`. Verificado com `vite build` limpo.

## Cloudflare Workers / Pages Functions

No edge funcionam o G2P e o sintetizador por formantes — ambos JS puro,
sem dependências:

```js
import { fonemizar } from "@pedrobef/vozz/g2p";
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

Um uso comum: o Worker devolve os **fonemas** (rápido, leve) e o navegador faz
a síntese neural a partir deles.

```js
import { fonemizar } from "@pedrobef/vozz/g2p";
export default {
  fetch: (req) =>
    Response.json({ ipa: fonemizar(new URL(req.url).searchParams.get("t") ?? "") }),
};
```

## Node / SSR (Nuxt, SvelteKit, Astro, Remix)

Importar no servidor é seguro: o pacote não toca em `window` no topo do
módulo. Para gerar arquivos em lote:

```js
import { Piper } from "@pedrobef/vozz/piper";
const tts = await Piper.carregar();          // usa onnxruntime-node
await (await tts.falar("Olá!")).salvar("saida.wav");
```

## Deno / Bun

```js
import { fonemizar } from "npm:@pedrobef/vozz/g2p";
console.log(fonemizar("Olá, tudo bem?"));
```

---

## Resolução de problemas

**"Não foi possível carregar o runtime ONNX"** — normalmente é bloqueio de
rede ao CDN. Instale `onnxruntime-web` e injete com `Piper.usarRuntime(ort)`,
ou aponte `urlRuntime` para um host acessível.

**Em Node** — instale `onnxruntime-node`: lá não há import por URL.

**"no available backend found" / erro ao criar a sessão** — resolvido na
0.2.3. O modelo Piper é quantizado em int8 e usa `ConvInteger` e
`DynamicQuantizeLinear`, operadores que o backend WebGPU não implementa; o
pacote agora detecta isso e usa WASM automaticamente. Se você fixou
`dispositivo: "webgpu"` na mão, remova a opção ou troque por `"wasm"`.

**Content-Security-Policy** — se a sua CSP restringe origens, libere
`https://cdn.jsdelivr.net` em `script-src` e `connect-src`, ou hospede o
runtime e o modelo no próprio domínio.

**O modelo baixa toda vez** — ele fica na Cache API do navegador. Em modo
anônimo o cache é descartado ao fechar a aba.
