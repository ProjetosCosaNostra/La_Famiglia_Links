# Cosa Nostra Ecosystem Contract V1

## Objetivo

Todo projeto publicado do ecossistema — jogo, aplicativo, site ou SaaS — deve oferecer um ponto de entrada visível chamado **Ecossistema** (ou equivalente localizado) para que o usuário possa descobrir projetos prontos e canais oficiais.

## Fonte central

A fonte canônica pública é `ecosystem.json` na raiz deste repositório. Clientes devem preferir a versão online quando houver conexão e manter um fallback local versionado para funcionamento offline.

## Regras obrigatórias

1. O botão/entrada Ecossistema deve ser facilmente acessível sem bloquear a função principal do produto.
2. O conteúdo deve separar projetos prontos, hub oficial, redes/canais e contato.
3. Links externos só devem abrir por ação explícita do usuário.
4. Apps offline-first devem continuar funcionando sem rede; falha ao atualizar o catálogo nunca pode bloquear o app.
5. O catálogo local deve ser atualizado somente depois que um novo projeto estiver pronto/publicável.
6. A aplicação deve ignorar entradas malformadas e preservar o último catálogo válido conhecido quando aplicável.
7. O próprio produto pode ser ocultado da lista para evitar autorreferência desnecessária.
8. A interface do Ecossistema deve respeitar o idioma selecionado no produto.

## Internacionalização mínima para apps internacionais

Idiomas mínimos: `pt-BR`, `en-US`, `es-419`.

- Na primeira execução, usar o idioma do sistema quando houver correspondência suportada.
- Para idiomas não suportados, usar inglês como fallback internacional.
- Oferecer seleção manual de idioma dentro do produto.
- A escolha manual deve persistir entre reinicializações.
- Deve existir opção de retornar para **Automático / Sistema**.

## Resiliência

A integração com o Ecossistema é complementar. Indisponibilidade da internet, GitHub Pages ou qualquer canal externo não pode impedir inicialização, uso offline, acesso a dados do usuário ou funções centrais do produto.

## Evolução

`schema_version` do manifesto deve aumentar apenas em mudanças incompatíveis. Clientes devem validar o schema antes de aceitar uma atualização remota.
