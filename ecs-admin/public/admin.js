(() => {
  const loginView = document.querySelector("[data-login-view]");
  const adminView = document.querySelector("[data-admin-view]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginMessage = document.querySelector("[data-login-message]");
  const editorForm = document.querySelector("[data-editor-form]");
  const articleList = document.querySelector("[data-article-list]");
  const searchInput = document.querySelector("[data-search]");
  const filterSelect = document.querySelector("[data-filter]");
  const editorTitle = document.querySelector("[data-editor-title]");
  const editorMessage = document.querySelector("[data-editor-message]");
  const publishState = document.querySelector("[data-publish-state]");
  const accentPreview = document.querySelector("[data-accent-preview]");
  const accentName = document.querySelector("[data-accent-name]");
  const deleteButton = document.querySelector("[data-delete]");
  const deleteDialog = document.querySelector("[data-delete-dialog]");
  const deleteCopy = document.querySelector("[data-delete-copy]");
  const totalCount = document.querySelector("[data-total-count]");
  const statusLabels = { published: "已发布", draft: "草稿", archived: "已归档" };
  const accentLabels = { mint: "薄荷绿", coral: "珊瑚橙", sky: "天空蓝" };
  const categoryAccents = { 项目经验: "mint", 生活随想: "sky" };
  let articles = [];
  let selectedId = null;
  let busy = false;

  const api = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: options.body
        ? { "Content-Type": "application/json", ...(options.headers || {}) }
        : options.headers,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.publish?.warning || "请求失败");
    return payload;
  };

  const setBusy = (value) => {
    busy = value;
    document.querySelectorAll("button").forEach((button) => {
      if (!button.matches("[data-logout]")) button.disabled = value;
    });
  };

  const formatToday = () => {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join(".");
  };

  const showLogin = () => {
    loginView.hidden = false;
    adminView.hidden = true;
  };

  const showAdmin = async () => {
    loginView.hidden = true;
    adminView.hidden = false;
    await loadArticles();
  };

  const currentArticle = () => articles.find((article) => article.id === selectedId) || null;

  const updateAccentPreview = () => {
    const accent = editorForm.elements.accent.value;
    accentPreview.className = `accent-preview accent-${accent}`;
    accentName.textContent = accentLabels[accent] || accent;
  };

  const syncCategoryAccent = ({ useDefault = false } = {}) => {
    const category = editorForm.elements.category.value;
    const accentSelect = editorForm.elements.accent;
    if (useDefault || category === "项目经验") {
      accentSelect.value = categoryAccents[category] || "mint";
    }
    accentSelect.disabled = category === "项目经验";
    updateAccentPreview();
  };

  const resetEditor = () => {
    selectedId = null;
    editorForm.reset();
    editorForm.elements.category.value = "项目经验";
    editorForm.elements.date.value = formatToday();
    editorForm.elements.readTime.value = "5 分钟";
    editorForm.elements.accent.value = "mint";
    editorForm.elements.status.value = "draft";
    syncCategoryAccent();
    editorTitle.textContent = "新建文章";
    editorMessage.textContent = "";
    deleteButton.hidden = true;
    renderList();
  };

  const fillEditor = (article) => {
    selectedId = article.id;
    for (const name of ["category", "date", "readTime", "title", "excerpt", "body", "accent", "status"]) {
      editorForm.elements[name].value = article[name] || "";
    }
    syncCategoryAccent();
    editorTitle.textContent = "编辑文章";
    editorMessage.textContent = "";
    deleteButton.hidden = false;
    renderList();
  };

  const renderList = () => {
    const query = searchInput.value.trim().toLowerCase();
    const status = filterSelect.value;
    const filtered = articles.filter((article) => {
      const matchesQuery = !query || `${article.title} ${article.excerpt} ${article.category}`.toLowerCase().includes(query);
      const matchesStatus = status === "all" || article.status === status;
      return matchesQuery && matchesStatus;
    });

    articleList.replaceChildren();
    totalCount.textContent = String(articles.length);
    if (!filtered.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "没有符合条件的文章";
      articleList.append(empty);
      return;
    }

    filtered.forEach((article) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `article-item${article.id === selectedId ? " selected" : ""}`;
      const heading = document.createElement("h3");
      heading.textContent = article.title || "未命名文章";
      const meta = document.createElement("span");
      meta.className = "article-meta";
      const badge = document.createElement("span");
      badge.className = `status ${article.status}`;
      badge.textContent = statusLabels[article.status] || article.status;
      meta.append(badge, document.createTextNode(`${article.category} · ${article.date}`));
      item.append(heading, meta);
      item.addEventListener("click", () => fillEditor(article));
      articleList.append(item);
    });
  };

  const loadArticles = async () => {
    const payload = await api("/api/articles");
    articles = payload.articles || [];
    renderList();
    if (selectedId) {
      const selected = currentArticle();
      if (selected) fillEditor(selected);
      else resetEditor();
    } else if (!editorForm.elements.date.value) {
      resetEditor();
    }
  };

  const formPayload = (forcedStatus) => ({
    category: editorForm.elements.category.value,
    date: editorForm.elements.date.value,
    readTime: editorForm.elements.readTime.value,
    title: editorForm.elements.title.value,
    excerpt: editorForm.elements.excerpt.value,
    body: editorForm.elements.body.value,
    accent: editorForm.elements.accent.value,
    status: forcedStatus || editorForm.elements.status.value,
  });

  const saveArticle = async (forcedStatus) => {
    if (!editorForm.reportValidity() || busy) return;
    setBusy(true);
    editorMessage.textContent = "正在保存并同步…";
    try {
      const payload = formPayload(forcedStatus);
      const result = await api(selectedId ? `/api/articles/${encodeURIComponent(selectedId)}` : "/api/articles", {
        method: selectedId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      selectedId = result.article.id;
      editorForm.elements.status.value = result.article.status;
      publishState.textContent = result.publish?.published ? "GitHub Pages 已同步" : "文章已保存，等待重试";
      editorMessage.textContent = result.publish?.warning || (result.article.status === "published" ? "文章已发布" : "文章已保存");
      await loadArticles();
    } catch (error) {
      editorMessage.textContent = error.message;
    } finally {
      setBusy(false);
    }
  };

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginMessage.textContent = "正在登录…";
    try {
      await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          username: loginForm.elements.username.value,
          password: loginForm.elements.password.value,
        }),
      });
      loginForm.elements.password.value = "";
      loginMessage.textContent = "";
      await showAdmin();
    } catch (error) {
      loginMessage.textContent = error.message;
    }
  });

  editorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveArticle();
  });
  document.querySelector("[data-publish]").addEventListener("click", () => void saveArticle("published"));
  document.querySelector("[data-new-article]").addEventListener("click", resetEditor);
  searchInput.addEventListener("input", renderList);
  filterSelect.addEventListener("change", renderList);
  editorForm.elements.category.addEventListener("change", () => syncCategoryAccent({ useDefault: true }));
  editorForm.elements.accent.addEventListener("change", updateAccentPreview);

  deleteButton.addEventListener("click", () => {
    const article = currentArticle();
    if (!article) return;
    deleteCopy.textContent = `“${article.title}”删除后无法在后台恢复，但服务器仍会保留近期备份。`;
    deleteDialog.showModal();
  });
  document.querySelector("[data-cancel-delete]").addEventListener("click", () => deleteDialog.close());
  document.querySelector("[data-confirm-delete]").addEventListener("click", async () => {
    if (!selectedId || busy) return;
    setBusy(true);
    try {
      const result = await api(`/api/articles/${encodeURIComponent(selectedId)}`, { method: "DELETE" });
      publishState.textContent = result.publish?.published ? "GitHub Pages 已同步" : "删除已保存，等待重试";
      deleteDialog.close();
      await loadArticles();
      resetEditor();
    } catch (error) {
      deleteCopy.textContent = error.message;
    } finally {
      setBusy(false);
    }
  });

  document.querySelector("[data-publish-all]").addEventListener("click", async () => {
    if (busy) return;
    setBusy(true);
    publishState.textContent = "正在重新发布…";
    try {
      await api("/api/publish", { method: "POST" });
      publishState.textContent = "GitHub Pages 已同步";
    } catch (error) {
      publishState.textContent = error.message;
    } finally {
      setBusy(false);
    }
  });

  document.querySelector("[data-logout]").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    showLogin();
  });

  api("/api/session")
    .then(() => showAdmin())
    .catch(showLogin);
})();
