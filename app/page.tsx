"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  categories,
  seedArticles,
  type Article,
  type Category,
} from "@/lib/articles";

const pageSize = 6;
const searchDelay = 120;
const snippetLength = 118;
const snippetContext = 38;

type HighlightPart = {
  highlighted: boolean;
  text: string;
};

type ArticleSearchResult = {
  article: Article;
  bodyMatch: boolean;
  preview: string;
};

const normalizeDisplayText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();

const normalizeSearchText = (value: unknown) =>
  normalizeDisplayText(value).toLocaleLowerCase("zh-CN");

const protectMarkdownCode = (value: string) => {
  const codeSegments: string[] = [];
  const protect = (code: string) => {
    const index = codeSegments.push(code) - 1;
    return `\uE000${index}\uE001`;
  };
  const text = value
    .normalize("NFKC")
    .replace(
      /^[ \t]*(`{3,}|~{3,})[^\r\n]*\r?\n([\s\S]*?)^[ \t]*\1[ \t]*$/gmu,
      (_, _fence: string, code: string) => protect(code),
    )
    .replace(/(`+)([^`\r\n]*?)\1/gu, (_, _ticks: string, code: string) => protect(code));

  return {
    restore: (prepared: string) => prepared.replace(
      /\uE000(\d+)\uE001/gu,
      (_, index: string) => codeSegments[Number(index)] ?? "",
    ),
    text,
  };
};

const markdownToSearchText = (body: string, contentFormat: Article["contentFormat"]) => {
  if (contentFormat !== "markdown") return normalizeDisplayText(body);

  const protectedCode = protectMarkdownCode(body);
  const prepared = protectedCode.text
    .replace(
      /@\[video\]\(\s*\S+(?:\s+["']([^"']*)["'])?\s*\)/giu,
      (_, title: string | undefined) => title || "视频",
    )
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/^[ \t]*(?:```+|~~~+)[^\r\n]*$/gmu, " ")
    .replace(/^[ \t]{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])[ \t]+/gmu, "")
    .replace(/^[ \t]*\|?(?:[ \t]*:?-{3,}:?[ \t]*\|)+[ \t]*$/gmu, " ")
    .replace(/^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/gmu, " ")
    .replace(/\\([\\`*_[\]{}()#+\-.!|>])/gu, "$1")
    .replace(/[*_~]+/gu, "")
    .replace(/\|/gu, " ");

  return normalizeDisplayText(protectedCode.restore(prepared));
};

const splitSearchTerms = (query: string) =>
  normalizeSearchText(query).split(" ").filter(Boolean);

const highlightedParts = (value: string, terms: string[]): HighlightPart[] => {
  const text = normalizeDisplayText(value);
  if (!text || !terms.length) return [{ highlighted: false, text }];

  const folded = text.toLocaleLowerCase("zh-CN");
  const parts: HighlightPart[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let matchStart = -1;
    let matchLength = 0;

    for (const term of terms) {
      const index = folded.indexOf(term, cursor);
      if (
        index >= 0
        && (matchStart < 0 || index < matchStart || (index === matchStart && term.length > matchLength))
      ) {
        matchStart = index;
        matchLength = term.length;
      }
    }

    if (matchStart < 0) break;
    if (matchStart > cursor) {
      parts.push({ highlighted: false, text: text.slice(cursor, matchStart) });
    }
    parts.push({
      highlighted: true,
      text: text.slice(matchStart, matchStart + matchLength),
    });
    cursor = matchStart + matchLength;
  }

  if (cursor < text.length) {
    parts.push({ highlighted: false, text: text.slice(cursor) });
  }

  return parts.length ? parts : [{ highlighted: false, text }];
};

const HighlightedText = ({ text, terms }: { text: string; terms: string[] }): ReactNode => (
  <>
    {highlightedParts(text, terms).map((part, index) => (
      part.highlighted
        ? <mark key={`${index}-${part.text}`}>{part.text}</mark>
        : <span key={`${index}-${part.text}`}>{part.text}</span>
    ))}
  </>
);

const bodySnippet = (bodyText: string, terms: string[]) => {
  const folded = normalizeSearchText(bodyText);
  const indexes = terms
    .map((term) => folded.indexOf(term))
    .filter((index) => index >= 0);
  const firstMatch = indexes.length ? Math.min(...indexes) : 0;
  const start = Math.max(firstMatch - snippetContext, 0);
  const end = Math.min(start + snippetLength, bodyText.length);
  return `${start > 0 ? "…" : ""}${bodyText.slice(start, end).trim()}${end < bodyText.length ? "…" : ""}`;
};

const searchArticle = (article: Article, terms: string[]): ArticleSearchResult | null => {
  const title = normalizeDisplayText(article.title);
  const excerpt = normalizeDisplayText(article.excerpt);
  const bodyText = markdownToSearchText(article.body, article.contentFormat);
  const titleIndex = normalizeSearchText(title);
  const excerptIndex = normalizeSearchText(excerpt);
  const bodyIndex = normalizeSearchText(bodyText);
  const combinedIndex = `${titleIndex} ${excerptIndex} ${bodyIndex}`;

  if (!terms.every((term) => combinedIndex.includes(term))) return null;

  const visibleIndex = `${titleIndex} ${excerptIndex}`;
  const bodyOnlyTerms = terms.filter(
    (term) => !visibleIndex.includes(term) && bodyIndex.includes(term),
  );
  const bodyMatch = bodyOnlyTerms.length > 0;

  return {
    article,
    bodyMatch,
    preview: bodyMatch ? bodySnippet(bodyText, bodyOnlyTerms) : excerpt,
  };
};

export default function Home() {
  const [articles, setArticles] = useState<Article[]>(seedArticles);
  const [activeCategory, setActiveCategory] = useState<Category>("全部");
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/articles", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { articles?: Article[] } | null) => {
        if (active && Array.isArray(payload?.articles)) setArticles(payload.articles);
      })
      .catch(() => {
        // GitHub Pages 镜像没有 API 时，继续使用内置的静态文章。
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchQuery(searchInput);
      setVisibleCount(pageSize);
    }, searchDelay);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const publishedArticles = useMemo(
    () => articles.filter((article) => article.status === "published"),
    [articles],
  );
  const searchTerms = useMemo(() => splitSearchTerms(searchQuery), [searchQuery]);
  const filteredArticles = useMemo(
    () => {
      const categoryArticles = activeCategory === "全部"
        ? publishedArticles
        : publishedArticles.filter((article) => article.category === activeCategory);

      return categoryArticles
        .map((article) => searchArticle(article, searchTerms))
        .filter((result): result is ArticleSearchResult => Boolean(result));
    },
    [activeCategory, publishedArticles, searchTerms],
  );
  const visibleArticles = filteredArticles.slice(0, visibleCount);
  const remainingCount = Math.max(filteredArticles.length - visibleCount, 0);

  const selectCategory = (category: Category) => {
    setActiveCategory(category);
    setVisibleCount(pageSize);
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setVisibleCount(pageSize);
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="知返首页">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>
            <strong>知返</strong>
            <small>ZHIFAN / NOTES</small>
          </span>
        </a>
        <nav className="main-nav" aria-label="主导航">
          <a className="active" href="#top">
            首页
          </a>
          <a href="#latest">文章</a>
        </nav>
      </header>

      <section className="hero section-shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> 一个慢慢写下来的角落</p>
          <h1>来煎<em>人寿</em></h1>
          <p className="hero-lede">
            这里是知返，记录工作里的方法、项目里的回声，
            以及日常生活中那些值得被留住的小事。
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#latest">从最近一篇开始 <span aria-hidden="true">↓</span></a>
          </div>
        </div>

        <div className="hero-art" aria-label="知返的手写便签插画">
          <div className="sun-disc" />
          <div className="paper-note note-back"><span>keep</span><b>going</b></div>
          <div className="paper-note note-front">
            <span className="note-label">TODAY&apos;S NOTE</span>
            <strong>慢一点，<br />也没关系。</strong>
            <span className="note-line" />
            <small>一条给自己的提醒</small>
          </div>
          <div className="leaf leaf-one" />
          <div className="leaf leaf-two" />
          <span className="doodle doodle-one">✦</span>
          <span className="doodle doodle-two">· · ·</span>
        </div>
      </section>

      <section className="signal-bar section-shell" aria-label="知返内容概览">
        <div><strong>{String(publishedArticles.length).padStart(2, "0")}</strong><span>篇文章</span></div>
        <div><strong>{String(categories.length).padStart(2, "0")}</strong><span>个长期栏目</span></div>
        <div><strong>01</strong><span>个持续更新的人</span></div>
        <p>写给正在路上的你，也写给未来的我。</p>
      </section>

      <section className="latest section-shell" id="latest">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span /> 文章</p>
            <h2>从想读的方向，<br /><em>找到一篇文章。</em></h2>
          </div>
          <p className="section-intro">按时间更新，也可以按分类慢慢浏览。</p>
        </div>

        <div className="article-search" data-article-search-shell>
          <label className="search-field">
            <span className="sr-only">检索文章</span>
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") clearSearch();
              }}
              placeholder="检索标题、摘要或正文"
              autoComplete="off"
              data-article-search
            />
            {searchInput && (
              <button
                className="search-clear"
                type="button"
                onClick={clearSearch}
                data-search-clear
              >
                清空
              </button>
            )}
          </label>
          <output className="search-status" aria-live="polite" data-search-status>
            {searchTerms.length
              ? `找到 ${filteredArticles.length} 篇文章`
              : `共 ${filteredArticles.length} 篇文章`}
          </output>
        </div>

        <div className="filter-row" aria-label="文章分类">
          {(["全部", ...categories.map((item) => item.label)] as Category[]).map((category) => (
            <button
              key={category}
              className={`filter-pill ${activeCategory === category ? "selected" : ""}`}
              onClick={() => selectCategory(category)}
              data-filter={category}
              type="button"
              aria-pressed={activeCategory === category}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="article-grid">
          {visibleArticles.map(({ article, bodyMatch, preview }, index) => (
            <article
              className={`article-card card-${article.accent} ${index === 0 ? "featured" : ""}`}
              key={article.id}
              data-article-id={article.id}
              data-article-category={article.category}
              data-article-title={article.title}
              data-article-body={article.body}
            >
              <div className="card-topline">
                <span className="category-dot"><i /></span>
                <span>{article.category}</span>
                <span className="card-date">{article.date}</span>
              </div>
              <h3><HighlightedText text={article.title} terms={searchTerms} /></h3>
              <p
                className={bodyMatch ? "search-snippet" : undefined}
                data-body-match={bodyMatch ? "true" : undefined}
              >
                <HighlightedText text={preview} terms={searchTerms} />
              </p>
              <div className="card-footer">
                <span>{article.readTime}</span>
                <a
                  className="read-link"
                  href={`./article.html?id=${encodeURIComponent(article.id)}`}
                  data-read-article={article.id}
                  aria-label={`阅读：${article.title}`}
                >
                  阅读全文 <span aria-hidden="true">→</span>
                </a>
              </div>
            </article>
          ))}
        </div>

        {!filteredArticles.length && (
          <p className="article-empty" data-article-empty>
            {searchTerms.length
              ? `没有找到同时包含“${normalizeDisplayText(searchQuery)}”的文章，换个关键词试试吧。`
              : "这个分类还没有文章，先去别处看看吧。"}
          </p>
        )}

        <div className="load-more-row" hidden={!remainingCount}>
          <button
            className="load-more"
            type="button"
            onClick={() => setVisibleCount((count) => count + pageSize)}
            data-load-more
          >
            加载更多 <span>还有 {remainingCount} 篇</span>
          </button>
        </div>
      </section>

      <footer className="site-footer section-shell">
        <div className="footer-brand"><strong>知返</strong><span>让走过的路，留下可以回看的光。</span></div>
        <div className="footer-links"><a href="#top">回到顶部 ↑</a><a href="#latest">文章</a></div>
        <small>© 2026 知返 · 用心记录，慢慢生长</small>
      </footer>
    </main>
  );
}
