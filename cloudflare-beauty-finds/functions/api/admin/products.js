const reply = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const text = (value, max = 500) => String(value || '').trim().slice(0, max);
const escapeHeading = value => text(value).replace(/[\r\n]+/g, ' ');
const mlUrl = value => /^https:\/\/(?:www\.)?(?:meli\.la|meli\.co|mercadolivre\.com(?:\.br)?|mercadolibre\.[a-z.]+)\//i.test(value);
const slug = value => text(value, 180).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);

const section = (heading, value) => `### ${heading}\n\n${value || '_No response_'}\n`;

export async function onRequestPost(context) {
  const expected = text(context.env.ADMIN_PANEL_TOKEN, 300);
  const githubToken = text(context.env.GITHUB_CATALOG_TOKEN, 500);
  const repository = text(context.env.GITHUB_CATALOG_REPOSITORY || 'ProjetosCosaNostra/La_Famiglia_Links', 180);
  const supplied = (context.request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!expected || !githubToken) return reply({ message: 'Painel ainda não configurado no servidor.' }, 503);
  if (!supplied || supplied !== expected) return reply({ message: 'Chave privada incorreta.' }, 401);

  let body;
  try { body = await context.request.json(); } catch { return reply({ message: 'Dados inválidos.' }, 400); }
  const title = escapeHeading(body.title);
  const sku = slug(body.sku || title);
  const category = escapeHeading(body.category);
  const links = Array.isArray(body.affiliate_links) ? body.affiliate_links.map(value => text(value, 500)).filter(Boolean).slice(0, 5) : [];
  if (!title || !sku || !category || !text(body.description) || !links[0]) {
    return reply({ message: 'Título, categoria, descrição e link principal são obrigatórios.' }, 400);
  }
  if (links.some(value => !mlUrl(value))) return reply({ message: 'Todos os links precisam pertencer ao Mercado Livre.' }, 400);

  const issueBody = [
    section('Título do Produto', title),
    section('SKU', sku),
    section('Descrição Curta', text(body.description, 600)),
    section('Categoria Principal', category),
    section('Categorias Secundárias (separe por vírgula)', text(body.secondary)),
    section('Badges/Tags/Hashtags (separe por vírgula)', text(body.badges)),
    section('ID do Mercado Livre (MLB...)', text(body.ml_id, 60)),
    ...[0,1,2,3,4].map(index => section(`Link afiliado ${index + 1}${index === 0 ? ' — principal' : ' — reserva'}`, links[index] || '')),
    section('Arte promocional / redes sociais (URL opcional)', text(body.promo_image, 500)),
    section('Preço atual (opcional)', text(body.price, 80)),
    section('CTA de compra (opcional)', text(body.buy_cta, 120)),
    section('Ativo?', 'Sim'),
    section('Produto do Dia?', 'Não')
  ].join('\n');

  const response = await fetch(`https://api.github.com/repos/${repository}/issues`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${githubToken}`,
      'content-type': 'application/json',
      'user-agent': 'blackgold-admin/1.0',
      'x-github-api-version': '2022-11-28'
    },
    body: JSON.stringify({ title: `[CMS] Novo produto: ${title}`, body: issueBody, labels: ['cms-produtos'] })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return reply({ message: 'O GitHub não aceitou o cadastro. Confira a permissão do token.' }, 502);
  return reply({ ok: true, issue_url: result.html_url || '', issue_number: result.number || null }, 201);
}
