const base = process.env.BLACKGOLD_BASE || "http://127.0.0.1:8788";
const token = process.env.BLACKGOLD_ADMIN_TOKEN || "";
if (!token) throw new Error("BLACKGOLD_ADMIN_TOKEN missing");
const auth = { authorization: "Bearer " + token };

async function call(path, options={}) {
  const response = await fetch(base + path, { ...options, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function cleanup() {
  const { response, data } = await call("/api/admin/products", { headers: auth });
  if (!response.ok) throw new Error("cleanup list failed " + response.status);
  for (const item of data.products || []) {
    const r = await call("/api/admin/products?id=" + encodeURIComponent(item.id), {
      method: "DELETE",
      headers: auth
    });
    if (!r.response.ok) throw new Error("cleanup delete failed " + item.id + " " + r.response.status);
  }
}

async function uploadPng(name) {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7n8AAAAASUVORK5CYII=",
    "base64"
  );
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), name);
  return call("/api/admin/upload", { method: "POST", headers: auth, body: form });
}

const result = {};
try {
  await cleanup();

  const rootResponse = await fetch(base + "/", { cache: "no-store" });
  const csp = rootResponse.headers.get("content-security-policy") || "";
  if (!rootResponse.ok) throw new Error("root document unavailable " + rootResponse.status);
  if (!csp.includes("https://fonts.googleapis.com") || !csp.includes("https://fonts.gstatic.com")) {
    throw new Error("production CSP would block approved web fonts: " + csp);
  }
  result.productionFontCsp = "PASS";

  let r = await call("/api/products?gate=start");
  if (!r.response.ok || r.data.total !== 0) throw new Error("public catalog must start empty");
  result.startEmpty = true;

  r = await call("/api/admin/products");
  if (r.response.status !== 401) throw new Error("admin endpoint must reject anonymous access");
  result.authGate = 401;

  // Publication must fail without a real uploaded image.
  r = await call("/api/admin/products", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      title: "Invalid missing image",
      category: "Beleza",
      destinationUrl: "https://example.com/invalid",
      status: "published",
      imageKey: "product-00000000-0000-4000-8000-000000000000.png"
    })
  });
  if (r.response.status !== 409 || r.data.code !== "publication_gate") {
    throw new Error("missing-image publication guard failed " + r.response.status);
  }
  result.missingImageBlocked = 409;

  r = await uploadPng("blackgold-ci-1.png");
  if (r.response.status !== 201 || !r.data.key || !r.data.url) {
    throw new Error("image upload failed " + JSON.stringify(r.data));
  }
  const firstKey = r.data.key;
  const firstMediaUrl = r.data.url;
  result.upload = "PASS";

  // Publication must require HTTPS destination.
  r = await call("/api/admin/products", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      title: "Invalid destination",
      category: "Beleza",
      destinationUrl: "http://example.com/not-secure",
      status: "published",
      imageKey: firstKey
    })
  });
  if (r.response.status !== 409 || r.data.code !== "publication_gate") {
    throw new Error("HTTPS publication guard failed " + r.response.status);
  }
  result.insecureDestinationBlocked = 409;

  const product = {
    title: "BlackGold CI Temporary Product",
    brand: "BlackGold QA",
    category: "Beleza",
    description: "Temporary integration-test record. Must be deleted before test exit.",
    currency: "BRL",
    price: "19.90",
    imageKey: firstKey,
    destinationUrl: "https://example.com/blackgold-ci",
    status: "published",
    featured: true,
    order: 1
  };
  r = await call("/api/admin/products", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(product)
  });
  if (r.response.status !== 201 || r.data.product?.status !== "published") {
    throw new Error("create/publish failed " + JSON.stringify(r.data));
  }
  const id = r.data.product.id;
  const slug = r.data.product.slug;
  if (!slug) throw new Error("published product slug missing");
  let version = r.data.product.updatedAt;
  if (!version) throw new Error("create did not return updatedAt");
  result.createPublished = "PASS";

  r = await call("/api/products?gate=published");
  if (r.data.total !== 1 || r.data.products?.[0]?.title !== product.title) {
    throw new Error("published record not visible on public API");
  }
  if (Object.prototype.hasOwnProperty.call(r.data.products?.[0] || {}, "destinationUrl")) {
    throw new Error("public catalog must not expose direct affiliate destinationUrl");
  }
  result.publicPublished = "PASS";
  result.publicDestinationHidden = "PASS";

  let detailResponse = await fetch(base + "/achado/" + encodeURIComponent(slug), { cache: "no-store" });
  let detailHtml = await detailResponse.text();
  if (detailResponse.status !== 200 || !detailHtml.includes(product.title) || !detailHtml.includes('application/ld+json') || !detailHtml.includes('placement=detail') || !detailHtml.includes('"@type":"Product"')) {
    throw new Error("indexable product detail page failed");
  }
  result.productDetailSeo = "PASS";

  let sitemapResponse = await fetch(base + "/sitemap.xml?gate=published", { cache: "no-store" });
  let sitemapText = await sitemapResponse.text();
  if (sitemapResponse.status !== 200 || !String(sitemapResponse.headers.get("content-type")||"").includes("application/xml") || !sitemapText.includes("/achado/" + slug)) {
    throw new Error("published product missing from sitemap");
  }
  const robotsResponse = await fetch(base + "/robots.txt?gate=published", { cache: "no-store" });
  const robotsText = await robotsResponse.text();
  if (!robotsResponse.ok || !robotsText.includes("Sitemap: https://blackgold-beauty-finds-novo.pages.dev/sitemap.xml")) {
    throw new Error("robots sitemap declaration missing");
  }
  result.dynamicSitemap = "PASS";

  r = await call("/api/admin/metrics", { headers: auth });
  const metricBeforeBot = Number(r.data.summary?.total||0);
  const botClick = await fetch(base + "/api/out?id=" + encodeURIComponent(id) + "&placement=showcase", {
    redirect: "manual",
    cache: "no-store",
    headers: { "user-agent": "Googlebot/2.1" }
  });
  if (botClick.status !== 302 || botClick.headers.get("x-blackgold-click-tracking") !== "skipped") {
    throw new Error("crawler click filtering failed");
  }
  r = await call("/api/admin/metrics", { headers: auth });
  if (Number(r.data.summary?.total||0) !== metricBeforeBot) {
    throw new Error("crawler traffic polluted click metrics");
  }
  result.botClickExcluded = "PASS";

  const trackedClick = await fetch(base + "/api/out?id=" + encodeURIComponent(id) + "&placement=selection", {
    redirect: "manual",
    cache: "no-store"
  });
  if (trackedClick.status !== 302 || trackedClick.headers.get("location") !== product.destinationUrl || trackedClick.headers.get("x-blackgold-click-tracking") !== "queued") {
    throw new Error("tracked outbound redirect failed " + trackedClick.status);
  }
  let metricRecorded=false;
  for(let attempt=0;attempt<40&&!metricRecorded;attempt++){
    r = await call("/api/admin/metrics", { headers: auth });
    metricRecorded=Boolean(r.response.ok && r.data.products?.some(x => x.productId === id && x.total >= 1));
    if(!metricRecorded)await new Promise(resolve=>setTimeout(resolve,25));
  }
  if(!metricRecorded)throw new Error("affiliate click metrics missing after async queue");
  result.outboundTracking = { redirect: 302, tracking: "queued", metrics: "PASS" };

  let exportResponse = await fetch(base + "/api/admin/metrics-export", {
    headers: auth,
    cache: "no-store"
  });
  const exportBody = await exportResponse.text();
  if (exportResponse.status !== 200 || !exportBody.includes('"product_id"') || !exportBody.includes(product.title)) {
    throw new Error("metrics CSV export failed");
  }
  result.metricsCsvExport = "PASS";

  exportResponse = await fetch(base + "/api/admin/metrics-export", { cache: "no-store" });
  if (exportResponse.status !== 401) throw new Error("metrics CSV export must reject anonymous access");
  result.metricsCsvAuthGate = 401;

  r = await call("/api/admin/metrics");
  if (r.response.status !== 401) throw new Error("metrics endpoint must reject anonymous access");
  result.metricsAuthGate = 401;

  let media = await fetch(base + firstMediaUrl, { cache: "no-store" });
  if (media.status !== 200 || !(media.headers.get("content-type") || "").startsWith("image/")) {
    throw new Error("uploaded media not served");
  }
  result.mediaServe = 200;

  // An image linked to a product cannot be deleted through the abandoned-upload endpoint.
  r = await call("/api/admin/upload?key=" + encodeURIComponent(firstKey), {
    method: "DELETE",
    headers: auth
  });
  if (r.response.status !== 409 || r.data.code !== "media_in_use") {
    throw new Error("in-use media delete guard failed " + r.response.status);
  }
  result.inUseMediaProtected = 409;

  // Edit then rollback through revision history. This protects approved product data from accidental edits.
  const staleVersion = version;
  r = await call("/api/admin/products", {
    method: "PATCH",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ id, expectedUpdatedAt: version, title: "BlackGold CI Accidentally Changed" })
  });
  if (!r.response.ok || r.data.product?.title !== "BlackGold CI Accidentally Changed") {
    throw new Error("revision seed update failed");
  }
  version = r.data.product.updatedAt;
  if (!version || version === staleVersion) throw new Error("updatedAt did not advance after update");

  r = await call("/api/admin/products", {
    method: "PATCH",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ id, expectedUpdatedAt: staleVersion, brand: "SHOULD NOT APPLY" })
  });
  if (r.response.status !== 409 || r.data.code !== "stale_product") {
    throw new Error("stale write was not blocked " + r.response.status + " " + JSON.stringify(r.data));
  }
  if (r.data.current?.title !== "BlackGold CI Accidentally Changed") {
    throw new Error("stale conflict did not return current state");
  }
  result.staleWriteBlocked = 409;

  r = await call("/api/admin/products", {
    method: "PATCH",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ id, title: "Missing precondition" })
  });
  if (r.response.status !== 428 || r.data.code !== "expected_updated_at_required") {
    throw new Error("missing precondition was not blocked");
  }
  result.missingPreconditionBlocked = 428;

  r = await call("/api/admin/revisions?productId=" + encodeURIComponent(id) + "&limit=10", { headers: auth });
  if (!r.response.ok || !Array.isArray(r.data.revisions) || !r.data.revisions.length) {
    throw new Error("revision history unavailable");
  }
  const originalRevision = r.data.revisions.find(x => x.reason === "update" && x.snapshot?.title === product.title);
  if (!originalRevision) throw new Error("original revision snapshot missing");

  r = await call("/api/admin/revisions", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ revisionId: originalRevision.id })
  });
  if (!r.response.ok || r.data.product?.title !== product.title || r.data.product?.status !== "published") {
    throw new Error("product rollback failed " + JSON.stringify(r.data));
  }
  version = r.data.product.updatedAt;
  result.revisionRollback = "PASS";

  r = await call("/api/admin/revisions?productId=" + encodeURIComponent(id));
  if (r.response.status !== 401) throw new Error("revision endpoint must reject anonymous access");
  result.revisionAuthGate = 401;

  // Replace image and prove the old R2 object is cleaned only after successful DB update.
  r = await uploadPng("blackgold-ci-2.png");
  if (r.response.status !== 201) throw new Error("second image upload failed");
  const secondKey = r.data.key;
  const secondMediaUrl = r.data.url;

  r = await call("/api/admin/products", {
    method: "PATCH",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ id, expectedUpdatedAt: version, imageKey: secondKey })
  });
  if (!r.response.ok || r.data.product?.imageKey !== secondKey) {
    throw new Error("image replacement failed");
  }
  version = r.data.product.updatedAt;
  const oldAfterReplace = await fetch(base + firstMediaUrl, { cache: "no-store" });
  const newAfterReplace = await fetch(base + secondMediaUrl, { cache: "no-store" });
  if (oldAfterReplace.status !== 404 || newAfterReplace.status !== 200) {
    throw new Error("replacement media cleanup failed " + oldAfterReplace.status + "/" + newAfterReplace.status);
  }
  result.replaceImageCleanup = { old: 404, current: 200 };

  // Roll back the image replacement and prove the archived first image is restored losslessly.
  r = await call("/api/admin/revisions?productId=" + encodeURIComponent(id) + "&limit=20", { headers: auth });
  if (!r.response.ok) throw new Error("revision list after image replacement failed");
  const imageRevision = r.data.revisions?.find(x => x.reason === "update" && x.snapshot?.imageKey === firstKey && x.snapshot?.imageArchived === true);
  if (!imageRevision) throw new Error("archived image revision missing");

  r = await call("/api/admin/revisions", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ revisionId: imageRevision.id })
  });
  if (!r.response.ok || r.data.product?.imageKey !== firstKey) {
    throw new Error("archived image rollback failed " + JSON.stringify(r.data));
  }
  version = r.data.product.updatedAt;
  const firstAfterRollback = await fetch(base + firstMediaUrl, { cache: "no-store" });
  const secondAfterRollback = await fetch(base + secondMediaUrl, { cache: "no-store" });
  if (firstAfterRollback.status !== 200 || secondAfterRollback.status !== 404) {
    throw new Error("lossless image rollback media state failed " + firstAfterRollback.status + "/" + secondAfterRollback.status);
  }
  result.losslessImageRollback = { restored: 200, replacedCurrentArchived: 404 };

  r = await call("/api/admin/products", {
    method: "PATCH",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ id, expectedUpdatedAt: version, status: "draft" })
  });
  if (!r.response.ok || r.data.product?.status !== "draft") throw new Error("unpublish failed");
  version = r.data.product.updatedAt;

  r = await call("/api/products?gate=draft");
  if (r.data.total !== 0) throw new Error("draft product leaked to public API");
  detailResponse = await fetch(base + "/achado/" + encodeURIComponent(slug), { cache: "no-store" });
  if (detailResponse.status !== 404) throw new Error("draft product detail page must be hidden");
  sitemapResponse = await fetch(base + "/sitemap.xml?gate=draft", { cache: "no-store" });
  sitemapText = await sitemapResponse.text();
  if (sitemapText.includes("/achado/" + slug)) throw new Error("draft product leaked into sitemap");
  result.draftHidden = "PASS";

  const draftRedirect = await fetch(base + "/api/out?id=" + encodeURIComponent(id) + "&placement=showcase", {
    redirect: "manual",
    cache: "no-store"
  });
  if (draftRedirect.status !== 404) throw new Error("draft product outbound redirect must be blocked");
  result.draftOutboundBlocked = 404;

  r = await call("/api/admin/products", {
    method: "PATCH",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ id, expectedUpdatedAt: version, status: "published" })
  });
  if (!r.response.ok || r.data.product?.status !== "published") throw new Error("republish failed");
  version = r.data.product.updatedAt;

  r = await call("/api/products?gate=republished");
  if (r.data.total !== 1) throw new Error("republished product missing");
  detailResponse = await fetch(base + "/achado/" + encodeURIComponent(slug), { cache: "no-store" });
  if (detailResponse.status !== 200) throw new Error("republished product detail page missing");
  result.republish = "PASS";

  r = await call("/api/admin/products?id=" + encodeURIComponent(id), {
    method: "DELETE",
    headers: auth
  });
  if (!r.response.ok) throw new Error("delete failed");

  r = await call("/api/products?gate=deleted");
  if (r.data.total !== 0) throw new Error("deleted product leaked public");
  media = await fetch(base + firstMediaUrl, { cache: "no-store" });
  if (media.status !== 404) throw new Error("deleted product source media still exists");
  result.deletedMediaSourceRemoved = 404;

  r = await call("/api/admin/trash?limit=20", { headers: auth });
  if (!r.response.ok || !Array.isArray(r.data.items)) throw new Error("trash endpoint unavailable");
  const deletedItem = r.data.items.find(x => x.productId === id);
  if (!deletedItem || !deletedItem.imageArchived || !deletedItem.imageRecoverable) {
    throw new Error("deleted product was not recoverably archived " + JSON.stringify(r.data));
  }
  result.trashArchive = "PASS";

  r = await call("/api/admin/trash?limit=5");
  if (r.response.status !== 401) throw new Error("trash endpoint must reject anonymous access");
  result.trashAuthGate = 401;

  r = await call("/api/admin/revisions", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ revisionId: deletedItem.revisionId })
  });
  if (!r.response.ok || r.data.product?.id !== id || r.data.product?.imageKey !== firstKey) {
    throw new Error("trash restore failed " + JSON.stringify(r.data));
  }
  version = r.data.product.updatedAt;
  media = await fetch(base + firstMediaUrl, { cache: "no-store" });
  if (media.status !== 200) throw new Error("trash restore did not recover media");
  r = await call("/api/products?gate=trash-restored");
  if (r.data.total !== 1 || r.data.products?.[0]?.id !== id) {
    throw new Error("trash restore did not republish original product");
  }
  result.trashRestore = { product: "PASS", media: 200 };

  // Final cleanup leaves the catalog empty while preserving another recoverable trash revision.
  r = await call("/api/admin/products?id=" + encodeURIComponent(id), {
    method: "DELETE",
    headers: auth
  });
  if (!r.response.ok) throw new Error("final delete failed");

  r = await call("/api/products?gate=final");
  if (r.data.total !== 0) throw new Error("catalog not empty after cleanup");
  result.finalEmpty = true;

  media = await fetch(base + firstMediaUrl, { cache: "no-store" });
  if (media.status !== 404) throw new Error("final deleted product media still exists");
  result.mediaCleanup = 404;

  r = await call("/api/admin/audit?limit=100", { headers: auth });
  if (!r.response.ok || !Array.isArray(r.data.events)) throw new Error("audit receipts unavailable");
  const auditTypes = new Set(r.data.events.map(e => e.type));
  for (const required of ["product_created","product_updated","product_deleted"]) {
    if (!auditTypes.has(required)) throw new Error("missing audit receipt " + required);
  }
  result.auditReceipts = ["product_created","product_updated","product_deleted"];

  r = await call("/api/admin/audit?limit=5");
  if (r.response.status !== 401) throw new Error("audit endpoint must reject anonymous access");
  result.auditAuthGate = 401;

  console.log(JSON.stringify(result, null, 2));
  console.log("BLACKGOLD_BACKEND_INTEGRATION=PASS");
} catch (error) {
  try { await cleanup(); } catch {}
  console.error(error?.stack || error);
  process.exit(2);
}
