import fs from 'node:fs/promises';

const base = process.env.BLACKGOLD_BASE || 'http://127.0.0.1:8788';
const token = process.env.BLACKGOLD_ADMIN_TOKEN || '';
if (!token) throw new Error('BLACKGOLD_ADMIN_TOKEN missing');
const auth = { authorization: 'Bearer ' + token };

async function call(path, options={}) {
  const response = await fetch(base + path, { ...options, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function cleanup() {
  const { response, data } = await call('/api/admin/products', { headers: auth });
  if (!response.ok) throw new Error('cleanup list failed ' + response.status);
  for (const item of data.products || []) {
    const r = await call('/api/admin/products?id=' + encodeURIComponent(item.id), {
      method: 'DELETE',
      headers: auth
    });
    if (!r.response.ok) throw new Error('cleanup delete failed ' + item.id);
  }
}

const result = {};
try {
  await cleanup();

  let r = await call('/api/products?gate=start');
  if (!r.response.ok || r.data.total !== 0) throw new Error('public catalog must start empty');
  result.startEmpty = true;

  r = await call('/api/admin/products');
  if (r.response.status !== 401) throw new Error('admin endpoint must reject anonymous access');
  result.authGate = 401;

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7n8AAAAASUVORK5CYII=',
    'base64'
  );
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'blackgold-ci.png');
  r = await call('/api/admin/upload', { method: 'POST', headers: auth, body: form });
  if (r.response.status !== 201 || !r.data.key || !r.data.url) {
    throw new Error('image upload failed ' + JSON.stringify(r.data));
  }
  const mediaUrl = r.data.url;
  result.upload = 'PASS';

  const product = {
    title: 'BlackGold CI Temporary Product',
    brand: 'BlackGold QA',
    category: 'Beleza',
    description: 'Temporary integration-test record. Must be deleted before test exit.',
    currency: 'BRL',
    price: '19.90',
    imageKey: r.data.key,
    destinationUrl: 'https://example.com/blackgold-ci',
    status: 'published',
    featured: true,
    order: 1
  };
  r = await call('/api/admin/products', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify(product)
  });
  if (r.response.status !== 201 || r.data.product?.status !== 'published') {
    throw new Error('create/publish failed ' + JSON.stringify(r.data));
  }
  const id = r.data.product.id;
  result.createPublished = 'PASS';

  r = await call('/api/products?gate=published');
  if (r.data.total !== 1 || r.data.products?.[0]?.title !== product.title) {
    throw new Error('published record not visible on public API');
  }
  result.publicPublished = 'PASS';

  const media = await fetch(base + mediaUrl, { cache: 'no-store' });
  if (media.status !== 200 || !(media.headers.get('content-type') || '').startsWith('image/')) {
    throw new Error('uploaded media not served');
  }
  result.mediaServe = 200;

  r = await call('/api/admin/products', {
    method: 'PATCH',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ id, status: 'draft' })
  });
  if (!r.response.ok || r.data.product?.status !== 'draft') throw new Error('unpublish failed');

  r = await call('/api/products?gate=draft');
  if (r.data.total !== 0) throw new Error('draft product leaked to public API');
  result.draftHidden = 'PASS';

  r = await call('/api/admin/products', {
    method: 'PATCH',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ id, status: 'published' })
  });
  if (!r.response.ok || r.data.product?.status !== 'published') throw new Error('republish failed');

  r = await call('/api/products?gate=republished');
  if (r.data.total !== 1) throw new Error('republished product missing');
  result.republish = 'PASS';

  r = await call('/api/admin/products?id=' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: auth
  });
  if (!r.response.ok) throw new Error('delete failed');

  r = await call('/api/products?gate=final');
  if (r.data.total !== 0) throw new Error('catalog not empty after cleanup');
  result.finalEmpty = true;

  const gone = await fetch(base + mediaUrl, { cache: 'no-store' });
  if (gone.status !== 404) throw new Error('deleted product media still exists');
  result.mediaCleanup = 404;

  console.log(JSON.stringify(result, null, 2));
  console.log('BLACKGOLD_BACKEND_INTEGRATION=PASS');
} catch (error) {
  try { await cleanup(); } catch {}
  console.error(error?.stack || error);
  process.exit(2);
}
