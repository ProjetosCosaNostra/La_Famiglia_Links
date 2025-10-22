// ========================================================
// 🎩 COSA NOSTRA — SCRIPT PRINCIPAL (frontend/script.js)
// Autor: Felipe — O Capo da Criação
// Data: 2025
// Função: controlar interface + comunicação com backend Flask
// ========================================================

console.log("🎩 Cosa Nostra — Sistema iniciado");

// ======== CONFIGURAÇÕES BÁSICAS ===========
const API_BASE = "http://127.0.0.1:5000";
const linksContainer = document.querySelector(".links");
const statusBox = document.getElementById("status");
const postCountInput = document.getElementById("postCount");
const btnGerar = document.getElementById("btnGerar");
const btnSincronizar = document.getElementById("btnSync");

// ==========================================
// 🧩 FUNÇÃO: Atualizar Status
// ==========================================
function atualizarStatus(msg, tipo = "info") {
  if (!statusBox) return;
  statusBox.textContent = msg;
  statusBox.className = `status ${tipo}`;
  console.log(`💬 ${msg}`);
}

// ==========================================
// 🧱 FUNÇÃO: Carregar Links do Banco
// ==========================================
async function carregarLinks() {
  try {
    const res = await fetch(`${API_BASE}/api/links`);
    const data = await res.json();

    if (linksContainer && Array.isArray(data.links)) {
      linksContainer.innerHTML = "";
      data.links.forEach(link => {
        const el = document.createElement("a");
        el.href = link.url;
        el.textContent = `${link.titulo || "🔗 Link"} (${link.plataforma})`;
        el.classList.add("link-btn");
        el.target = "_blank";
        linksContainer.appendChild(el);
      });
      atualizarStatus("✅ Links carregados com sucesso!");
    } else {
      atualizarStatus("⚠️ Nenhum link encontrado no servidor.", "aviso");
    }
  } catch (err) {
    console.error(err);
    atualizarStatus("❌ Erro ao conectar com o servidor Flask.", "erro");
  }
}

// ==========================================
// ⚙️ FUNÇÃO: Gerar Publicações Automáticas
// ==========================================
async function gerarPublicacoes() {
  const qtd = postCountInput ? parseInt(postCountInput.value) || 1 : 1;
  atualizarStatus(`♟️ Gerando ${qtd} postagens automáticas...`);

  try {
    const res = await fetch(`${API_BASE}/api/gerar_posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantidade: qtd })
    });

    const data = await res.json();
    if (data.sucesso) {
      atualizarStatus(`✅ ${data.mensagem}`);
    } else {
      atualizarStatus(`⚠️ ${data.mensagem || "Falha ao gerar posts."}`, "aviso");
    }
  } catch (err) {
    console.error(err);
    atualizarStatus("❌ Erro na geração automática de posts.", "erro");
  }
}

// ==========================================
// 🔄 FUNÇÃO: Sincronizar com APIs externas
// ==========================================
async function sincronizarAPIs() {
  atualizarStatus("🧭 Sincronizando com Mercado Livre e Amazon...");
  try {
    const res = await fetch(`${API_BASE}/api/sincronizar`);
    const data = await res.json();
    if (data.sucesso) {
      atualizarStatus("✅ Sincronização concluída!");
    } else {
      atualizarStatus("⚠️ Falha na sincronização.", "aviso");
    }
  } catch (err) {
    console.error(err);
    atualizarStatus("❌ Erro de comunicação com APIs externas.", "erro");
  }
}

// ==========================================
// 🧭 EVENTOS DE INTERFACE
// ==========================================
if (btnGerar) btnGerar.addEventListener("click", gerarPublicacoes);
if (btnSincronizar) btnSincronizar.addEventListener("click", sincronizarAPIs);

// ==========================================
// 🚀 AUTOEXECUÇÃO AO INICIAR
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  atualizarStatus("🎩 Sistema iniciado — Cosa Nostra pronta para agir!");
  carregarLinks();
});
