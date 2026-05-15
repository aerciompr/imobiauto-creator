# Histórico do Projeto

Data: 15/05/2026

## Contexto

O projeto é o ImobiAuto Creator, usado para montar PDFs imobiliários de Marcelo dos Anjos / Anjos Imóveis com fotos, marca d'água, dados comerciais e conteúdo gerado por IA.

O estado anterior já incluía uma migração importante: as chaves de IA deixaram de ficar no navegador e passaram para o backend Node em `server/server.js`. Em seguida, o provedor foi trocado para OpenAI, usando `OPENAI_API_KEY` ou `API_KEY`.

## Problema Relatado

Ao gerar PDFs, o conteúdo ficava excessivamente longo, sem padrão visual, com estouro de layout e cortes de informação. O usuário também pediu suporte a OCR porque PDFs de referência ou materiais recebidos podem ter páginas sem camada textual extraível.

Arquivo usado como referência:

`C:\Users\aerciompr\Downloads\Condomínio Hoti - Lançamento Patacho (1).pdf`

## Estudo Realizado

O PDF de referência tem 16 páginas A4. A página 1 possui texto extraível, com cerca de 1.700 a 2.000 caracteres. As páginas 2 a 16 não retornam texto por extração comum, indicando páginas visuais/imagem.

Conclusões técnicas:

- A IA estava orientada a gerar conteúdo extenso demais.
- O layout antigo paginava texto por estimativa de caracteres, o que causa estouro.
- O download anterior rasterizava cada página com `html2canvas`, gerando PDF como imagem, sem texto pesquisável.
- A extração de PDF dependia apenas de camada textual do PDF e não fazia OCR para páginas escaneadas.

## Mudanças Aplicadas

- O backend OpenAI foi ajustado para gerar ficha comercial curta, harmônica e separada de um anexo técnico.
- O schema de conteúdo passou a aceitar `technicalAppendix`, preservando informações extensas sem poluir a ficha principal.
- O download do PDF passou a usar um gerador programático com `jsPDF`, criando páginas de texto real, selecionável e pesquisável.
- Fotos continuam entrando como páginas de imagem, com rodapé padronizado.
- A importação de PDFs passou a renderizar páginas sem texto e enviá-las ao backend para OCR via OpenAI.
- O fluxo preserva texto OCR no material enviado para a etapa de organização de dados.

## Objetivo do Novo Padrão

- Evitar cortes e estouro de layout.
- Manter PDF comercial bonito e direto.
- Preservar informações técnicas em páginas próprias.
- Permitir busca/seleção de texto no PDF baixado.
- Melhorar a leitura de PDFs escaneados ou compostos por imagens.
