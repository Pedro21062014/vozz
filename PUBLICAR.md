# Publicar o `vozz` no npm

O repositório está no ar: https://github.com/Pedro21062014/vozz
O pacote **ainda não está publicado** no npm.

Nada quebrou. Faltam dois passos que só você pode dar: criar o token do npm
e disparar a publicação.

---

## Por que ainda não publicou

O workflow publica quando uma **tag `v*`** é enviada. Nenhuma tag foi criada
até agora, então ele nunca rodou em modo real. A única execução foi uma
**simulação** (dry-run), usada para validar o pipeline — nela o passo de
publicar é pulado de propósito.

| Verificação | Estado |
| --- | --- |
| `npm view vozz` | 404 — nome ainda livre |
| Tags no repositório | nenhuma |
| CI (Node 18/20/22) | verde |
| Publicação simulada | passou |

---

## Passo 1 — Criar o token no npm

Precisa ser do tipo **Automation**: é o único que funciona em CI quando a
conta tem 2FA.

1. Acesse [npmjs.com](https://www.npmjs.com) e faça login
2. Foto do perfil → **Access Tokens**
3. **Generate New Token** → **Classic Token** → tipo **Automation**
4. Copie o valor (aparece uma única vez)

> Se você ainda não tem conta no npm, crie em npmjs.com/signup e confirme o
> e-mail antes de gerar o token.

## Passo 2 — Salvar o token como secret no GitHub

1. Abra https://github.com/Pedro21062014/vozz/settings/secrets/actions
2. **New repository secret**
3. **Name:** `NPM_TOKEN` (exatamente assim)
4. **Secret:** cole o token
5. **Add secret**

## Passo 3 — Publicar

Escolha um dos dois caminhos.

### Opção A — pela aba Actions (sem terminal)

1. Abra https://github.com/Pedro21062014/vozz/actions
2. Clique em **Publicar no npm** → **Run workflow**
3. **Desmarque** a caixa `Simular`
4. **Run workflow**

### Opção B — por tag, no terminal

```bash
cd vozz
git tag v0.1.0
git push --follow-tags
```

Acompanhe em **Actions**. Ao final, confira:

```bash
npm view vozz
```

---

## Proteções do workflow

Publicação é irreversível, então o `publish.yml` para antes de errar:

1. **Testes primeiro** — o job de publicar depende do de testes.
2. **Secret ausente** — se `NPM_TOKEN` não existir, falha com instrução
   clara em vez do erro críptico `ENEEDAUTH` do npm.
3. **Tag × versão** — tag `v0.2.0` com `package.json` em `0.1.0` é barrada.
4. **Versão duplicada** — se a versão já existe no npm, para antes de tentar.

Publica com `--provenance`: o npm mostra um selo ligando o pacote ao commit
que o gerou.

---

## Releases seguintes

Nunca republique a mesma versão — o npm recusa.

```bash
npm version patch   # 0.1.0 -> 0.1.1  correções
npm version minor   # 0.1.0 -> 0.2.0  recursos novos
npm version major   # 0.1.0 -> 1.0.0  quebra compatibilidade
git push --follow-tags
```

`npm version` já cria o commit e a tag; o push dispara a publicação.

## Se algo der errado

```bash
npm unpublish vozz@0.1.0                # só nas primeiras 72h
npm deprecate vozz@0.1.0 "use a 0.1.1"  # alternativa depois disso
```

---

## Licença dos pesos

Código em Apache-2.0. O modelo (Kokoro-82M, de `hexgrad`) também é
Apache-2.0 e **não** vai dentro do pacote — é baixado do Hugging Face na
primeira execução. Uso comercial liberado; crédito no README.
