(() => {
  const loading = document.querySelector("[data-loading]");
  const articleElement = document.querySelector("[data-article]");
  const errorElement = document.querySelector("[data-error]");
  const articleId = new URLSearchParams(window.location.search).get("id")?.trim() ?? "";
  const normalizeArticle = (article) => {
    const category = article.category === "生活随想" ? "生活随想" : "项目经验";
    const accent = category === "项目经验"
      ? "mint"
      : ["mint", "coral", "sky"].includes(article.accent) ? article.accent : "sky";
    return { ...article, category, accent };
  };

  const showError = () => {
    if (loading) loading.hidden = true;
    if (articleElement) articleElement.hidden = true;
    if (errorElement) errorElement.hidden = false;
    document.title = "文章暂时不在这里 · 知返";
  };

  document.querySelector("[data-back]")?.addEventListener("click", (event) => {
    if (!document.referrer || history.length <= 1) return;
    try {
      if (new URL(document.referrer).origin !== window.location.origin) return;
      event.preventDefault();
      history.back();
    } catch {
      // 无法识别来源时使用链接自身的首页文章锚点。
    }
  });

  const load = async () => {
    if (!articleId) {
      showError();
      return;
    }

    try {
      const [response, mediaResponse] = await Promise.all([
        fetch(`./articles.json?v=${Date.now()}`, { cache: "no-store" }),
        fetch(`./media-config.json?v=${Date.now()}`, { cache: "no-store" }).catch(() => null),
      ]);
      if (!response.ok) throw new Error(`文章数据加载失败：${response.status}`);
      const articles = await response.json();
      const mediaConfig = mediaResponse?.ok
        ? await mediaResponse.json().catch(() => ({ allowedHosts: [] }))
        : { allowedHosts: [] };
      if (!Array.isArray(articles)) throw new Error("文章数据格式不正确");
      const matchedArticle = articles.find((item) => item.id === articleId && (!item.status || item.status === "published"));
      if (!matchedArticle) {
        showError();
        return;
      }
      const article = normalizeArticle(matchedArticle);

      const accent = ["mint", "coral", "sky"].includes(article.accent) ? article.accent : "mint";
      articleElement.className = `reader-article accent-${accent}`;
      document.querySelector("[data-category]").textContent = article.category;
      document.querySelector("[data-date]").textContent = article.date;
      document.querySelector("[data-read-time]").textContent = article.readTime;
      document.querySelector("[data-title]").textContent = article.title;
      document.querySelector("[data-excerpt]").textContent = article.excerpt;
      const bodyElement = document.querySelector("[data-body]");
      if (!window.ZhifanContent?.renderContent) throw new Error("正文渲染资源加载失败");
      window.ZhifanContent.renderContent(
        bodyElement,
        article.body,
        article.contentFormat === "markdown" ? "markdown" : "plain",
        { allowedMediaHosts: mediaConfig.allowedHosts },
      );
      document.title = `${article.title} · 知返`;
      document.querySelector('meta[name="description"]')?.setAttribute("content", article.excerpt || article.title);

      if (loading) loading.hidden = true;
      if (errorElement) errorElement.hidden = true;
      articleElement.hidden = false;
    } catch (error) {
      console.warn(error);
      showError();
    }
  };

  void load();
})();
