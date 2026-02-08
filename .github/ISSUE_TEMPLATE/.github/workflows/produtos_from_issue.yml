name: Atualizar produtos.json via Issue (Vitrine)

on:
  issues:
    types: [opened]

permissions:
  contents: write
  issues: write

jobs:
  update_products:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Rodar updater (Issue -> produtos.json)
        id: updater
        env:
          GITHUB_EVENT_PATH: ${{ github.event_path }}
          GITHUB_OUTPUT: ${{ github.output }}
        run: |
          python scripts/update_produtos_from_issue.py

      - name: Commit & push (se mudou)
        if: steps.updater.outputs.changed == '1'
        run: |
          git config user.name "cosa-nostra-bot"
          git config user.email "actions@users.noreply.github.com"
          git add "${{ steps.updater.outputs.json_path }}"
          git commit -m "${{ steps.updater.outputs.commit_msg }}"
          git push

      - name: Comentar no Issue (resultado)
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          if [ "${{ steps.updater.outputs.changed }}" = "1" ]; then
            gh issue comment "${{ github.event.issue.number }}" --body "✅ Atualizado com sucesso.

- Arquivo: \`${{ steps.updater.outputs.json_path }}\`
- Produto ID: \`${{ steps.updater.outputs.product_id }}\`
- Título: **${{ steps.updater.outputs.product_title }}**

Aguarde o GitHub Pages rebuildar e atualize a vitrine."
            gh issue edit "${{ github.event.issue.number }}" --add-label "processed"
          else
            gh issue comment "${{ github.event.issue.number }}" --body "⚠️ Não atualizei nada: não consegui localizar um \`produtos.json\` compatível ou não encontrei o link /sec no Issue.
            
Se você usa um caminho diferente, me diga onde está o arquivo."
          fi
