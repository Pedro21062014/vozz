# Como publicar o `vozz` no npm

Quem publica é **você** — publicar exige as credenciais da sua conta npm.
O pacote já está pronto e validado; são 4 comandos.

**Status verificado:** o nome `vozz` estava livre no registry na última checagem.
Nomes podem ser tomados a qualquer momento — confirme antes:

```bash
npm view vozz
# "404 Not Found" = livre    |    mostra dados = já existe
```

---

## 1. Personalize a autoria

Hoje os campos apontam para um placeholder (`vozz-tts/vozz`). Ajuste:

```bash
node scripts/preparar-publicacao.mjs --autor "Seu Nome" --github seu-usuario
```

Opcional: `--email voce@exemplo.com` e `--pacote outro-nome` (se o nome
`vozz` tiver sido tomado).

## 2. Confira o que vai subir

```bash
npm test              # 17 testes, incluindo a fidelidade do G2P
npm pack --dry-run    # deve listar 13 arquivos, ~29,5 kB
```

O tarball leva apenas `src/`, `types/`, `README.md` e `LICENSE`.
Testes, scripts e exemplos ficam de fora (`.npmignore`).

## 3. Faça login

```bash
npm login
```

Se sua conta tem 2FA (recomendado), o npm pede o código na hora do publish.

## 4. Publique

```bash
npm publish --access public
```

`--access public` é obrigatório apenas para pacotes com escopo
(`@seu-usuario/vozz`); para nome simples é inofensivo.

---

## Depois de publicar

Teste a instalação real, num diretório limpo:

```bash
mkdir /tmp/teste && cd /tmp/teste && npm init -y
npm i vozz
node -e "import('vozz').then(m => console.log(m.fonemizar('Olá, tudo bem?')))"
# esperado: olˈa, tˈudʊ bˈeɪŋ?
```

### Versões seguintes

Nunca republique a mesma versão — o npm recusa. Use:

```bash
npm version patch   # 0.1.0 -> 0.1.1  (correções)
npm version minor   # 0.1.0 -> 0.2.0  (recursos novos)
npm publish
```

### Se errar algo

```bash
npm unpublish vozz@0.1.0   # só nas primeiras 72h
npm deprecate vozz@0.1.0 "use 0.1.1"   # alternativa depois disso
```

---

## Sobre a licença dos pesos

O código é Apache-2.0. O modelo (Kokoro-82M, de `hexgrad`) também é
Apache-2.0, e os pesos **não** vão dentro do pacote — são baixados do Hugging
Face na primeira execução. Uso comercial está liberado, e o crédito ao autor
do modelo já está no README.
