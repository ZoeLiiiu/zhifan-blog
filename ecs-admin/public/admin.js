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
  const pasteUploadPanel = document.querySelector("[data-paste-upload-panel]");
  const pasteUploadSummary = document.querySelector("[data-paste-upload-summary]");
  const pasteUploadList = document.querySelector("[data-paste-upload-list]");
  const cancelPasteUpload = document.querySelector("[data-cancel-paste-upload]");
  const bodyInput = editorForm.elements.body;
  const formatInput = editorForm.elements.contentFormat;
  const statusLabels = { published: "已发布", draft: "草稿", archived: "已归档" };
  const categoryAccents = { 项目经验: "mint", 生活随想: "sky" };
  const clipboardImageExtensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  let articles = [];
  let mediaItems = [];
  let mediaConfig = { enabled: false, allowedHosts: [] };
  let selectedId = null;
  let busy = false;
  let previewTimer = 0;
  let uploadRequest = null;
  let uploadBusy = false;
  let pasteJobs = [];
  let pasteQueue = Promise.resolve();
  let activePasteJob = null;

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
    editorForm.elements.status.value = "draft";
    formatInput.value = "markdown";
    updateFormatUi();
    editorTitle.textContent = "新建文章";
    editorMessage.textContent = "";
    deleteButton.hidden = true;
    renderList();
  };

  const fillEditor = (article) => {
    selectedId = article.id;
    for (const name of ["category", "date", "readTime", "title", "excerpt", "body", "status"]) {
      editorForm.elements[name].value = article[name] || "";
    }
    formatInput.value = article.contentFormat === "markdown" ? "markdown" : "plain";
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
    body: pasteJobs.reduce((body, job) => body.replaceAll(job.placeholder, ""), bodyInput.value),
    contentFormat: formatInput.value,
    accent: categoryAccents[editorForm.elements.category.value] || "mint",
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
    const hasCaption = Object.prototype.hasOwnProperty.call(details, "caption");
    const caption = safeMarkdownText(hasCaption ? details.caption : record.originalName);
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

  const uploadToOss = (uploadUrl, fields, file, options = {}) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const signal = options.signal;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abortRequest);
      options.onRequest?.(null);
      callback(value);
    };
    const abortRequest = () => request.abort();
    options.onRequest?.(request);
    request.open("POST", uploadUrl);
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      const value = Math.round((event.loaded / event.total) * 100);
      options.onProgress?.(value);
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) finish(resolve);
      else finish(reject, new Error(`OSS 上传失败（${request.status || "网络错误"}）`));
    });
    request.addEventListener("error", () => {
      finish(reject, new Error("OSS 上传失败，请检查网络和跨域配置"));
    });
    request.addEventListener("abort", () => {
      finish(reject, new Error("上传已取消"));
    });
    const formData = new FormData();
    Object.entries(fields).forEach(([name, value]) => formData.append(name, value));
    formData.append("file", file);
    if (signal?.aborted) {
      finish(reject, new Error("上传已取消"));
      return;
    }
    signal?.addEventListener("abort", abortRequest, { once: true });
    request.send(formData);
  });

  const cleanupPendingMedia = async (record) => {
    if (!record?.id) return;
    await api(`/api/media/${encodeURIComponent(record.id)}`, { method: "DELETE" }).catch(() => {});
  };

  const uploadFile = async (file, kind, options = {}) => {
    let pendingRecord = null;
    try {
      options.onPhase?.("policy");
      const policy = await api("/api/media/policy", {
        method: "POST",
        body: JSON.stringify({
          kind,
          name: file.name,
          mime: file.type,
          size: file.size,
        }),
        signal: options.signal,
      });
      pendingRecord = policy.media;
      options.onPhase?.("upload");
      await uploadToOss(policy.uploadUrl, policy.fields, file, options);
      options.onPhase?.("verify");
      const completed = await api("/api/media/complete", {
        method: "POST",
        body: JSON.stringify({ id: policy.media.id, key: policy.media.key }),
        signal: options.signal,
      });
      mediaConfig = completed.config || mediaConfig;
      mediaItems = [completed.media, ...mediaItems.filter((item) => item.id !== completed.media.id)];
      renderMediaList();
      return completed.media;
    } catch (error) {
      await cleanupPendingMedia(pendingRecord);
      if (options.signal?.aborted || error?.name === "AbortError") throw new Error("上传已取消");
      throw error;
    }
  };

  const uploadMedia = async () => {
    const file = mediaForm.elements.file.files?.[0];
    const kind = mediaForm.elements.kind.value;
    if (!file) throw new Error("请先选择本地文件");
    if (kind === "image" && !mediaForm.elements.alt.value.trim()) {
      throw new Error("请填写图片替代文字");
    }
    uploadProgress.hidden = false;
    uploadMeter.value = 0;
    uploadLabel.textContent = "正在申请上传…";
    const completed = await uploadFile(file, kind, {
      onRequest: (request) => { uploadRequest = request; },
      onProgress: (value) => {
        uploadMeter.value = value;
        uploadLabel.textContent = `正在上传… ${value}%`;
      },
      onPhase: (phase) => {
        if (phase === "verify") uploadLabel.textContent = "正在校验文件…";
      },
    });
    insertMedia(completed, {
      alt: mediaForm.elements.alt.value,
      caption: mediaForm.elements.caption.value,
    });
    uploadMeter.value = 100;
    uploadLabel.textContent = "上传完成";
    mediaMessage.textContent = "文件已上传并插入正文";
    mediaForm.elements.file.value = "";
  };

  const clipboardFilename = (file, index, timestamp) => {
    if (file.name?.trim()) return file.name;
    const date = [
      timestamp.getFullYear(),
      String(timestamp.getMonth() + 1).padStart(2, "0"),
      String(timestamp.getDate()).padStart(2, "0"),
      "-",
      String(timestamp.getHours()).padStart(2, "0"),
      String(timestamp.getMinutes()).padStart(2, "0"),
      String(timestamp.getSeconds()).padStart(2, "0"),
    ].join("");
    return `clipboard-${date}-${index + 1}.${clipboardImageExtensions[file.type]}`;
  };

  const namedClipboardFile = (file, index, timestamp) => {
    const name = clipboardFilename(file, index, timestamp);
    if (name === file.name) return file;
    return new File([file], name, { type: file.type, lastModified: file.lastModified || timestamp.getTime() });
  };

  const createUploadPlaceholder = () => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const encodedId = [...id.replace(/[^0-9a-f]/gi, "")]
      .map((digit) => String.fromCodePoint(0xfe00 + Number.parseInt(digit, 16)))
      .join("");
    return `\u2063${encodedId}\u2063`;
  };

  const dispatchBodyInput = () => bodyInput.dispatchEvent(new Event("input", { bubbles: true }));

  const showPasteNotice = (message) => {
    pasteUploadPanel.hidden = false;
    pasteUploadPanel.classList.add("is-warning");
    pasteUploadSummary.textContent = message;
  };

  const pasteStatusText = (job) => {
    if (job.status === "queued") return "等待上传";
    if (job.status === "uploading") return job.phase === "verify" ? "正在校验" : job.phase === "policy" ? "正在申请上传" : "正在上传";
    if (job.status === "inserted") return "已上传并插入正文";
    if (job.status === "ready") return "已上传，原占位符被删除";
    if (job.status === "cancelled") return "上传已取消，可重试";
    return job.error || "上传失败";
  };

  const insertReadyPasteJob = (job) => {
    if (!job.record) return;
    insertMedia(job.record, { alt: job.alt, caption: "" });
    job.status = "inserted";
    renderPasteJobs();
  };

  const renderPasteJobs = () => {
    if (!pasteJobs.length) return;
    pasteUploadPanel.hidden = false;
    pasteUploadPanel.classList.remove("is-warning");
    const completed = pasteJobs.filter((job) => job.status === "inserted" || job.status === "ready").length;
    pasteUploadSummary.textContent = activePasteJob
      ? `正在处理 ${pasteJobs.indexOf(activePasteJob) + 1}/${pasteJobs.length}：${activePasteJob.file.name}`
      : `本次共 ${pasteJobs.length} 张，已完成 ${completed} 张`;
    cancelPasteUpload.hidden = !activePasteJob;
    pasteUploadList.replaceChildren();
    pasteJobs.forEach((job) => {
      const item = document.createElement("article");
      item.className = `paste-upload-item status-${job.status}`;
      item.dataset.pasteJob = job.id;
      const fileCopy = document.createElement("span");
      fileCopy.className = "paste-upload-file";
      const name = document.createElement("strong");
      name.textContent = job.file.name;
      const status = document.createElement("small");
      status.textContent = pasteStatusText(job);
      fileCopy.append(name, status);
      const meterWrap = document.createElement("span");
      meterWrap.className = "paste-upload-meter";
      const meter = document.createElement("progress");
      meter.max = 100;
      meter.value = job.progress;
      const percentage = document.createElement("span");
      percentage.textContent = `${job.progress}%`;
      meterWrap.append(meter, percentage);
      const actions = document.createElement("span");
      actions.className = "paste-upload-actions";
      if ((job.status === "failed" || job.status === "cancelled") && job.retryable !== false) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "retry";
        retry.textContent = "重试";
        retry.addEventListener("click", () => queuePasteJob(job));
        actions.append(retry);
      }
      if (job.status === "ready") {
        const insert = document.createElement("button");
        insert.type = "button";
        insert.textContent = "插入正文";
        insert.addEventListener("click", () => insertReadyPasteJob(job));
        actions.append(insert);
      }
      item.append(fileCopy, meterWrap, actions);
      pasteUploadList.append(item);
    });
  };

  const replacePastePlaceholder = (job, record) => {
    const index = bodyInput.value.indexOf(job.placeholder);
    if (index < 0) return false;
    const syntax = `![${safeMarkdownText(job.alt)}](${record.url})`;
    bodyInput.setRangeText(syntax, index, index + job.placeholder.length, "preserve");
    dispatchBodyInput();
    return true;
  };

  const processPasteJob = async (job) => {
    if (job.status !== "queued") return;
    activePasteJob = job;
    job.status = "uploading";
    job.phase = "policy";
    job.progress = 0;
    job.error = "";
    job.controller = new AbortController();
    renderPasteJobs();
    try {
      const record = await uploadFile(job.file, "image", {
        signal: job.controller.signal,
        onRequest: (request) => { job.request = request; },
        onProgress: (value) => {
          job.progress = value;
          renderPasteJobs();
        },
        onPhase: (phase) => {
          job.phase = phase;
          renderPasteJobs();
        },
      });
      job.record = record;
      job.progress = 100;
      job.status = replacePastePlaceholder(job, record) ? "inserted" : "ready";
    } catch (error) {
      job.status = job.controller.signal.aborted ? "cancelled" : "failed";
      job.error = error.message || "上传失败，请重试";
    } finally {
      job.controller = null;
      job.request = null;
      activePasteJob = null;
      renderPasteJobs();
    }
  };

  const queuePasteJob = (job) => {
    if (job.status === "queued" || job.status === "uploading") return;
    job.status = "queued";
    job.progress = 0;
    job.error = "";
    renderPasteJobs();
    pasteQueue = pasteQueue.then(() => processPasteJob(job));
  };

  const insertPastePlaceholders = (jobs) => {
    const start = bodyInput.selectionStart;
    const end = bodyInput.selectionEnd;
    const before = bodyInput.value.slice(0, start);
    const after = bodyInput.value.slice(end);
    const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n\n" : "";
    bodyInput.setRangeText(`${prefix}${jobs.map((job) => job.placeholder).join("\n\n")}${suffix}`, start, end, "end");
    dispatchBodyInput();
  };

  const handleBodyPaste = (event) => {
    const clipboardFiles = [...(event.clipboardData?.items || [])]
      .filter((item) => item.kind === "file" && clipboardImageExtensions[item.type])
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!clipboardFiles.length) return;
    event.preventDefault();
    if (formatInput.value !== "markdown") {
      showPasteNotice("旧纯文本文章暂不支持粘贴图片，请先点击“升级为多格式文章”。");
      editorMessage.textContent = "请先升级为多格式文章，再粘贴图片。";
      return;
    }
    if (!mediaConfig.enabled) {
      showPasteNotice("OSS 尚未配置，暂时无法上传粘贴的图片。");
      return;
    }
    const timestamp = new Date();
    const maxBytes = Number(mediaConfig.imageMaxBytes || 10 * 1024 * 1024);
    const batch = clipboardFiles.map((file, index) => {
      const namedFile = namedClipboardFile(file, index, timestamp);
      return {
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${index}-${Math.random()}`,
        file: namedFile,
        alt: clipboardFiles.length === 1 ? "粘贴图片" : `粘贴图片 ${index + 1}`,
        placeholder: createUploadPlaceholder(),
        status: namedFile.size > maxBytes ? "failed" : "idle",
        progress: 0,
        error: namedFile.size > maxBytes ? "图片超过 10 MiB，未上传" : "",
        retryable: namedFile.size <= maxBytes,
      };
    });
    pasteJobs = [...pasteJobs, ...batch];
    insertPastePlaceholders(batch);
    const rejectedPlaceholders = batch.filter((job) => job.retryable === false);
    if (rejectedPlaceholders.length) {
      bodyInput.value = rejectedPlaceholders.reduce((body, job) => body.replace(job.placeholder, ""), bodyInput.value);
      dispatchBodyInput();
    }
    batch.filter((job) => job.status === "idle").forEach(queuePasteJob);
    renderPasteJobs();
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
  bodyInput.addEventListener("paste", handleBodyPaste);
  cancelPasteUpload.addEventListener("click", () => activePasteJob?.controller?.abort());
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
