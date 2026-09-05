# Sistema Funcionário Digital BlackGold

## O que foi criado

O sistema mantém responsabilidades separadas para não repetir os problemas da loja antiga:

1. **Catálogo protegido:** cada produto aceita até cinco links afiliados do mesmo item. O `open_url` continua sendo o endereço ativo usado na compra.
2. **Link Guardian v10:** testa cada opção, registra saúde e falhas e troca o link ativo por uma reserva saudável. Nunca troca o link afiliado pela URL final sem rastreamento.
3. **Funcionário digital:** escolhe diariamente produtos elegíveis para a Seleção do Dia e passa a operar como um **motor de distribuição multicanal**, não como um robô de Telegram.
4. **Atribuição por canal:** links publicados podem usar `/go/<SKU>?src=<CANAL>&c=<CAMPANHA>`, registrando clique e redirecionando imediatamente para o link afiliado ativo.
5. **Aprendizado comercial:** o sistema compara desempenho por produto, por canal e por combinação produto+canal para deslocar esforço para onde existe alcance e clique real.

O motor é estatístico e auditável; não depende de IA paga. Ele nunca publica itens masculinos, tecnologia, casa, automotivo ou outras categorias antigas bloqueadas. Também não publica uma arte promocional antiga: o produto só entra na campanha quando `card_image` contém a foto limpa aprovada pelo robô.

## Princípio de distribuição

Telegram deixa de ser tratado como canal principal. Ele é apenas um adaptador secundário de retenção/comunidade.

A prioridade de distribuição passa a ser:

1. Instagram Reels / Feed;
2. Facebook Reels / Feed;
3. TikTok;
4. YouTube Shorts;
5. Pinterest;
6. mídia paga aprovada (Meta Ads, Google Ads, TikTok Ads e Pinterest Ads conforme desempenho);
7. Telegram como canal complementar;
8. WhatsApp/e-mail somente para base própria com opt-in.

O sistema não mede sucesso por quantidade de posts. Mede, nesta ordem: venda/comissão atribuída, cliques qualificados, alcance real, CTR e só depois volume de publicação.

## Descoberta de audiência

O funcionário digital deve localizar demanda e oportunidades usando fontes e APIs permitidas: tendências, termos de busca, temas, sazonalidade, desempenho histórico, regiões/idiomas e superfícies onde o produto tem maior probabilidade de ser visto.

Ele não deve fazer spam em grupos, comentários ou comunidades de terceiros. Pode identificar oportunidades, mas publicação em espaço de terceiros depende das regras e permissões daquele espaço.

## Fluxo diário alvo

- 00:27 (Brasília): o robô de fotos busca, valida e salva novas fotos limpas.
- A cada 6 horas: o Guardian verifica os links e faz failover quando necessário.
- 09:15 (Brasília): o funcionário lê resultados, escolhe produtos, atualiza aprendizado e gera a campanha multicanal.
- Cada adaptador configurado recebe conteúdo adequado ao formato da plataforma.
- O clique abre diretamente o produto via `/go/<SKU>`, registra `source` e `campaign_id` e redireciona para o Mercado Livre.
- Canal sem audiência/desempenho perde prioridade; canal com resultado ganha mais distribuição.

## Cadastro sem editar JSON

O painel fica em `/admin.html`. Ele cria uma solicitação protegida no GitHub; o CMS cadastra o produto, o robô procura a foto limpa e as demais automações passam a cuidar dele.

Campos de link 2 a 5 devem ser anúncios ou vendedores diferentes do **mesmo produto e mesma variante**. Repetir cinco vezes o mesmo link não cria proteção.

## Métricas e atribuição

A API `/api/stats` expõe, sob autenticação:

- `rows`: desempenho agregado por SKU;
- `channels`: desempenho agregado por canal/source;
- `product_channels`: desempenho da combinação produto+canal.

Cada clique rastreável deve carregar:

- `sku`;
- `campaign_id`;
- `source`;
- `event_id`.

Uma falha de telemetria nunca deve impedir a abertura do produto e a possibilidade de venda.

## Configuração privada necessária

### Cloudflare Pages

Crie um banco D1 e aplique `migrations/0001_campaign_events.sql`. No projeto Pages, vincule o banco com o nome `CAMPAIGN_DB` e configure estas variáveis criptografadas:

- `STATS_EXPORT_TOKEN`: chave longa aleatória para exportar os resultados.
- `ADMIN_PANEL_TOKEN`: chave longa aleatória usada para entrar no painel.
- `GITHUB_CATALOG_TOKEN`: token GitHub de escopo mínimo, com permissão de escrita em Issues somente no repositório do catálogo.
- `GITHUB_CATALOG_REPOSITORY`: `ProjetosCosaNostra/La_Famiglia_Links`.

### GitHub Actions / canais

Base já existente:

- `CAMPAIGN_STATS_URL`: `https://blackgold-beauty-finds-br.pages.dev/api/stats`.
- `CAMPAIGN_STATS_TOKEN`: o mesmo valor de `STATS_EXPORT_TOKEN`.
- `SITE_BASE`: `https://blackgold-beauty-finds-br.pages.dev`.
- `MELI_CLIENT_ID`, `MELI_CLIENT_SECRET`, `MELI_REFRESH_TOKEN`.
- `IMAGE_BOT_GITHUB_TOKEN`: token de escopo mínimo capaz de atualizar somente o secret rotativo `MELI_REFRESH_TOKEN`.

Telegram, quando usado:

- `TELEGRAM_BOT_TOKEN`;
- `TELEGRAM_CHAT_ID`.

Novos adaptadores devem usar secrets próprios e escopo mínimo para Meta/Instagram/Facebook, TikTok, YouTube e Pinterest. Um canal só pode ser marcado como `AUTO_PUBLISH` depois de OAuth/token, conta oficial, aprovação/auditoria quando exigida e publicação de teste aprovada.

Segredos e tokens nunca devem ser colados em issues, commits, relatórios ou no chat.

## Mídia paga

O funcionário pode preparar campanha, criativo, segmentação e recomendação de orçamento, mas **não pode aumentar gasto sozinho**. Qualquer mídia paga precisa de teto aprovado pelo usuário. Depois de aprovado, a alocação deve migrar para canais com melhor resultado atribuído, nunca ser dividida igualmente por costume.

## Ordem segura de ativação

1. Cloudflare Pages oficial publicado e backend `/api/*` roteado.
2. D1 + secrets de painel/estatísticas configurados.
3. Redirect rastreável `/go/<SKU>` validado.
4. Mercado Livre OAuth e refresh token estáveis.
5. Fotos limpas e Link Guardian ativos.
6. Conectar Instagram/Facebook, TikTok, YouTube e Pinterest por APIs oficiais.
7. Validar publicação de teste em cada canal.
8. Ativar distribuição multicanal orgânica.
9. Coletar alcance/cliques suficientes para comparar canais.
10. Só então ativar mídia paga com orçamento explicitamente aprovado e otimização por resultado.

## Regra anti-trabalho-manual

O produto é cadastrado uma vez no painel. A partir daí, foto, links, seleção, adaptação de formato, distribuição, rastreamento, aprendizado e failover devem ser automatizados. O operador não deve recriar manualmente o mesmo conteúdo em cada rede.

Detalhes adicionais estão em `MULTICANAL-DISTRIBUTION.md`.
