const form = document.querySelector('#productForm');
const statusBox = document.querySelector('#status');
const submitButton = document.querySelector('#submitButton');

const formPayload = () => {
  const values = Object.fromEntries(new FormData(form).entries());
  return {
    title: values.title,
    sku: values.sku,
    category: values.category,
    ml_id: values.ml_id,
    secondary: values.secondary,
    badges: values.badges,
    description: values.description,
    price: values.price,
    buy_cta: values.buy_cta,
    promo_image: values.promo_image,
    affiliate_links: [1,2,3,4,5].map(index => values[`affiliate_${index}`]).filter(Boolean)
  };
};

form.addEventListener('submit', async event => {
  event.preventDefault();
  const token = document.querySelector('#adminToken').value.trim();
  statusBox.textContent = 'Enviando para o catálogo…';
  submitButton.disabled = true;
  try {
    const response = await fetch('./api/admin/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(formPayload())
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `Erro ${response.status}`);
    statusBox.innerHTML = `Produto recebido. A automação foi iniciada${result.issue_url ? ` — <a href="${result.issue_url}" target="_blank" rel="noopener">acompanhar cadastro</a>` : '.'}`;
    const savedToken = document.querySelector('#adminToken').value;
    form.reset();
    document.querySelector('#adminToken').value = savedToken;
  } catch (error) {
    statusBox.textContent = error.message || 'Não foi possível cadastrar o produto.';
  } finally {
    submitButton.disabled = false;
  }
});
