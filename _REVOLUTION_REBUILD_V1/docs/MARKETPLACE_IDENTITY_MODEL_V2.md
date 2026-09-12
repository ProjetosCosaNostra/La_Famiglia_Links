# Marketplace Identity Model V2

## Regra central

A identidade comercial BlackGold passa a ter duas camadas distintas:

1. **Produto BlackGold / catálogo canônico** — identifica o produto/variante que a vitrine promete ao visitante. A autoridade é `products.marketplace_catalog_product_id` + `marketplace_expected_attributes_json`.
2. **Slot afiliado / publicação de vendedor** — cada um dos até cinco links pode apontar para uma publicação (`ITEM_ID`) e variação diferentes, desde que todos provem representar o mesmo produto canônico. A autoridade operacional fica em `product_links.marketplace_item_id`, `marketplace_variation_id` e `marketplace_catalog_product_id`.

Um `MLB...` encontrado no legado em `card_image_item_id` não é automaticamente um ITEM_ID. Os valores históricos de 8 dígitos têm formato compatível com Product IDs de catálogo e devem entrar primeiro como `candidate_catalog_product_id` na reconciliação.

## Gate de reconciliação

`marketplace_reconciliation` armazena evidências sem promovê-las automaticamente. `probable` pode ser aceita por revisão humana; `conflict` e `unresolved` não podem ser aceitas pelo endpoint. Aceitar evidência de catálogo define somente `marketplace_catalog_product_id` e `marketplace_identity_status=catalog_only`. Isso **não** equivale a `verified_exact`.

Evidência que contenha apenas listing `candidate_item_id` deve ser associada a um slot de `product_links`, não ao produto canônico.

## Marketplace Guardian V4

O Guardian deve validar os slots sem abrir links afiliados:

- consultar ITEM_IDs em `/items/bulk`;
- confirmar `body.status=active`;
- localizar a `variation_id` quando declarada;
- obter o `catalog_product_id` do item/variação;
- comparar com o catálogo canônico do produto;
- comparar atributos esperados (cor, volume, potência, voltagem, tom etc.);
- consultar vendedor em `/users/bulk` e registrar reputação;
- somente então marcar o slot `verified_exact`/`verified`.

Falha, item inativo, catálogo diferente ou atributo divergente deve bloquear o slot. Erro temporário de API não deve transformar produto divergente em saudável.

## Failover `/go`

O redirecionador deve escolher apenas slots simultaneamente:

- `is_active=1`;
- saúde `healthy` ou `verified`;
- identidade do slot `verified_exact`;
- catálogo do slot igual ao catálogo canônico do produto;
- variante/atributos sem conflito.

Se nenhum slot cumprir o gate, o sistema falha fechado e não envia o visitante a uma oferta incerta.

## Estado do legado analisado

- Belle Angel: `MLB72180954` — forte candidato de **catálogo**, ainda não prova o link atual.
- Britânia BEC07R: `MLB70194949` — candidato de catálogo; exige conferência de voltagem/cor.
- Ruby Rose Stay Fix: `MLB76734925` — conflito porque a evidência histórica especifica Tom C 02.
- Floratta: `MLB16048715` — conflito: evidência diz Floratta Blue, produto atual diz Floratta My Blue.
- Epidrat: conflito 6ml versus 16g; nenhuma promoção permitida.
- Lily, Garnier e Kit 13 Pincéis: sem Product ID de catálogo confiável encontrado no recorte legado atual.

## Segurança operacional

O V4 continua PREPARE ONLY. Nenhuma evidência histórica, score de similaridade ou título parecido autoriza publicação automática, alteração de produção ou clique automatizado em link afiliado. A API oficial é a fonte de verificação quando a autorização OAuth estiver configurada.