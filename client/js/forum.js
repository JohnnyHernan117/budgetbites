(function () {
  const API_BASE = "https://budgetbites-api.onrender.com/api";
  const postsList = document.getElementById("forumPostsList");
  const form = document.getElementById("forumPostForm");
  const titleInput = document.getElementById("forumTitle");
  const bodyInput = document.getElementById("forumBody");
  const tagsInput = document.getElementById("forumTags");
  const msgEl = document.getElementById("forumMsg");

  function esc(s) {
    return String(s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function authHeaders(extra = {}) {
    const token = localStorage.getItem("bb_token");
    return {
      ...extra,
      Authorization: `Bearer ${token}`
    };
  }

  function msg(text, ok = true) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = "form-message" + (ok ? " success" : " error");
    setTimeout(() => {
      msgEl.textContent = "";
      msgEl.className = "form-message";
    }, 2500);
  }

  function formatDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Just now";
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function renderPosts(posts) {
    if (!postsList) return;

    if (!Array.isArray(posts) || !posts.length) {
      postsList.innerHTML = `
        <div class="forum-item">
          <div style="font-weight:700;">No posts yet</div>
          <div class="muted" style="margin-top:6px;">Be the first to share a tip or question.</div>
        </div>
      `;
      return;
    }

    postsList.innerHTML = posts
      .map((p) => {
        const tags = Array.isArray(p.tags) ? p.tags : [];
        return `
          <div class="forum-item" style="margin-top:12px;">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
              <div style="font-weight:800;color:var(--text);font-size:1.02rem;">
                ${esc(p.title)}
              </div>
              <div class="muted" style="font-size:.85rem;white-space:nowrap;">
                ${esc(formatDate(p.createdAt || p.created_at))}
              </div>
            </div>

            <div class="muted" style="margin-top:6px;font-size:.92rem;">
              Posted by <strong>${esc(p.authorName || "BudgetBites User")}</strong>            </div>

            <div style="margin-top:10px;line-height:1.5;color:var(--text);">
              ${esc(p.body)}
            </div>

            <div class="tagrow" style="margin-top:12px;">
              ${tags.map((t) => `<div class="tag">${esc(t)}</div>`).join("")}
            </div>
          </div>
        `;
      })
      .join("");
  }

  async function loadPosts() {
    try {
      const res = await fetch(`${API_BASE}/forum`);
      if (!res.ok) throw new Error("Failed to load forum posts");
      const posts = await res.json();
      renderPosts(posts);
    } catch (err) {
      console.error(err);
      if (postsList) {
        postsList.innerHTML = `
          <div class="forum-item">
            <div style="font-weight:700;">Could not load posts</div>
            <div class="muted" style="margin-top:6px;">Make sure the backend is running.</div>
          </div>
        `;
      }
    }
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = (titleInput?.value || "").trim();
    const body = (bodyInput?.value || "").trim();
    const tags = (tagsInput?.value || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (!title || !body) {
      msg("Please enter both a title and a post.", false);
      return;
    }

    const payload = {
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      title,
      body,
      tags
    };

    try {
      const res = await fetch(`${API_BASE}/forum`, {
        method: "POST",
        headers: authHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create post");
      }

      form.reset();
      msg("Post created.", true);
      loadPosts();
    } catch (err) {
      console.error(err);
      msg(err.message || "Could not create post.", false);
    }
  });

  loadPosts();
})();