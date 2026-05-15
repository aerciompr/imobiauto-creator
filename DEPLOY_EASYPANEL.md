# Deploy no Easypanel

## Repositório

Use este repositório público:

```text
https://github.com/aerciompr/imobiauto-creator
```

## Tipo de app

No Easypanel, crie um app usando:

```text
Source: GitHub Repository
Build: Dockerfile
Branch: main
Port: 8080
Healthcheck path: /health
```

O Dockerfile já faz:

1. instala dependências;
2. gera `npm run build`;
3. inicia o servidor Node com `npm start`;
4. serve o frontend em `dist`;
5. expõe a aplicação na porta `8080`.

## Variáveis de ambiente

Cadastre estas variáveis no Easypanel:

```env
OPENAI_API_KEY=cole_sua_chave_openai_aqui
PORT=8080
NODE_ENV=production
```

Opcionais:

```env
OPENAI_TEXT_MODEL=gpt-4.1
OPENAI_FAST_MODEL=gpt-4.1-mini
```

## Observações

- Não coloque `.env` no repositório.
- A chave fica somente no servidor.
- As chamadas de IA usam `/api/openai/*`.
- O endpoint `/health` deve responder:

```json
{"ok":true}
```

## Pós-deploy

Depois do deploy, teste:

```text
https://SEU_DOMINIO/health
```

Depois acesse o domínio principal e faça um teste simples com importação de texto e geração de PDF.
