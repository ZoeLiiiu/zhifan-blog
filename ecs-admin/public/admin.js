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
  const contentEditor = document.querySelector("[data-content-editor]");
  const contentPreview = document.querySelector("[data-content-preview]");
  const contentGrid = document.querySelector("[data-editor-grid]");
  const formatNotice = document.querySelector("[data-format-notice]");
  const mediaDialog = document.querySelector("[data-media-dialog]");
  const mediaForm = document.querySelector("[data-media-form]");
  const mediaTitle = document.querySelector("[data-media-title]");
  const mediaHelp = document.querySelector("[data-media-help]");
  const mediaMessage = document.querySelector("[data-media-message]");
  const mediaList = document.querySelector("[data-media-list]");
  const uploadProgress = document.querySelector("[data-upload-progress]");
  const uploadMeter = document.querySelector("[data-upload-meter]");
  const uploadLabel = document.querySelector("[data-upload-label]");
  const bodyInput = editorForm.elements.body;
  const formatInput = editorForm.elements.contentFormat;
  const statusLabels = { published: "已发布", draft: "草稿", archived: "已归档" };
  const accentLabels = { mint: "薄荷绿", coral: "珊瑚橙", sky: "天空蓝" };
  const categoryAccents = { 项目经验: "mint", 生活随想: "sky" };
  let articles = [];
  let mediaItems = [];
  let mediaConfig = { enabled: false, allowedHosts: [] };
  let selectedId = null;
  let busy = false;
  let previewTimer = 0;
  let uploadRequest = null;
  let uploadBusy = false;

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
      if (!button.matches("[data-logout], [data-editor-tab]")) button.disabled = value;
    });
    if (!value) updateFormatUi();
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
    await Promise.all([loadArticles(), loadMedia()]);
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

  const updateFormatUi = () => {
    const markdown = formatInput.value === "markdown";
    formatNotice.hidden = markdown;
    contentEditor.classList.toggle("is-plain", !markdown);
    document.querySelectorAll("[data-md-action], [data-open-media]").forEach((button) => {
      button.disabled = busy || !markdown;
    });
    schedulePreview();
  };

  const renderPreview = () => {
    window.clearTimeout(previewTimer);
    if (!window.ZhifanContent?.renderContent) {
      contentPreview.textContent = "预览资源加载失败，请刷新页面重试。";
      return;
    }
    window.ZhifanContent.renderContent(contentPreview, bodyInput.value, formatInput.value, {
      allowedMediaHosts: mediaConfig.allowedHosts,
      emptyText: "正文预览会显示在这里。",
    });
  };

  const schedulePreview = () => {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(renderPreview, 120);
  };

  const resetEditor = () => {
    selectedId = null;
    editorForm.reset();
    editorForm.elements.category.value = "项目经验";
    editorForm.elements.date.value = formatToday();
    editorForm.elements.readTime.value = "5 分钟";
    editorForm.elements.accent.value = "mint";
    editorForm.elements.status.value = "draft";
    formatInput.value = "markdown";
    syncCategoryAccent();
    updateFormatUi();
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
    formatInput.value = article.contentFormat === "markdown" ? "markdown" : "plain";
    syncCategoryAccent();
    updateFormatUi();
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
      const formatBadge = article.contentFormat === "markdown" ? " · 多格式" : "";
      meta.append(badge, document.createTextNode(`${article.category} · ${article.date}${formatBadge}`));
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

  const loadMedia = async () => {
    try {
      const payload = await api("/api/media");
      mediaItems = payload.media || [];
      mediaConfig = payload.config || mediaConfig;
      renderMediaList();
      schedulePreview();
    } catch (error) {
      mediaMessage.textContent = error.message;
    }
  };

  const formPayload = (forcedStatus) => ({
    category: editorForm.elements.category.value,
    date: editorForm.elements.date.value,
    readTime: editorForm.elements.readTime.value,
    title: editorForm.elements.title.value,
    excerpt: editorForm.elements.excerpt.value,
    body: bodyInput.value,
    contentFormat: formatInput.value,
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
      formatInput.value = result.article.contentFormat;
      publishState.textContent = result.publish?.published ? "GitHub Pages 已同步" : "文章已保存，等待重试";
      editorMessage.textContent = result.publish?.warning || (result.article.status === "published" ? "文章已发布" : "文章已保存");
      await loadArticles();
    } catch (error) {
      editorMessage.textContent = error.message;
    } finally {
      setBusy(false);
    }
  };

  const setSelection = (replacement, selectionStart, selectionEnd = selectionStart) => {
    const start = bodyInput.selectionStart;
    const end = bodyInput.selectionEnd;
    bodyInput.setRangeText(replacement, start, end, "end");
    bodyInput.focus();
    bodyInput.setSelectionRange(start + selectionStart, start + selectionEnd);
    bodyInput.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const wrapSelection = (before, after, fallback) => {
    const selected = bodyInput.value.slice(bodyInput.selectionStart, bodyInput.selectionEnd) || fallback;
    setSelection(`${before}${selected}${after}`, before.length, before.length + selected.length);
  };

  const prefixLines = (prefixFactory) => {
    const selected = bodyInput.value.slice(bodyInput.selectionStart, bodyInput.selectionEnd) || "在这里继续写";
    const replacement = selected.split("\n").map((line, index) => `${prefixFactory(index)}${line}`).join("\n");
    setSelection(replacement, 0, replacement.length);
  };

  const markdownAction = (action) => {
    if (formatInput.value !== "markdown") return;
    if (action === "heading") prefixLines(() => "## ");
    if (action === "bold") wrapSelection("**", "**", "重点文字");
    if (action === "italic") wrapSelection("*", "*", "强调文字");
    if (action === "quote") prefixLines(() => "> ");
    if (action === "unordered-list") prefixLines(() => "- ");
    if (action === "ordered-list") prefixLines((index) => `${index + 1}. `);
    if (action === "inline-code") wrapSelection("`", "`", "代码");
    if (action === "code") {
      const language = window.prompt("代码语言，例如 javascript、python、sql", "javascript")?.trim() || "plaintext";
      wrapSelection(`\`\`\`${language}\n`, "\n```", "在这里粘贴代码");
    }
    if (action === "link") {
      const href = window.prompt("请输入 HTTPS 链接或站内相对地址", "https://");
      if (href) wrapSelection("[", `](${href.trim()})`, "链接文字");
    }
    if (action === "table") {
      const table = "| 项目 | 说明 |\n| --- | --- |\n| 内容 | 在这里填写 |";
      setSelection(table, 0, table.length);
    }
    if (action === "divider") setSelection("\n\n---\n\n", 2, 5);
  };

  const safeMarkdownText = (value) => String(value || "").replaceAll("\n", " ").replaceAll('"', "'").trim();

  const insertMedia = (record, details = {}) => {
    const caption = safeMarkdownText(details.caption || record.originalName);
    const syntax = record.kind === "image"
      ? `![${safeMarkdownText(details.alt) || "文章图片"}](${record.url}${caption ? ` "${caption}"` : ""})`
      : `@[video](${record.url}${caption ? ` "${caption}"` : ""})`;
    const prefix = bodyInput.selectionStart > 0 && !bodyInput.value.slice(0, bodyInput.selectionStart).endsWith("\n") ? "\n\n" : "";
    const suffix = bodyInput.selectionEnd < bodyInput.value.length && !bodyInput.value.slice(bodyInput.selectionEnd).startsWith("\n") ? "\n\n" : "";
    setSelection(`${prefix}${syntax}${suffix}`, prefix.length, prefix.length + syntax.length);
  };

  const renderMediaList = () => {
    mediaList.replaceChildren();
    mediaList.className = "media-list";
    if (!mediaConfig.enabled) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "OSS 尚未配置。编辑功能可正常使用，配置后即可上传本地媒体。";
      mediaList.append(empty);
      return;
    }
    const readyItems = mediaItems.filter((item) => item.status === "ready");
    if (!readyItems.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "媒体库还是空的，上传第一张图片或视频吧。";
      mediaList.append(empty);
      return;
    }
    readyItems.forEach((record) => {
      const item = document.createElement("article");
      item.className = "media-item";
      const thumb = document.createElement("span");
      thumb.className = "media-thumb";
      if (record.kind === "image") {
        const image = document.createElement("img");
        image.src = record.url;
        image.alt = "";
        image.loading = "lazy";
        thumb.append(image);
      } else {
        thumb.textContent = "VIDEO";
      }
      const copy = document.createElement("span");
      copy.className = "media-copy";
      const name = document.createElement("strong");
      name.textContent = record.originalName || record.kind;
      const meta = document.createElement("small");
      meta.textContent = `${record.kind === "image" ? "图片" : "视频"} · ${(Number(record.size || 0) / 1024 / 1024).toFixed(1)} MiB`;
      copy.append(name, meta);
      const actions = document.createElement("span");
      actions.className = "media-item-actions";
      const insert = document.createElement("button");
      insert.type = "button";
      insert.textContent = "插入";
      insert.addEventListener("click", () => {
        insertMedia(record, { alt: mediaForm.elements.alt.value, caption: mediaForm.elements.caption.value });
        mediaMessage.textContent = "已插入正文";
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-media";
      remove.textContent = "删除";
      remove.addEventListener("click", () => void removeMedia(record));
      actions.append(insert, remove);
      item.append(thumb, copy, actions);
      mediaList.append(item);
    });
  };

  const openMediaDialog = (kind) => {
    mediaForm.reset();
    mediaForm.elements.kind.value = kind;
    mediaForm.elements.file.accept = kind === "image"
      ? "image/jpeg,image/png,image/webp"
      : "video/mp4,video/webm";
    document.querySelector("[data-image-alt]").hidden = kind !== "image";
    mediaTitle.textContent = kind === "image" ? "插入图片" : "插入视频";
    mediaHelp.textContent = kind === "image"
      ? "支持 JPEG、PNG、WebP，单张不超过 10 MiB。"
      : "支持 MP4、WebM，单个不超过 200 MiB；不会自动转码。";
    mediaMessage.textContent = mediaConfig.enabled ? "" : "OSS 尚未配置，暂时不能上传本地文件。";
    uploadProgress.hidden = true;
    renderMediaList();
    mediaDialog.showModal();
  };

  const uploadToOss = (uploadUrl, fields, file) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    uploadRequest = request;
    request.open("POST", uploadUrl);
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      const value = Math.round((event.loaded / event.total) * 100);
      uploadMeter.value = value;
      uploadLabel.textContent = `正在上传… ${value}%`;
    });
    request.addEventListener("load", () => {
      uploadRequest = null;
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`OSS 上传失败（${request.status || "网络错误"}）`));
    });
    request.addEventListener("error", () => {
      uploadRequest = null;
      reject(new Error("OSS 上传失败，请检查网络和跨域配置"));
    });
    request.addEventListener("abort", () => {
      uploadRequest = null;
      reject(new Error("上传已取消"));
    });
    const formData = new FormData();
    Object.entries(fields).forEach(([name, value]) => formData.append(name, value));
    formData.append("file", file);
    request.send(formData);
  });

  const uploadMedia = async () => {
    const file = mediaForm.elements.file.files?.[0];
    const kind = mediaForm.elements.kind.value;
    if (!file) throw new Error("请先选择本地文件");
    if (kind === "image" && !mediaForm.elements.alt.value.trim()) {
      throw new Error("请填写图片替代文字");
    }
    const policy = await api("/api/media/policy", {
      method: "POST",
      body: JSON.stringify({
        kind,
        name: file.name,
        mime: file.type,
        size: file.size,
      }),
    });
    uploadProgress.hidden = false;
    uploadMeter.value = 0;
    uploadLabel.textContent = "正在上传… 0%";
    await uploadToOss(policy.uploadUrl, policy.fields, file);
    uploadLabel.textContent = "正在校验文件…";
    const completed = await api("/api/media/complete", {
      method: "POST",
      body: JSON.stringify({ id: policy.media.id, key: policy.media.key }),
    });
    mediaConfig = completed.config || mediaConfig;
    mediaItems = [completed.media, ...mediaItems.filter((item) => item.id !== completed.media.id)];
    insertMedia(completed.media, {
      alt: mediaForm.elements.alt.value,
      caption: mediaForm.elements.caption.value,
    });
    renderMediaList();
    uploadMeter.value = 100;
    uploadLabel.textContent = "上传完成";
    mediaMessage.textContent = "文件已上传并插入正文";
    mediaForm.elements.file.value = "";
  };

  const removeMedia = async (record) => {
    if (!window.confirm(`确认删除“${record.originalName || record.id}”吗？被文章引用的媒体不会被删除。`)) return;
    try {
      await api(`/api/media/${encodeURIComponent(record.id)}`, { method: "DELETE" });
      mediaItems = mediaItems.filter((item) => item.id !== record.id);
      renderMediaList();
      mediaMessage.textContent = "媒体已删除";
    } catch (error) {
      mediaMessage.textContent = error.message;
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
  bodyInput.addEventListener("input", schedulePreview);
  document.querySelector("[data-publish]").addEventListener("click", () => void saveArticle("published"));
  document.querySelector("[data-new-article]").addEventListener("click", resetEditor);
  document.querySelector("[data-upgrade-format]").addEventListener("click", () => {
    formatInput.value = "markdown";
    updateFormatUi();
    editorMessage.textContent = "已切换为多格式编辑；保存后正式升级。";
  });
  document.querySelectorAll("[data-md-action]").forEach((button) => {
    button.addEventListener("click", () => markdownAction(button.dataset.mdAction));
  });
  document.querySelectorAll("[data-open-media]").forEach((button) => {
    button.addEventListener("click", () => openMediaDialog(button.dataset.openMedia));
  });
  document.querySelectorAll("[data-editor-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.editorTab;
      contentGrid.dataset.view = view;
      document.querySelectorAll("[data-editor-tab]").forEach((item) => item.classList.toggle("active", item === button));
      if (view === "preview") renderPreview();
    });
  });
  searchInput.addEventListener("input", renderList);
  filterSelect.addEventListener("change", renderList);
  editorForm.elements.category.addEventListener("change", () => syncCategoryAccent({ useDefault: true }));
  editorForm.elements.accent.addEventListener("change", updateAccentPreview);

  mediaForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (uploadBusy) return;
    uploadBusy = true;
    const submitButton = mediaForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    mediaMessage.textContent = "";
    void uploadMedia()
      .catch((error) => {
        mediaMessage.textContent = error.message;
        uploadProgress.hidden = true;
      })
      .finally(() => {
        uploadBusy = false;
        submitButton.disabled = false;
      });
  });
  document.querySelector("[data-close-media]").addEventListener("click", () => mediaDialog.close());
  document.querySelector("[data-cancel-upload]").addEventListener("click", () => {
    if (uploadRequest) uploadRequest.abort();
    else mediaDialog.close();
  });
  document.querySelector("[data-refresh-media]").addEventListener("click", () => void loadMedia());

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

  contentGrid.dataset.view = "write";
  api("/api/session")
    .then(() => showAdmin())
    .catch(showLogin);
})();
