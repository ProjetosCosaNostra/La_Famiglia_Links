const API_URL = "http://127.0.0.1:5000/api";
const loginSection = document.getElementById("login-section");
const dashboard = document.getElementById("dashboard");
const message = document.getElementById("login-message");

async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();

  if (data.success) {
    localStorage.setItem("famiglia_token", data.token);
    showDashboard();
  } else {
    message.textContent = "❌ Acesso negado.";
  }
}

async function verifyToken() {
  const token = localStorage.getItem("famiglia_token");
  if (!token) return false;

  const res = await fetch(`${API_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  const data = await res.json();
  return data.valid;
}

async function showDashboard() {
  const valid = await verifyToken();
  if (!valid) {
    logout();
    return;
  }
  loginSection.classList.add("hidden");
  dashboard.classList.remove("hidden");
}

function logout() {
  localStorage.removeItem("famiglia_token");
  loginSection.classList.remove("hidden");
  dashboard.classList.add("hidden");
}

window.onload = () => {
  verifyToken().then(valid => {
    if (valid) showDashboard();
  });
};
