(function () {
  // nav toggle 
  const toggle = document.getElementById("navToggle");
  const menu = document.getElementById("navMenu");

  function authHeaders(extra = {}) {
    const token = localStorage.getItem("bb_token");
    return {
      ...extra,
      Authorization: `Bearer ${token}`
    };
  }
  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      const isOpen = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    menu.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 1100) {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Footer year 
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // Auth guard 
  const path = window.location.pathname.toLowerCase();
  const page = path.substring(path.lastIndexOf("/") + 1);

  const publicPages = ["login.html", "index.html"];
  const token = localStorage.getItem("bb_token");

  if (!token && !publicPages.includes(page)) {
    window.location.href = "login.html";
    return;
  }

  if (token && page === "login.html") {
    window.location.href = "dashboard.html";
    return;
  }

  const logoutButtons = [
    document.getElementById("logoutBtn"),
    document.getElementById("logoutBtn2"),
  ].filter(Boolean);

  logoutButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      localStorage.removeItem("bb_token");
      localStorage.removeItem("bb_user");
      localStorage.removeItem("bb_user_email");
      window.location.href = "login.html";
    });
  });
})();