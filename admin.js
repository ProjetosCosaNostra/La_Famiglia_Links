document.addEventListener("DOMContentLoaded", () => {
  const nome = document.getElementById("nome");
  const url = document.getElementById("url");
  const emoji = document.getElementById("emoji");
  const add = document.getElementById("add");
  const lista = document.getElementById("lista");
  const exportar = document.getElementById("exportar");
  const importar = document.getElementById("importar");

  let links = JSON.parse(localStorage.getItem("famiglia_links")) || [];

  const atualizarLista = () => {
    lista.innerHTML = "";
    links.forEach((link, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${link.emoji || "🔗"} ${link.nome}</span>
                      <button class="remover" data-i="${i}">Remover</button>`;
      lista.appendChild(li);
    });
  };

  add.addEventListener("click", () => {
    if (!nome.value || !url.value) return alert("Preencha o nome e a URL!");
    links.push({ nome: nome.value, url: url.value, emoji: emoji.value });
    localStorage.setItem("famiglia_links", JSON.stringify(links));
    nome.value = url.value = emoji.value = "";
    atualizarLista();
  });

  lista.addEventListener("click", e => {
    if (e.target.classList.contains("remover")) {
      const i = e.target.getAttribute("data-i");
      links.splice(i, 1);
      localStorage.setItem("famiglia_links", JSON.stringify(links));
      atualizarLista();
    }
  });

  exportar.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(links, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "LaFamigliaLinks_Backup.json";
    a.click();
  });

  importar.addEventListener("change", e => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = event => {
      links = JSON.parse(event.target.result);
      localStorage.setItem("famiglia_links", JSON.stringify(links));
      atualizarLista();
    };
    reader.readAsText(file);
  });

  atualizarLista();
});
