# Sistema Funcionário Digital BlackGold

## O que foi criado

O sistema novo mantém três responsabilidades separadas para não repetir os
problemas da loja antiga:

1. **Catálogo protegido:** cada produto aceita até cinco links afiliados do
   mesmo item. O `open_url` continua sendo o endereço ativo usado na compra.
2. **Link Guardian v10:** testa cada opção, registra saúde e falhas e troca o
   link ativo por uma reserva saudável. Nunca troca o link afiliado pela URL
   final sem rastreamento.
3. **Funcionário digital:** escolhe diariamente três produtos elegíveis para a
   Seleção do Dia e publica o melhor no Telegram. A escolha aprende com
   impressões e cliques reais, equilibra exploração e desempenho e evita repetir
   o mesmo item todos os dias.

O motor é estatístico e auditável; não depende de IA paga. Ele nunca publica
itens masculinos, tecnologia, casa, automotivo ou outras categorias antigas
bloqueadas. Também não publica uma arte promocional antiga: o produto só entra
na campanha quando `card_image` contém a foto limpa aprovada pelo robô.

## Fluxo diário

- 00:27 (Brasília): o robô de fotos busca, valida e salva novas fotos limpas.
- A cada 6 horas: o Guardian verifica os links e faz failover quando necessário.
- 09:15 (Brasília): o funcionário lê os resultados, escolhe a campanha, atualiza
  a vitrine e publica no Telegram se ele estiver configurado.
- A cliente vê a oferta e o botão abre diretamente o link afiliado do Mercado
  Livre. A loja registra impressão/clique em segundo plano, sem página de triagem.

## Cadastro sem editar JSON

O painel fica em `/admin.html`. Ele cria uma solicitação protegida no GitHub;
o CMS cadastra o produto, o robô procura a foto limpa e as demais automações
passam a cuidar dele.

Campos de link 2 a 5 devem ser anúncios ou vendedores diferentes do **mesmo
produto e mesma variante**. Repetir cinco vezes o mesmo link não cria proteção.

## Configuração privada necessária

### Cloudflare Pages

Crie um banco D1 e aplique `migrations/0001_campaign_events.sql`. No projeto
Pages, vincule o banco com o nome `CAMPAIGN_DB` e configure estas variáveis
criptografadas:

- `STATS_EXPORT_TOKEN`: chave longa aleatória para exportar os resultados.
- `ADMIN_PANEL_TOKEN`: chave longa aleatória usada para entrar no painel.
- `GITHUB_CATALOG_TOKEN`: token GitHub de escopo mínimo, com permissão de escrita
  em Issues somente no repositório do catálogo.
- `GITHUB_CATALOG_REPOSITORY`: `ProjetosCosaNostra/La_Famiglia_Links`.

### GitHub Actions

- `CAMPAIGN_STATS_URL`: `https://blackgold-beauty-finds-br.pages.dev/api/stats`.
- `CAMPAIGN_STATS_TOKEN`: o mesmo valor de `STATS_EXPORT_TOKEN`.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` e `SITE_BASE`. O valor de
  `SITE_BASE` é `https://blackgold-beauty-finds-br.pages.dev`.
- `MELI_CLIENT_ID`, `MELI_CLIENT_SECRET`, `MELI_REFRESH_TOKEN`.
- `IMAGE_BOT_GITHUB_TOKEN`: token de escopo mínimo capaz de atualizar somente o
  secret rotativo `MELI_REFRESH_TOKEN`.

Segredos e tokens nunca devem ser colados em issues, commits, relatórios ou no
chat. O access token do Mercado Livre expira; o refresh token é rotacionado pela
automação e precisa ser guardado como secret.

## Ordem segura de ativação

1. O Cloudflare Pages oficial está publicado. Usar como redirect URI exatamente
   `https://blackgold-beauty-finds-br.pages.dev/mercadolivre-callback.html`.
   Nunca usar o endereço legado do GitHub Pages.
2. Concluir o aplicativo do Mercado Livre com Authorization Code e Refresh Token.
3. Configurar os secrets de imagem e executar `Fotos limpas dos produtos`.
4. Esperar o relatório aprovar as fotos necessárias; resultados ambíguos ficam
   fora da vitrine para revisão humana.
5. Criar/vincular o D1 e os secrets do painel e de estatísticas.
6. Validar desktop e mobile contra os
   mockups aprovados.
7. Ativar a agenda diária. Não investir em campanha paga antes de haver dados
   orgânicos suficientes para comparar produtos e criativos.
