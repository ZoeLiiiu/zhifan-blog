(() => {
  const loading = document.querySelector("[data-loading]");
  const articleElement = document.querySelector("[data-article]");
  const errorElement = document.querySelector("[data-error]");
  const articleId = new URLSearchParams(window.location.search).get("id")?.trim() ?? "";

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
      const response = await fetch(`./articles.json?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`文章数据加载失败：${response.status}`);
      const articles = await response.json();
      if (!Array.isArray(articles)) throw new Error("文章数据格式不正确");
      const article = articles.find((item) => item.id === articleId && (!item.status || item.status === "published"));
      if (!article) {
        showError();
        return;
      }

      const accent = ["mint", "coral", "sky"].includes(article.accent) ? article.accent : "mint";
      articleElement.className = `reader-article accent-${accent}`;
      document.querySelector("[data-category]").textContent = article.category;
      document.querySelector("[data-date]").textContent = article.date;
      document.querySelector("[data-read-time]").textContent = article.readTime;
      document.querySelector("[data-title]").textContent = article.title;
      document.querySelector("[data-excerpt]").textContent = article.excerpt;
      document.querySelector("[data-body]").textContent = article.body;
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
