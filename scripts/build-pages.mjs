/**
 * Monta o diretório de deploy para Cloudflare Pages (ou qualquer host estático).
 *
 *   npm run build:pages
 *
 * Resultado em `dist-pages/`:
 *   index.html          demo
 *   vozz/               código-fonte ESM (sem bundler)
 *   _headers            cabeçalhos do Cloudflare Pages
 *
 * O modelo NÃO é copiado: ele vem do jsDelivr, que já entrega com CORS e
 * cache de CDN. Para servi-lo do próprio domínio, use --com-modelo.
 */
import { cp, mkdir, rm, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = join(RAIZ, "dist-pages");
const comModelo = process.argv.includes("--com-modelo");

await rm(SAIDA, { recursive: true, force: true });
await mkdir(join(SAIDA, "vozz"), { recursive: true });

// Código-fonte: o pacote é ESM puro, então roda direto no navegador.
await cp(join(RAIZ, "src"), join(SAIDA, "vozz"), { recursive: true });
await cp(join(RAIZ, "pages", "index.html"), join(SAIDA, "index.html"));
await cp(join(RAIZ, "pages", "_headers"), join(SAIDA, "_headers"));

if (comModelo) {
  await mkdir(join(SAIDA, "modelo"), { recursive: true });
  for (const arq of [
    "pt_BR-faber-medium-quantized.onnx",
    "pt_BR-faber-medium-quantized.onnx.json",
  ]) {
    await cp(join(RAIZ, arq), join(SAIDA, "modelo", arq));
  }
  // Aponta a demo para o modelo local em vez do CDN.
  const html = join(SAIDA, "index.html");
  const { readFile } = await import("node:fs/promises");
  let s = await readFile(html, "utf8");
  s = s.replace(
    "tts = await Piper.carregar({",
    'tts = await Piper.carregar({\n        cdn: "/modelo",',
  );
  await writeFile(html, s);
}

// Relatório do que foi gerado.
async function tamanho(p) {
  try { return (await stat(p)).size; } catch { return 0; }
}
const tam = await tamanho(join(SAIDA, "modelo", "pt_BR-faber-medium-quantized.onnx"));

console.log(`dist-pages/ pronto${comModelo ? " (com o modelo embutido)" : ""}`);
console.log(`  index.html + vozz/ (código ESM)`);
if (comModelo) console.log(`  modelo/ — ${(tam / 1e6).toFixed(1)} MB`);
else console.log(`  modelo servido pelo jsDelivr`);
console.log(`
Publicar:
  npx wrangler pages deploy dist-pages --project-name vozz

Ou testar localmente:
  npx serve dist-pages`);
