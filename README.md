<h1 align="center">🎩 La Famiglia Links</h1>
<p align="center"><em>“Onde os aliados se conectam.”</em></p>

---

<p align="center">
  <img src="https://img.shields.io/badge/Status-Em%20Produção%20⚜️-black?style=for-the-badge&logo=flask">
  <img src="https://img.shields.io/badge/Framework-Flask%203.0.3-gold?style=for-the-badge&logo=python">
  <img src="https://img.shields.io/badge/Deploy-Render%20☁️-black?style=for-the-badge&logo=render">
</p>

---

> ⚜️ *Família, honra, respeito e palavra. No fim, é só isso que fica.*

---

## 🏛️ Identidade da Família

**La Famiglia Links** é o hub oficial da **Cosa Nostra Systems**,  
um SaaS cinematográfico que centraliza e automatiza **links, afiliados, IA e campanhas**  
com a elegância da tradição e a precisão da tecnologia.

> *Nada é coincidência, é estratégia.*

---

<details>
<summary><b>🧩 Estrutura Geral</b></summary>

```
La_Famiglia_Links/
│
├── app.py                  → Aplicação principal Flask
├── Procfile                → Inicialização (Render/Heroku)
├── runtime.txt             → Versão Python 3.10.14
├── requirements.txt        → Dependências do sistema
├── Dockerfile              → Build principal
├── docker-compose.yml      → Execução local
│
├── routes/                 → Rotas (auth, links, IA)
├── models/                 → Banco de dados e ORM
├── business/               → Painel Business + automação
├── templates/              → Páginas HTML
├── static/                 → CSS, imagens, assets
└── ai_service/             → Microserviço de IA (textos/imagens)
```

</details>

---

## ⚙️ Instalação Local

<details>
<summary><b>💻 Passo a passo</b></summary>

### 1️⃣ Clonar o projeto
```bash
git clone https://github.com/ProjetosCosaNostra/La_Famiglia_Links.git
cd La_Famiglia_Links
```

### 2️⃣ Instalar dependências
```bash
pip install -r requirements.txt
```

### 3️⃣ Executar o app
```bash
python app.py
```

### 4️⃣ Acessar
```
http://127.0.0.1:10000/
```

</details>

---

## ☁️ Deploy no Render

<details>
<summary><b>⚜️ Configuração completa (Render)</b></summary>

### 1️⃣ Suba para o GitHub
```bash
git add .
git commit -m "Deploy La Famiglia"
git push origin main
```

### 2️⃣ Crie o serviço em [Render.com](https://render.com)
- **Environment:** Python 3  
- **Build Command:** `pip install -r requirements.txt`  
- **Start Command:** `gunicorn app:app`  
- **Port:** `10000`

### 3️⃣ Adicione variáveis de ambiente
| Variável | Valor |
|-----------|--------|
| `FLASK_ENV` | production |
| `PORT` | 10000 |
| `HUGGINGFACE_API_KEY` | (seu token da Hugging Face) |

🔑 Gere sua chave em: [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

</details>

---

## 🧠 Painel Business (IA + Automação)

<details>
<summary><b>🤖 Funções do módulo Business</b></summary>

| Função | Descrição |
|--------|------------|
| 🧩 **Geração de Texto** | IA cria legendas e descrições automáticas |
| 🎨 **Geração de Imagem** | Cria posts cinematográficos estilo mafioso |
| 📈 **Tendências** | Analisa termos e produtos em alta |
| 🔁 **Postagens Automáticas** | Integração com redes sociais (em desenvolvimento) |

**Endpoints úteis:**
```bash
/business/api/status
/business/api/gerar_texto
/business/api/gerar_imagem
```

</details>

---

## 🔐 Acesso Administrativo

<details>
<summary><b>🕴️ Painel de Controle</b></summary>

🔸 **URL:**  
[https://la-famiglia-links.onrender.com/auth/login](https://la-famiglia-links.onrender.com/auth/login)

🔸 **Credenciais padrão:**  
```
Usuário: admin
Senha: admin123
```

Após o primeiro login, altere a senha pelo painel.

</details>

---

## 📊 Banco de Dados Automático

<details>
<summary><b>🧱 Estrutura</b></summary>

| Tabela | Função |
|--------|--------|
| `users` | Armazena administradores e membros |
| `links` | Centraliza todos os links da Família |

> ⚙️ O banco é inicializado automaticamente no primeiro deploy.

</details>

---

## 🎨 Estética Cinematográfica

<details>
<summary><b>🖌️ Visual e Estilo</b></summary>

- Fundo preto com toques dourados ✨  
- Tipografia **Cinzel**, estilo romano e autoritário  
- Sombras suaves e bordas arredondadas  
- Layout responsivo 9:16 (mobile)  
- Frases oficiais:
  - “Família, honra, respeito e palavra.”
  - “Nada é coincidência, é estratégia.”
  - “Onde os aliados se conectam.”

</details>

---

## 🌐 URLs Principais

| Caminho | Função |
|----------|--------|
| `/` | Hub principal da Família |
| `/links` | Gerenciar links afiliados |
| `/auth/login` | Painel administrativo |
| `/business` | Painel IA e automação |
| `/api` | Endpoints técnicos de IA |

---

## 💼 Tecnologias Principais

<p align="center">
  <img src="https://skillicons.dev/icons?i=python,flask,sqlite,html,css,git,docker" height="45">
</p>

| Camada | Stack |
|---------|--------|
| Backend | Flask + SQLAlchemy |
| Frontend | HTML5 + CSS3 |
| Deploy | Render (Gunicorn + Docker) |
| IA | Hugging Face (Transformers + Diffusers) |

---

## 👑 Filosofia da Família

> *“Família, honra, respeito e palavra. No fim, é só isso que fica.”*  
>  
> **La Famiglia Links** é mais que um SaaS — é uma aliança silenciosa entre tecnologia e legado.  
> Cada linha de código, cada automação, cada link...  
> tudo serve a um propósito maior: **estratégia e domínio.**

---

## 👨‍💻 Autor & Organização

| Nome | Afiliação | Contato |
|------|------------|----------|
| **Felipe Rosa Gomes** | Projetos Cosa Nostra AI | [GitHub](https://github.com/ProjetosCosaNostra) |
| **Cosa Nostra Systems** | Ecosistema oficial da Família | [La Famiglia Links (Render)](https://la-famiglia-links.onrender.com) |

---

## ⚖️ Licença

> Este projeto é de uso **privado e estratégico**, pertencente à **Cosa Nostra Systems**.  
> Cópias, redistribuições ou reutilizações não autorizadas serão tratadas como *traição à Família.*

---

<p align="center">
  <img src="https://img.shields.io/badge/La%20Famiglia%20Links-ON%20AIR%20🎩-gold?style=for-the-badge">
</p>

<p align="center"><em>“Onde os aliados se conectam.”</em></p>
