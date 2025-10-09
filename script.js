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
