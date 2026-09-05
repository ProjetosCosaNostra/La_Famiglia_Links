# Sistema Funcionário Digital BlackGold

## Estado operacional atual

O sistema mantém responsabilidades separadas para não repetir os problemas da loja antiga:

1. **Catálogo protegido:** cada produto aceita até cinco links afiliados do mesmo item. O `open_url` continua sendo o endereço ativo usado na compra.
2. **Link Guardian v10:** testa cada opção, registra saúde e falhas e troca o link ativo por uma reserva saudável. Nunca troca o link afiliado pela URL final sem rastreamento.
3. **Funcionário digital:** escolhe diariamente produtos elegíveis para a Seleção do Dia e opera como **motor de distribuição multicanal**, não como robô de Telegram.
4. **Atribuição por canal:** links publicados usam `/go/<SKU>?src=<CANAL>&c=<CAMPANHA>`, registrando clique e redirecionando imediatamente para o link afiliado ativo.
5. **Aprendizado comercial:** `/api/stats` compara desempenho por produto, por canal e por combinação produto+canal para deslocar esforço para onde existe alcance e clique real.
6. **D1 de campanhas:** `blackgold-beauty-campaigns` está criado, migrado e ligado à produção como `CAMPAIGN_DB`.
7. **Estatísticas protegidas:** `STATS_EXPORT_TOKEN` está configurado na Cloudflare e no GitHub Actions. O smoke test confirma `/api/stats` = 401 sem token e 200 com token.
8. **Scheduler real:** `.github/workflows/blackgold-multichannel-scheduler.yml` está na branch padrão `gh-pages`, portanto o agendamento diário pode realmente executar.
9. **Runtime Meta preparado:** `tools/publish_multichannel.py` já contém adaptadores Facebook e Instagram com Graph API v26.0, links rastreáveis e gate que impede publicação real até a ativação explícita.

O motor é estatístico e auditável; não depende de IA paga. Ele nunca publica itens masculinos, tecnologia, casa, automotivo ou outras categorias antigas bloqueadas. Também não publica uma arte promocional antiga: o produto só entra na campanha quando `card_image` contém a foto limpa aprovada pelo robô.

## Princípio de distribuição

Telegram deixa de ser tratado como canal principal. Ele é apenas um adaptador secundário e permanece bloqueado por gate de política até confirmação expressa das regras vigentes na conta/programa.

A prioridade de distribuição passa a ser:

1. Instagram Reels / Feed;
2. Facebook Reels / Feed;
3. TikTok;
4. YouTube Shorts;
5. Pinterest;
6. mídia paga social permitida: Meta Ads, TikTok Ads e Pinterest Ads;
7. Telegram apenas se público e explicitamente permitido;
8. WhatsApp/e-mail somente para base própria e uso permitido.

**Google Ads/Search, Google Shopping, Bing Ads e YouTube Ads não podem ser usados para promoção paga de links de afiliado Mercado Livre neste projeto.** O motor deve bloquear esses destinos por compliance.

O sistema não mede sucesso por quantidade de posts. Mede, nesta ordem: venda/comissão atribuída, cliques qualificados, alcance real, CTR e só depois volume de publicação.

## Descoberta de audiência

O funcionário digital deve localizar demanda e oportunidades usando fontes e APIs permitidas: tendências, termos de busca, temas, sazonalidade, desempenho histórico, regiões/idiomas e superfícies onde o produto tem maior probabilidade de ser visto.

Ele não deve fazer spam em grupos, comentários ou comunidades de terceiros. Pode identificar oportunidades, mas publicação em espaço de terceiros depende das regras e permissões daquele espaço.

## Fluxo diário alvo

- 00:27 (Brasília): o robô de fotos busca, valida e salva novas fotos limpas.
- A cada 6 horas: o Guardian verifica os links e faz failover quando necessário.
- 09:15 (Brasília): o scheduler da branch padrão lê `/api/stats`, escolhe produtos, atualiza aprendizado e prepara a campanha multicanal.
- Cada adaptador configurado recebe conteúdo adequado ao formato da plataforma.
- A publicação externa real só ocorre quando o canal passou pelo gate e `BLACKGOLD_AUTO_PUBLISH=true` ou quando uma execução manual é autorizada com `live=true`.
- O clique abre diretamente o produto via `/go/<SKU>`, registra `source` e `campaign_id` e redireciona para o Mercado Livre.
- Canal sem audiência/desempenho perde prioridade; canal com resultado ganha mais distribuição.

## Scheduler real

O agendamento efetivo vive em `.github/workflows/blackgold-multichannel-scheduler.yml` na branch padrão `gh-pages`.

Ele faz dois checkouts separados:

- `catalog/` = `gh-pages`, fonte canônica de catálogo e memória;
- `engine/` = `blackgold-beauty-cloudflare`, onde fica o motor atual.

A execução:

1. baixa estatísticas protegidas da produção;
2. seleciona até três candidatos;
3. prepara estado por canal;
4. publica somente se o gate live estiver aberto;
5. grava campanha, aprendizado, stats e estado multicanal de volta em `gh-pages`.

