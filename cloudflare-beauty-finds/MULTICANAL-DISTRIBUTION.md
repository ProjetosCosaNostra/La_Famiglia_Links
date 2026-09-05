# BlackGold Beauty Finds — Motor de Distribuição Multicanal

## Princípio

Telegram não é mais tratado como canal principal nem como prova de alcance. Ele passa a ser apenas um adaptador entre vários. O objetivo do funcionário digital é gerar **alcance real, cliques atribuídos e vendas**, não quantidade de publicações.

O sistema antigo produziu muito conteúdo, mas sem distribuição suficiente. A nova arquitetura mede desempenho por canal e desloca esforço para onde pessoas reais estão vendo e clicando.

## Regra oficial do Programa de Afiliados Mercado Livre

A distribuição precisa obedecer às superfícies permitidas pelo Programa de Afiliados e Criadores.

### Orgânico permitido como núcleo

- Instagram
- Facebook
- X
- YouTube
- TikTok
- Pinterest
- site/blog próprio declarado

WhatsApp e Telegram não entram como núcleo porque as páginas oficiais do próprio Mercado Livre apresentam orientações diferentes conforme a página/fluxo. Se forem usados, devem ficar restritos a canais públicos e somente depois de confirmação da regra vigente na conta do afiliado.

### Mídia paga permitida para afiliados

Priorizar somente mídia social explicitamente permitida pelo Mercado Livre:

1. Instagram Ads
2. Facebook Ads
3. TikTok Ads
4. Pinterest Ads

### Mídia paga proibida para links de afiliado

Não usar para campanhas de afiliado:

- Google Ads / Search
- Google Shopping
- Bing Ads
- YouTube Ads
- formatos equivalentes de busca ou shopping

O motor deve bloquear esses destinos mesmo que exista credencial configurada. Essa regra é um gate de compliance, não uma preferência.

## Canais prioritários

### Descoberta e alcance orgânico

1. Instagram Reels / Feed
2. Facebook Reels / Feed
3. TikTok
4. YouTube Shorts
5. Pinterest
6. X quando houver formato adequado

### Tráfego pago social, somente com orçamento aprovado

7. Meta Ads (Instagram/Facebook)
8. TikTok Ads
9. Pinterest Ads

### Retenção / comunidade

10. Telegram somente se público e permitido na regra vigente
11. WhatsApp somente se público/opt-in e permitido na regra vigente
12. E-mail somente para base própria e opt-in, sem link de afiliado quando a política aplicável não autorizar

Telegram não deve consumir prioridade se não houver audiência ativa.

## Regra de segurança comercial

O funcionário digital não deve fazer spam em grupos, comentários ou comunidades de terceiros. Ele pode localizar oportunidades, tendências, palavras-chave, criadores, comunidades e superfícies de distribuição, mas publicação em espaço de terceiros depende das regras e permissões daquela comunidade.

Todo conteúdo com produto/link de afiliado deve sinalizar publicidade de forma clara quando exigido pelo programa/plataforma.

## Link rastreável sem página de triagem

Cada publicação deve usar o redirect de compra:

`https://blackgold-beauty-finds-br.pages.dev/go/<SKU>?src=<CANAL>&c=<CAMPANHA>`

A rota registra o clique por `sku`, `source` e `campaign_id` e redireciona imediatamente para o link afiliado ativo do Mercado Livre. Se a telemetria falhar, a compra continua sendo aberta; nunca bloquear venda por falha analítica.

Isso permite comparar, por exemplo:

- Instagram x TikTok x Pinterest;
- produto A x produto B;
- campanha e criativo;
- orgânico x pago social.

## Aprendizado por canal

A API `/api/stats` passa a devolver três visões:

- `rows`: desempenho agregado por produto;
- `channels`: desempenho agregado por canal/source;
- `product_channels`: combinação produto + canal.

O próximo estágio do funcionário digital deve usar esses dados para decidir **o que publicar e onde publicar**.

### Métricas mínimas

- impressões quando a plataforma/API fornecer;
- cliques rastreados pelo redirect `/go/`;
- CTR quando houver impressão;
- vendas/comissão quando a integração Mercado Livre disponibilizar atribuição compatível;
- custo por clique e custo por aquisição em mídia paga social;
- frequência e repetição por canal.

## Estratégia de distribuição

### Fase A — APIs orgânicas

Conectar contas oficiais e publicar automaticamente onde a plataforma oferecer API adequada:

- Instagram/Facebook: conta profissional e integração Meta;
- TikTok: Content Posting API;
- YouTube: Data API para Shorts/vídeos;
- Pinterest: API v5 para Pins;
- X: integração oficial quando habilitada e economicamente justificável;
- Telegram: Bot API somente como canal secundário e se permitido.

Cada adaptador deve ter `enabled`, `configured`, `policy_status`, `last_success`, `last_error`, `reach`, `clicks` e `score`.

### Fase B — Descoberta de audiência

O motor deve produzir um mapa periódico de demanda usando fontes e APIs permitidas:

- tendências e termos de busca;
- temas e produtos com tração;
- canais com melhor desempenho histórico;
- oportunidades sazonais;
- criativos com melhor CTR;
- regiões e idiomas com resposta melhor;
- comunidades e criadores relevantes para análise, sem spam automático.

A descoberta serve para escolher distribuição; não autoriza publicação invasiva em espaço de terceiros.

### Fase C — Tráfego pago social inteligente

Mídia paga só pode gastar após orçamento aprovado. O sistema pode preparar campanhas e recomendar alocação, mas nunca aumentar gasto sozinho acima do teto autorizado.

Ordem inicial para teste de baixo orçamento:

1. Meta Ads para criativos visuais de beleza;
2. TikTok Ads quando vídeos curtos demonstrarem resposta;
3. Pinterest Ads para produtos fortemente visuais e intenção de descoberta.

Google Ads/Search/Shopping, Bing Ads e YouTube Ads ficam bloqueados para links de afiliado por política do Mercado Livre.

O orçamento deve migrar para canais com melhor resultado atribuído, não ser dividido igualmente.

## Regra anti-trabalho-de-jegue

Nenhum canal novo deve exigir duplicação manual diária. O cadastro do produto ocorre uma vez no painel. A partir daí:

1. produto entra no catálogo;
2. Link Guardian mantém até cinco links;
3. foto limpa é preparada;
4. seleção diária escolhe candidatos;
5. motor multicanal adapta texto/formato por plataforma;
6. gate de política bloqueia canal/formato proibido;
7. adaptadores publicam nas contas configuradas;
8. `/go/` atribui clique ao canal;
9. estatísticas alimentam a próxima decisão;
10. canal sem audiência ou desempenho perde prioridade automaticamente.

## Gates de ativação

Um canal só entra em `AUTO_PUBLISH` depois de:

- OAuth/token configurado como secret;
- conta oficial identificada;
- API aprovada/auditada quando a plataforma exigir;
- publicação de teste aprovada;
- link rastreável validado;
- política da plataforma revisada;
- política do Programa de Afiliados Mercado Livre marcada como `ALLOWED`.

Antes disso, fica em `PREPARED`, nunca em estado falsamente marcado como ativo.

## Objetivo operacional

O KPI principal deixa de ser “quantos posts foram feitos”. A ordem de prioridade passa a ser:

1. vendas/comissão atribuída;
2. cliques qualificados;
3. alcance real;
4. CTR;
5. somente depois, volume de publicações.

Um canal que publica muito e entrega zero alcance não é sucesso; é desperdício de automação.
