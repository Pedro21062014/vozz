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
      const [{ Piper }, ort] = await Promise.all([
        import("@pedrobef/vozz/piper"),
        import("onnxruntime-web"),
      ]);
      Piper.usarRuntime(ort);           // dispensa o bundler de resolver o runtime
      tts.current = await Piper.carregar();
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
import * as ort from "onnxruntime-web";

Piper.usarRuntime(ort);
const tts = await Piper.carregar({
  aoProgredir: (p) => console.log(`${Math.round(p.progresso * 100)}%`),
});
(await tts.falar("Olá!")).tocar();
```

Em Vite, o `onnxruntime-web` pede uma exclusão do pré-bundling:

```js
// vite.config.js
export default { optimizeDeps: { exclude: ["onnxruntime-web"] } };
```

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

**"Não foi possível carregar o runtime ONNX"** — instale `onnxruntime-web` (ou
`onnxruntime-node`) e, se o bundler bloquear o import dinâmico, injete o
runtime com `Piper.usarRuntime(ort)`.

**Build do servidor tenta empacotar o `onnxruntime-web`** — marque o pacote
como externo (exemplo do Next.js acima) ou importe o `/piper` apenas em código
de cliente.

**O modelo baixa toda vez** — ele fica na Cache API do navegador. Em modo
anônimo o cache é descartado ao fechar a aba.