Assim o código pode evoluir na branch Cloudflare sem quebrar a regra do GitHub de que workflows agendados precisam existir na branch padrão.

## Distribuidor multicanal

`tools/publish_multichannel.py` possui os seguintes estados por canal:

- `PREPARED_NOT_CONFIGURED`;
- `PREPARED`;
- `PUBLISHED`;
- `ALREADY_PUBLISHED`;
- `BLOCKED_BY_POLICY_GATE`;
- `ERROR`.

### Facebook

Requer:

- `META_PAGE_ACCESS_TOKEN`;
- `META_PAGE_ID`.

Usa Graph API v26.0 e publica foto/feed com link `/go/<SKU>?src=facebook&c=<CAMPANHA>`.

### Instagram

Requer:

- `META_PAGE_ACCESS_TOKEN`;
- `META_IG_USER_ID`.

Cria container de mídia, aguarda `FINISHED` e chama `media_publish`. A imagem precisa estar disponível publicamente. O link rastreável entra no texto da publicação para atribuição da origem.

### Telegram

Mesmo que existam token/chat, o runtime permanece `REVIEW_REQUIRED` enquanto `ALLOW_TELEGRAM` não for explicitamente `true`. Não é canal central da estratégia.

## Cadastro sem editar JSON

O painel fica em `/admin.html`. Ele cria uma solicitação protegida no GitHub; o CMS cadastra o produto, o robô procura a foto limpa e as demais automações passam a cuidar dele.

Campos de link 2 a 5 devem ser anúncios ou vendedores diferentes do **mesmo produto e mesma variante**. Repetir cinco vezes o mesmo link não cria proteção.

## Métricas e atribuição

A API `/api/stats` expõe, sob autenticação:

- `rows`: desempenho agregado por SKU;
- `channels`: desempenho agregado por canal/source;
- `product_channels`: desempenho da combinação produto+canal.

Cada clique rastreável carrega `sku`, `campaign_id` e `source`. Uma falha de telemetria nunca deve impedir a abertura do produto e a possibilidade de venda.

## Configuração privada

### Cloudflare Pages — concluído

- projeto: `blackgold-beauty-finds-br`;
- banco D1: `blackgold-beauty-campaigns`;
- binding: `CAMPAIGN_DB`;
- migration: `migrations/0001_campaign_events.sql` aplicada;
- `STATS_EXPORT_TOKEN`: configurado e validado.

### Cloudflare Pages — ainda pendente

- `ADMIN_PANEL_TOKEN`;
- `GITHUB_CATALOG_TOKEN`.

`GITHUB_CATALOG_REPOSITORY` pode permanecer no default do código: `ProjetosCosaNostra/La_Famiglia_Links`.

### GitHub Actions — Meta ainda pendente

- `META_PAGE_ACCESS_TOKEN`;
- `META_PAGE_ID`;
- `META_IG_USER_ID`.

Depois de teste aprovado, habilitar a variável de repositório `BLACKGOLD_AUTO_PUBLISH=true` para o scheduler publicar automaticamente. Até lá, o sistema apenas prepara e mede.

Segredos e tokens nunca devem ser colados em issues, commits, relatórios ou no chat.

## Mídia paga

O funcionário pode preparar campanha, criativo, segmentação e recomendação de orçamento, mas **não pode aumentar gasto sozinho**. Qualquer mídia paga precisa de teto aprovado pelo usuário. Depois de aprovado, a alocação deve migrar para canais com melhor resultado atribuído, nunca ser dividida igualmente por costume.

Permitidos como foco pago neste projeto:

- Meta Ads (Instagram/Facebook);
- TikTok Ads;
- Pinterest Ads.

Bloqueados para links de afiliado Mercado Livre:

- Google Ads/Search;
- Google Shopping;
- Bing Ads;
- YouTube Ads;
- equivalentes de busca/shopping.

## Ordem segura de ativação

1. Cloudflare Pages oficial publicado e backend `/api/*` roteado. **CONCLUÍDO**
2. D1 + `STATS_EXPORT_TOKEN` configurados. **CONCLUÍDO**
3. Redirect rastreável `/go/<SKU>` publicado. **CONCLUÍDO NO CÓDIGO/PRODUÇÃO**
4. Scheduler multicanal na branch padrão. **CONCLUÍDO**
5. Conectar Meta/Instagram/Facebook por credenciais oficiais. **PRÓXIMO**
6. Executar publicação de teste com `live=true` e aprovar visual/link. **PENDENTE**
7. Habilitar `BLACKGOLD_AUTO_PUBLISH=true`. **PENDENTE**
8. Integrar TikTok, YouTube e Pinterest. **PENDENTE**
9. Coletar alcance/cliques suficientes para comparar canais. **PENDENTE**
10. Só então ativar mídia paga social com orçamento explicitamente aprovado e otimização por resultado. **PENDENTE**

## Regra anti-trabalho-manual

O produto é cadastrado uma vez no painel. A partir daí, foto, links, seleção, adaptação de formato, distribuição, rastreamento, aprendizado e failover devem ser automatizados. O operador não deve recriar manualmente o mesmo conteúdo em cada rede.

Detalhes adicionais estão em `MULTICANAL-DISTRIBUTION.md`.
