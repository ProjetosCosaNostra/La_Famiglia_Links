# Automação de fotos dos produtos

O site novo usa `card_image` para os cards e preserva `image` como arte promocional
legada. Assim, uma mudança visual não apaga os criativos que já existem.

## Fluxo automático

1. Um produto entra ou é editado pelo CMS em GitHub Issues.
2. `tools/sync_product_card_images.py` procura o anúncio no Mercado Livre.
3. O resultado só é aceito quando título, modelo, medida e variante atingem a
   confiança mínima. Empates ambíguos são rejeitados.
4. A primeira foto oficial é baixada, centralizada em 1200 x 1200 e salva como
   WebP em `assets/produtos-card/<sku>.webp`.
5. `produtos.json` recebe `card_image`, a origem, o anúncio encontrado, a forma
   de correspondência, a confiança e a data da sincronização.
6. A atualização de `gh-pages` é copiada automaticamente para
   `blackgold-beauty-cloudflare`, que continua sendo a branch publicada pela
   Cloudflare Pages.

O cadastro não é bloqueado se a fonte estiver indisponível. O produto fica sem
`card_image`, usa o fallback atual e volta a ser tentado pela rodada diária.

## Fonte e credencial

O robô tenta a API do Mercado Livre sem credencial. Se a API exigir autenticação,
há dois modos:

- teste imediato: secret `MELI_ACCESS_TOKEN`;
- operação contínua: secrets `MELI_CLIENT_ID`, `MELI_CLIENT_SECRET`,
  `MELI_REFRESH_TOKEN` e `IMAGE_BOT_GITHUB_TOKEN`.

No modo contínuo, o acesso é renovado antes de cada rodada e o refresh token novo
é salvo novamente como secret pelo GitHub CLI. `IMAGE_BOT_GITHUB_TOKEN` deve ser
um token restrito a este repositório, com permissão apenas para administrar os
secrets das Actions. Nenhum token é colocado em log, catálogo ou commit. Não há
dependência de serviço pago.

## Execução manual segura

```bash
pip install -r scripts/requirements-webp.txt
python tools/sync_product_card_images.py --only-sku cicaplast-baume-b5-plus-la-roche-posay-40ml
```

Para preencher o acervo gradualmente:

```bash
python tools/sync_product_card_images.py --max-items 25
```

Para uma exceção confirmada, pode-se informar `card_image_override_url` no
produto. A URL ainda passa pela validação de arquivo e tamanho antes de virar o
WebP local.
