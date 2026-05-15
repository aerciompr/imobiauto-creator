# ImobiAuto Creator

Gerador de PDF Marcelo dos Anjos - Anjos Imóveis.
Automatize a criação de PDFs imobiliários: Aplique logomarcas em fotos e gere descrições profissionais com IA.

## Como rodar localmente

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Configure a chave da OpenAI no ambiente:
   ```bash
   copy .env.example .env
   ```

   No PowerShell, para testar na sessão atual:
   ```powershell
   $env:OPENAI_API_KEY="sua_chave"
   ```

3. Gere a build:
   ```bash
   npm run build
   ```

4. Rode o servidor da aplicação:
   ```bash
   npm start
   ```

   Acesse `http://localhost:8080`.

## Desenvolvimento frontend

Para trabalhar apenas na interface:
   ```bash
   npm run dev
   ```

As chamadas de IA usam `/api/openai/*` pelo servidor Node, então para testar IA use `npm run build` seguido de `npm start`.

## Produção com Docker

```bash
docker compose up --build
```

O container lê `OPENAI_API_KEY` ou `API_KEY` do ambiente e expõe a aplicação na porta `8080`.

## Deploy no Easypanel

Use o Dockerfile deste repositório, configure a porta `8080` e cadastre as variáveis:

```env
OPENAI_API_KEY=sua_chave_openai
PORT=8080
NODE_ENV=production
```

Veja o passo a passo em `DEPLOY_EASYPANEL.md`.

## Build de produção

   ```bash
   npm run build
   ```
