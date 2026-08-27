# Galeria Holding CRM

Sistema de prospecção B2B — Pedro Ica, Head of Growth.

Acesse: [galeria-holding.vercel.app](https://galeria-holding.vercel.app)

## Stack
- React 18.2 + Babel Standalone (single-file, sem bundler)
- Persistência via localStorage
- 2.300+ empresas brasileiras na base
- 2.400+ contatos do mailing importados como decisores

## Configurar IA
Em ⚙ Configurações, insira sua Claude API Key (`sk-ant-...`)  
Obtenha em: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

## Board GAIA para o time (acesso restrito)

Página separada, **somente leitura**, com apenas o kanban da GAIA:
`/gaia.html`. Quem abre não enxerga o CRM, a base de empresas, os contatos
nem o pipeline da Holding.

**Como compartilhar:** no CRM → aba **⚡ GAIA Pipeline** → botão
**🔗 Compartilhar**. Escolha um código de acesso (ou sorteie um), marque o
que ocultar (valores em R$, notas, coluna Perdido) e gere o acesso.

O board é cifrado no navegador com **AES-GCM 256**, chave derivada do código
via PBKDF2-SHA256 (210k iterações). Sem o código, o link não abre nada —
nem o servidor nem o Vercel veem os dados em claro. Mande o link e o código
por canais diferentes.

### Dois modos

| | Link com snapshot | Link fixo |
|---|---|---|
| Configuração | nenhuma | Upstash Redis/Vercel KV + 1 env var |
| URL | longa, muda a cada geração | sempre `/gaia.html` |
| Atualização | gerar link novo | clicar em "Publicar board" |

**Para habilitar o link fixo:**
1. Vercel → projeto → *Storage* → conectar um **Upstash Redis** (ou Vercel KV).
   Isso injeta `KV_REST_API_URL` e `KV_REST_API_TOKEN` automaticamente.
2. Vercel → *Settings* → *Environment Variables* → criar
   `GAIA_PUBLISH_TOKEN` com um segredo qualquer (só você usa, para publicar).
3. Redeploy. No modal, cole o token no campo do modo 2 e clique em
   **Publicar board**.

### Revogar o acesso
Troque o código e gere/publique de novo. Links antigos continuam abrindo o
snapshot antigo com o código antigo — no modo link fixo, republicar com um
código novo invalida o acesso de quem só tinha o anterior.

### Arquivos
- `gaia.html` — página do time (somente leitura)
- `gaia-share-core.js` — empacotamento compacto + criptografia
- `block_gaia_share.js` — modal "Compartilhar" dentro do CRM
- `api/gaia-board.js` — endpoint do link fixo (guarda só o texto cifrado)
