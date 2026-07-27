(() => {
  const categories = ["专业经验", "项目复盘", "生活随想"];

  const createElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const createArticleCard = (article, featured) => {
    const card = createElement(
      "article",
      `article-card card-${article.accent || "mint"}${featured ? " featured" : ""}`,
    );
    card.dataset.articleId = article.id;
    card.dataset.articleCategory = article.category;
    card.dataset.articleTitle = article.title;
    card.dataset.articleBody = article.body;

    const topLine = createElement("div", "card-topline");
    const dot = createElement("span", "category-dot");
    dot.append(createElement("i"));
    topLine.append(dot, createElement("span", "", article.category), createElement("span", "card-date", article.date));

    const title = createElement("h3", "", article.title);
    const excerpt = createElement("p", "", article.excerpt);
    const footer = createElement("div", "card-footer");
    const readButton = createElement("button", "read-link");
    readButton.type = "button";
    readButton.dataset.readArticle = article.id;
    readButton.setAttribute("aria-label", `阅读：${article.title}`);
    readButton.append(document.createTextNode("阅读全文 "));
    const arrow = createElement("span", "", "→");
    arrow.setAttribute("aria-hidden", "true");
    readButton.append(arrow);
    footer.append(createElement("span", "", article.readTime), readButton);
    card.append(topLine, title, excerpt, footer);
    return card;
  };

  const start = async () => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "auto";
    }

    const filterButtons = [...document.querySelectorAll("[data-filter]")];
    let articleCards = [...document.querySelectorAll("[data-article-id]")];
    const articleGrid = document.querySelector(".article-grid");
    const preview = document.querySelector("[data-article-preview]");
    const previewMeta = document.querySelector("[data-preview-meta]");
    const previewTitle = document.querySelector("[data-preview-title]");
    const previewBody = document.querySelector("[data-preview-body]");

    const closePreview = () => {
      if (preview) preview.hidden = true;
    };

    const selectCategory = (category, moveToArticles = false) => {
      filterButtons.forEach((button) => {
        const selected = button.dataset.filter === category;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-selected", String(selected));
      });

      let firstVisible = true;
      articleCards.forEach((card) => {
        const visible = category === "全部" || card.dataset.articleCategory === category;
        card.hidden = !visible;
        card.classList.toggle("featured", visible && firstVisible);
        if (visible) firstVisible = false;
      });

      closePreview();

      if (moveToArticles) {
        requestAnimationFrame(() => {
          document.getElementById("latest")?.scrollIntoView({ behavior: "auto", block: "start" });
        });
      }
    };

    const bindArticleButtons = () => {
      document.querySelectorAll("[data-read-article]").forEach((button) => {
        button.addEventListener("click", () => {
          const card = button.closest("[data-article-id]");
          if (!card || !preview || !previewMeta || !previewTitle || !previewBody) return;

          previewMeta.textContent = `正在阅读 · ${card.dataset.articleCategory ?? ""}`;
          previewTitle.textContent = card.dataset.articleTitle ?? "";
          previewBody.textContent = card.dataset.articleBody ?? "";
          preview.hidden = false;
        });
      });
    };

    try {
      const response = await fetch(`./articles.json?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`文章数据加载失败：${response.status}`);
      const articles = await response.json();
      if (!Array.isArray(articles)) throw new Error("文章数据格式不正确");

      if (articleGrid) {
        articleGrid.replaceChildren(...articles.map((article, index) => createArticleCard(article, index === 0)));
        articleCards = [...articleGrid.querySelectorAll("[data-article-id]")];
      }

      const total = document.querySelector(".signal-bar div strong");
      if (total) total.textContent = String(articles.length).padStart(2, "0");

      categories.forEach((category) => {
        const card = document.querySelector(`[data-category-trigger="${category}"]`);
        const count = card?.querySelector("small");
        if (count) count.textContent = `${String(articles.filter((article) => article.category === category).length).padStart(2, "0")} 篇 →`;
      });
    } catch (error) {
      console.warn(error);
    }

    filterButtons.forEach((button) => {
      button.addEventListener("click", () => selectCategory(button.dataset.filter ?? "全部"));
    });

    document.querySelectorAll("[data-category-trigger]").forEach((button) => {
      button.addEventListener("click", () => {
        selectCategory(button.dataset.categoryTrigger ?? "全部", true);
      });
    });

    bindArticleButtons();
    document.querySelector("[data-close-preview]")?.addEventListener("click", closePreview);
    document.querySelector("[data-subscribe-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
  } else {
    void start();
  }
})();
