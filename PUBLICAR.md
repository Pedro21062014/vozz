# Publicar o `vozz`: repositório + npm automático

O repositório local **já está pronto**, com um commit inicial e os workflows
configurados. Faltam só os passos que exigem *suas* credenciais.

Resumo: criar o repo no GitHub → dar push → salvar o token npm no secret →
rodar `npm version patch` a cada release.

---

## 1. Personalize a autoria

Os campos `author`/`repository` ainda apontam para um placeholder:

```bash
node scripts/preparar-publicacao.mjs --autor "Seu Nome" --github seu-usuario
git commit -am "chore: definir autoria e repositório"
```

Opcional: `--email voce@exemplo.com` e `--pacote outro-nome` (caso o nome
`vozz` tenha sido tomado — confira com `npm view vozz`).

## 2. Crie o repositório no GitHub

Pelo site: **github.com/new** → nome `vozz` → **não** marque nada
(sem README, sem .gitignore, sem licença — já existem aqui).

Ou, se você tiver o GitHub CLI:

```bash
gh repo create vozz --public --source=. --remote=origin --push
```

## 3. Envie o código

Se não usou o `gh` acima:

```bash
git remote add origin https://github.com/seu-usuario/vozz.git
git push -u origin main
```

## 4. Configure o token do npm

**No npm** — crie um token de automação (funciona mesmo com 2FA ligado):

1. npmjs.com → foto do perfil → **Access Tokens**
2. **Generate New Token** → tipo **Automation**
3. Copie o valor (só aparece uma vez)

**No GitHub** — salve como secret:

1. Repositório → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. Nome exatamente `NPM_TOKEN`, valor = o token copiado

> O nome precisa ser `NPM_TOKEN`: é o que o workflow lê em
> `secrets.NPM_TOKEN`.

## 5. Publique

```bash
npm version patch     # sobe 0.1.0 -> 0.1.1, cria commit e tag
git push --follow-tags
```

O push da tag dispara o workflow, que roda os testes e publica.
Acompanhe na aba **Actions**.

Para a **primeira** publicação em `0.1.0` (sem subir versão):

```bash
git tag v0.1.0
git push --follow-tags
```

---

## Como os workflows funcionam

| Arquivo | Quando roda | O que faz |
| --- | --- | --- |
| `.github/workflows/ci.yml` | push e PR na `main` | Testes em Node 18, 20 e 22 + métrica do G2P |
| `.github/workflows/publish.yml` | tag `v*` ou execução manual | Testa e publica no npm |

O `publish.yml` tem três proteções, porque publicação é irreversível:

1. **Testes primeiro** — o job de publicação depende do job de testes.
2. **Tag × versão** — se a tag `v0.2.0` não bater com o `package.json`, falha
   com mensagem explicando. Evita tag e versão dessincronizadas.
3. **Versão duplicada** — se aquela versão já existe no npm, para antes de
   tentar (o npm recusaria de qualquer forma, mas o erro fica claro).

Publica com `--provenance`: o npm exibe um selo de procedência ligando o
pacote ao commit que o gerou. Por isso o job tem `id-token: write`.

### Testar sem publicar

Aba **Actions** → **Publicar no npm** → **Run workflow** → deixe
`Simular` marcado. Roda tudo, inclusive `npm publish --dry-run`, sem
publicar nada.

---

## Depois de publicar

```bash
mkdir /tmp/teste && cd /tmp/teste && npm init -y
npm i vozz
node -e "import('vozz').then(m => console.log(m.fonemizar('Olá, tudo bem?')))"
# esperado: olˈa, tˈudʊ bˈeɪŋ?
```

### Versões seguintes

Nunca republique a mesma versão — o npm recusa.

```bash
npm version patch   # 0.1.0 -> 0.1.1  correções
npm version minor   # 0.1.0 -> 0.2.0  recursos novos
npm version major   # 0.1.0 -> 1.0.0  quebra compatibilidade
git push --follow-tags
```

### Se errar algo

```bash
npm unpublish vozz@0.1.0                # só nas primeiras 72h
npm deprecate vozz@0.1.0 "use a 0.1.1"  # alternativa depois disso
```

---

## Licença dos pesos

O código é Apache-2.0. O modelo (Kokoro-82M, de `hexgrad`) também é
Apache-2.0 e **não** vai dentro do pacote — é baixado do Hugging Face na
primeira execução. Uso comercial liberado; o crédito já está no README.
