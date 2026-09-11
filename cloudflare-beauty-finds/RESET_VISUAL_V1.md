# BlackGold Beauty Finds — RESET VISUAL V1

Data: 10/09/2026
Branch isolada: `blackgold-home-reset-v1`
Produção: **não alterada**.

## Objetivo
Reconstruir a Home a partir do mockup aprovado, eliminando a cadeia de overrides V18→V47 e impedindo nova regressão por empilhamento de CSS.

## Autoridade visual
- Viewport canônico de calibração: **1448 × 1086**.
- Alturas canônicas desktop: Header 49 + Hero 362 + Catálogo 443 + Ecossistema 172 + Footer 60 = **1086 px**.
- Topo e rodapé permanecem visualmente substanciais; não são comprimidos para esconder rolagem.
- Em telas mais largas, os fundos reais de cada seção ocupam toda a largura. Não são adicionadas faixas laterais artificiais, blur ou “remendo”.
- Conteúdo mantém hierarquia e proporção dentro de um frame organizado.

## Regras anti-regressão
1. A Home carrega exatamente **um** stylesheet local: `home-reset-v1.css`.
2. `!important` é proibido na nova Home.
3. `html/body overflow:hidden` no desktop é proibido.
4. Screenshot/mockup não pode substituir DOM real.
5. Camadas `blackgold-v*`, `authority-mobile`, `mobile-v46` e `mockup-lock` não podem entrar na Home reset.
6. Produção não recebe este trabalho antes da aprovação humana do candidato visual.

## Validação automática
- `npm run gate:home` verifica contrato estático.
- `npm run build` executa gate antes do build.
- Workflow `BlackGold Home Reset V1 - Visual Gate` roda build e navegador Chromium em 1448×1086, 1914×815 e 390×844.
- O workflow falha em overflow horizontal, quebra das alturas canônicas ou erro JavaScript e salva screenshots/`report.json` como artefato.

## Estado comercial
Este reset é somente da superfície Home. Catálogo, automações, funções, afiliados e regras comerciais não são apagados. Os produtos do mockup permanecem temporariamente como autoridade visual na branch de calibração; a conexão com o catálogo commerce-ready ocorre depois da aprovação da geometria, sem redesign.
