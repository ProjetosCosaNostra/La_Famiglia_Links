document.addEventListener("DOMContentLoaded", () => {
  fetch("data/config.json")
    .then(res => res.json())
    .then(data => {
      const container = document.getElementById("links-container");
      data.links.forEach(item => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          <img src="${item.imagem}" alt="${item.nome}" />
          <h3>${item.nome}</h3>
          <p>${item.descricao}</p>
          <a href="${item.link}" target="_blank">🎩 Comprar com a Família</a>
        `;
        container.appendChild(card);
      });
    })
    .catch(err => console.error("Erro ao carregar links:", err));
});
// 🎵 Controle de música ambiente Cosa Nostra
document.addEventListener("DOMContentLoaded", () => {
  const music = document.getElementById("bg-music");
  const control = document.getElementById("music-control");
  let tocando = false;

  control.addEventListener("click", () => {
    if (tocando) {
      music.pause();
      control.textContent = "🔇";
    } else {
      music.play().catch(() => {
        console.warn("Usuário precisa interagir para iniciar o áudio.");
      });
      control.textContent = "🎶";
    }
    tocando = !tocando;
  });
});
