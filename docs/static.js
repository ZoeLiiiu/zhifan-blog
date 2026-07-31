(() => {
  const pageSize = 6;
  const searchDelay = 120;
  const snippetLength = 118;
  const snippetContext = 38;

  const createElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const normalizeSearchText = (value) => String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/gu, " ")
    .trim();

  const protectMarkdownCode = (value) => {
    const codeSegments = [];
    const protect = (code) => {
      const index = codeSegments.push(code) - 1;
      return `\uE000${index}\uE001`;
    };
    const text = String(value ?? "")
      .normalize("NFKC")
      .replace(
        /^[ \t]*(`{3,}|~{3,})[^\r\n]*\r?\n([\s\S]*?)^[ \t]*\1[ \t]*$/gmu,
        (_, _fence, code) => protect(code),
      )
      .replace(/(`+)([^`\r\n]*?)\1/gu, (_, _ticks, code) => protect(code));

    return {
      restore: (prepared) => prepared.replace(
        /\uE000(\d+)\uE001/gu,
        (_, index) => codeSegments[Number(index)] ?? "",
      ),
      text,
    };
  };

  const markdownToSearchText = (value) => {
    const protectedCode = protectMarkdownCode(String(value ?? ""));
    const prepared = protectedCode.text
    .replace(/@\[video\]\(\s*\S+(?:\s+["']([^"']*)["'])?\s*\)/giu, (_, title) => (
      title ? ` ${title} ` : " 视频 "
    ))
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/^[ \t]*(?:```+|~~~+)[^\r\n]*$/gmu, " ")
    .replace(/^[ \t]{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])[ \t]+/gmu, "")
    .replace(/^[ \t]*\|?(?:[ \t]*:?-{3,}:?[ \t]*\|)+[ \t]*$/gmu, " ")
    .replace(/^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/gmu, " ")
    .replace(/\\([\\`*_[\]{}()#+\-.!|>])/gu, "$1")
    .replace(/[*_~]+/gu, "")
    .replace(/\|/gu, " ");

    return protectedCode.restore(prepared).replace(/\s+/gu, " ").trim();
  };

  const articleBodyToSearchText = (article) => article.contentFormat === "markdown"
    ? markdownToSearchText(article.body)
    : String(article.body ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();

  const getSearchTerms = (query) => normalizeSearchText(query)
    .split(" ")
    .filter(Boolean);

  const matchesTerms = (article, terms) => (
    terms.length === 0
    || terms.every((term) => article.searchText.includes(term))
  );

  const fieldIncludesTerm = (value, terms) => {
    const normalized = normalizeSearchText(value);
    return terms.some((term) => normalized.includes(term));
  };

  const appendHighlightedText = (element, value, terms) => {
    const text = String(value ?? "").normalize("NFKC");
    const folded = text.toLocaleLowerCase("zh-CN");
    let cursor = 0;

    while (cursor < text.length) {
      let nextIndex = -1;
      let nextTerm = "";

      terms.forEach((term) => {
        const index = folded.indexOf(term, cursor);
        if (
          index >= 0
          && (
            nextIndex < 0
            || index < nextIndex
            || (index === nextIndex && term.length > nextTerm.length)
          )
        ) {
          nextIndex = index;
          nextTerm = term;
        }
      });

      if (nextIndex < 0) {
        element.append(document.createTextNode(text.slice(cursor)));
        return;
      }

      if (nextIndex > cursor) {
        element.append(document.createTextNode(text.slice(cursor, nextIndex)));
      }

      const mark = createElement("mark", "search-highlight");
      mark.dataset.searchHighlight = "true";
      mark.append(document.createTextNode(text.slice(nextIndex, nextIndex + nextTerm.length)));
      element.append(mark);
      cursor = nextIndex + nextTerm.length;
    }
  };

  const createBodySnippet = (bodyText, terms) => {
    const text = String(bodyText ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
    const folded = text.toLocaleLowerCase("zh-CN");
    const firstMatch = terms.reduce((earliest, term) => {
      const index = folded.indexOf(term);
      return index >= 0 && (earliest < 0 || index < earliest) ? index : earliest;
    }, -1);
    const start = Math.max((firstMatch < 0 ? 0 : firstMatch) - snippetContext, 0);
    const end = Math.min(start + snippetLength, text.length);
    return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  };

  const normalizeArticle = (article) => {
    const category = article.category === "生活随想" ? "生活随想" : "项目经验";
    const accent = category === "生活随想" ? "sky" : "mint";
    const bodySearchText = articleBodyToSearchText(article);
    const searchText = normalizeSearchText([
      article.title,
      article.excerpt,
      bodySearchText,
    ].join(" "));
    return {
      ...article,
      category,
      accent,
      bodySearchText,
      searchText,
    };
  };

  const createArticleCard = (article, featured, terms) => {
    const accent = article.category === "生活随想" ? "sky" : "mint";
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

    const titleMatches = terms.length > 0 && fieldIncludesTerm(article.title, terms);
    const bodyMatches = terms.length > 0 && fieldIncludesTerm(article.bodySearchText, terms);

    const title = createElement("h3");
    title.dataset.articleTitle = "true";
    appendHighlightedText(title, article.title, titleMatches ? terms : []);

    const visibleSearchText = normalizeSearchText(`${article.title} ${article.excerpt}`);
    const bodyOnlyTerms = terms.filter((term) => !visibleSearchText.includes(term));
    const showBodySnippet = bodyMatches && bodyOnlyTerms.length > 0;
    const summaryText = showBodySnippet
      ? createBodySnippet(article.bodySearchText, bodyOnlyTerms)
      : article.excerpt;
    const excerpt = createElement("p", showBodySnippet ? "search-snippet" : "");
    excerpt.dataset.articleExcerpt = "true";
    if (showBodySnippet) excerpt.dataset.bodyMatch = "true";
    appendHighlightedText(excerpt, summaryText, terms);

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
    const searchInput = document.querySelector("[data-article-search]");
    const searchClear = document.querySelector("[data-search-clear]");
    const searchStatus = document.querySelector("[data-search-status]");
    let articles = [];
    let activeCategory = "全部";
    let searchQuery = "";
    let visibleCount = pageSize;
    let searchTimer = 0;

    const render = () => {
      const terms = getSearchTerms(searchQuery);
      const categoryArticles = activeCategory === "全部"
        ? articles
        : articles.filter((article) => article.category === activeCategory);
      const filtered = categoryArticles.filter((article) => matchesTerms(article, terms));
      const visible = filtered.slice(0, visibleCount);
      const remaining = Math.max(filtered.length - visible.length, 0);

      filterButtons.forEach((button) => {
        const selected = button.dataset.filter === activeCategory;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });

      if (articleGrid) {
        articleGrid.replaceChildren(
          ...visible.map((article, index) => createArticleCard(article, index === 0, terms)),
        );
      }

      if (searchClear) searchClear.hidden = searchInput?.value.length === 0;
      if (searchStatus) {
        searchStatus.textContent = terms.length > 0
          ? `找到 ${filtered.length} 篇文章`
          : `共 ${filtered.length} 篇文章`;
      }
      if (emptyState) {
        emptyState.hidden = filtered.length > 0;
        emptyState.textContent = terms.length > 0
          ? `没有找到包含“${searchQuery.trim()}”的文章，换个关键词试试吧。`
          : "这个分类还没有文章，先去别处看看吧。";
      }
      if (loadMoreRow) loadMoreRow.hidden = remaining === 0;
      if (loadMoreCount) loadMoreCount.textContent = `还有 ${remaining} 篇`;
    };

    try {
      const response = await fetch(`./articles.json?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`文章数据加载失败：${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error("文章数据格式不正确");
      articles = payload
        .filter((article) => article.status === "published")
        .map(normalizeArticle);

      const total = document.querySelector("[data-article-total]");
      if (total) total.textContent = String(articles.length).padStart(2, "0");
      if (searchInput) searchInput.disabled = false;
      render();
    } catch (error) {
      console.warn(error);
      if (emptyState && !articleGrid?.children.length) {
        emptyState.hidden = false;
        emptyState.textContent = "文章暂时无法加载，请稍后再试。";
      }
      if (loadMoreRow) loadMoreRow.hidden = true;
      if (searchStatus) searchStatus.textContent = "检索暂不可用";
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

    const commitSearch = () => {
      searchQuery = searchInput?.value ?? "";
      visibleCount = pageSize;
      render();
    };

    searchInput?.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(commitSearch, searchDelay);
      if (searchClear) searchClear.hidden = searchInput.value.length === 0;
    });

    searchInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      window.clearTimeout(searchTimer);
      searchInput.value = "";
      commitSearch();
    });

    searchClear?.addEventListener("click", () => {
      window.clearTimeout(searchTimer);
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }
      commitSearch();
    });

  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
  } else {
    void start();
  }
})();
