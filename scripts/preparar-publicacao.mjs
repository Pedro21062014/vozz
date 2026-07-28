#!/usr/bin/env node
/**
 * Personaliza os campos de autoria antes do `npm publish`.
 *
 *   node scripts/preparar-publicacao.mjs --autor "Seu Nome" --github seu-usuario
 *
 * Opcionais:
 *   --email voce@exemplo.com
 *   --pacote outro-nome     (se quiser renomear o pacote)
 */

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const pegar = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const autor = pegar("--autor");
const github = pegar("--github");
const email = pegar("--email");
const pacote = pegar("--pacote");

if (!autor || !github) {
  console.error(`
Uso:
  node scripts/preparar-publicacao.mjs --autor "Seu Nome" --github seu-usuario

Opcionais:
  --email voce@exemplo.com
  --pacote outro-nome
`);
  process.exit(1);
}

const caminho = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(caminho, "utf8"));

const nome = pacote ?? pkg.name;
pkg.name = nome;
pkg.author = email ? `${autor} <${email}>` : autor;
pkg.repository = { type: "git", url: `git+https://github.com/${github}/${nome}.git` };
pkg.homepage = `https://github.com/${github}/${nome}#readme`;
pkg.bugs = { url: `https://github.com/${github}/${nome}/issues` };

writeFileSync(caminho, JSON.stringify(pkg, null, 2) + "\n");

console.log(`✓ package.json atualizado

  nome:       ${pkg.name}
  autor:      ${pkg.author}
  repositório: ${pkg.repository.url}

Próximo passo:
  npm login
  npm publish --access public
`);
