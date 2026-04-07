document.getElementById("year").textContent = new Date().getFullYear();

const API_BASE = "http://localhost:3000/api";

const msg = (id, text, ok = true) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = "form-message" + (ok ? " success" : " error");
  setTimeout(() => {
    el.textContent = "";
    el.className = "form-message";
  }, 2500);
};

document.getElementById("togglePw")?.addEventListener("click", () => {
  const pw = document.getElementById("password");
  if (!pw) return;
  pw.type = pw.type === "password" ? "text" : "password";
});

document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = (document.getElementById("email")?.value || "").trim();
  const password = (document.getElementById("password")?.value || "").trim();

  if (!email || !password) {
    msg("loginMsg", "Please enter email and password.", false);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Login failed");
    }

    localStorage.setItem("bb_token", data.token);
    localStorage.setItem("bb_user", data.user.name);
    localStorage.setItem("bb_user_email", data.user.email);

    msg("loginMsg", "Logged in successfully.", true);
    window.location.href = "dashboard.html";
  } catch (err) {
    console.error(err);
    msg("loginMsg", err.message || "Could not log in.", false);
  }
});

document.getElementById("signupForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = (document.getElementById("signupName")?.value || "").trim();
  const email = (document.getElementById("signupEmail")?.value || "").trim();
  const password = (document.getElementById("signupPassword")?.value || "").trim();

  if (!name || !email || !password) {
    msg("signupMsg", "Please complete all signup fields.", false);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Signup failed");
    }

    localStorage.setItem("bb_token", data.token);
    localStorage.setItem("bb_user", data.user.name);
    localStorage.setItem("bb_user_email", data.user.email);

    msg("signupMsg", "Account created successfully.", true);
    window.location.href = "dashboard.html";
  } catch (err) {
    console.error(err);
    msg("signupMsg", err.message || "Could not create account.", false);
  }
});