(() => {
  const pageSize = 6;

  const createElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const normalizeArticle = (article) => {
    const category = article.category === "生活随想" ? "生活随想" : "项目经验";
    const accent = category === "项目经验"
      ? "mint"
      : ["mint", "coral", "sky"].includes(article.accent) ? article.accent : "sky";
    return { ...article, category, accent };
  };

  const createArticleCard = (article, featured) => {
    const accent = ["mint", "coral", "sky"].includes(article.accent) ? article.accent : "mint";
    const card = createElement(
      "article",
      `article-card card-${accent}${featured ? " featured" : ""}`,
    );
    card.dataset.articleId = article.id;
    card.dataset.articleCategory = article.category;
    card.dataset.articleAccent = accent;

    const topLine = createElement("div", "card-topline");
    const dot = createElement("span", "category-dot");
    dot.append(createElement("i"));
    topLine.append(
      dot,
      createElement("span", "", article.category),
      createElement("span", "card-date", article.date),
    );

    const title = createElement("h3", "", article.title);
    const excerpt = createElement("p", "", article.excerpt);
    const footer = createElement("div", "card-footer");
    const readLink = createElement("a", "read-link");
    readLink.href = `./article.html?id=${encodeURIComponent(article.id)}`;
    readLink.dataset.readArticle = article.id;
    readLink.setAttribute("aria-label", `阅读：${article.title}`);
    readLink.append(document.createTextNode("阅读全文 "));
    const arrow = createElement("span", "", "→");
    arrow.setAttribute("aria-hidden", "true");
    readLink.append(arrow);
    footer.append(createElement("span", "", article.readTime), readLink);
    card.append(topLine, title, excerpt, footer);
    return card;
  };

  const start = async () => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "auto";
    }

    const filterButtons = [...document.querySelectorAll("[data-filter]")];
    const articleGrid = document.querySelector(".article-grid");
    const emptyState = document.querySelector("[data-article-empty]");
    const loadMoreRow = document.querySelector("[data-load-more-row]");
    const loadMoreButton = document.querySelector("[data-load-more]");
    const loadMoreCount = document.querySelector("[data-load-more-count]");
    let articles = [];
    let activeCategory = "全部";
    let visibleCount = pageSize;

    const render = () => {
      const filtered = activeCategory === "全部"
        ? articles
        : articles.filter((article) => article.category === activeCategory);
      const visible = filtered.slice(0, visibleCount);
      const remaining = Math.max(filtered.length - visible.length, 0);

      filterButtons.forEach((button) => {
        const selected = button.dataset.filter === activeCategory;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });

      if (articleGrid) {
        articleGrid.replaceChildren(
          ...visible.map((article, index) => createArticleCard(article, index === 0)),
        );
      }

      if (emptyState) emptyState.hidden = filtered.length > 0;
      if (loadMoreRow) loadMoreRow.hidden = remaining === 0;
      if (loadMoreCount) loadMoreCount.textContent = `还有 ${remaining} 篇`;
    };

    try {
      const response = await fetch(`./articles.json?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`文章数据加载失败：${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error("文章数据格式不正确");
      articles = payload
        .filter((article) => !article.status || article.status === "published")
        .map(normalizeArticle);

      const total = document.querySelector("[data-article-total]");
      if (total) total.textContent = String(articles.length).padStart(2, "0");
      render();
    } catch (error) {
      console.warn(error);
      if (emptyState && !articleGrid?.children.length) {
        emptyState.hidden = false;
        emptyState.textContent = "文章暂时无法加载，请稍后再试。";
      }
      if (loadMoreRow) loadMoreRow.hidden = true;
    }

    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activeCategory = button.dataset.filter ?? "全部";
        visibleCount = pageSize;
        render();
      });
    });

    loadMoreButton?.addEventListener("click", () => {
      visibleCount += pageSize;
      render();
    });

  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
  } else {
    void start();
  }
})();
