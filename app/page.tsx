"use client";

import { useEffect, useMemo, useState } from "react";
import {
  categories,
  seedArticles,
  type Article,
  type Category,
} from "@/lib/articles";

const pageSize = 6;

export default function Home() {
  const [articles, setArticles] = useState<Article[]>(seedArticles);
  const [activeCategory, setActiveCategory] = useState<Category>("全部");
  const [visibleCount, setVisibleCount] = useState(pageSize);

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

  const filteredArticles = useMemo(
    () =>
      activeCategory === "全部"
        ? articles
        : articles.filter((article) => article.category === activeCategory),
    [activeCategory, articles],
  );
  const visibleArticles = filteredArticles.slice(0, visibleCount);
  const remainingCount = Math.max(filteredArticles.length - visibleCount, 0);

  const selectCategory = (category: Category) => {
    setActiveCategory(category);
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
          <a href="#about">关于</a>
        </nav>
        <a className="header-link" href="#subscribe">
          订阅更新 <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className="hero section-shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> 一个慢慢写下来的角落</p>
          <h1>
            知道自己<br />
            <em>要回到哪里。</em>
          </h1>
          <p className="hero-lede">
            这里是知返，记录工作里的方法、项目里的回声，
            以及日常生活中那些值得被留住的小事。
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#latest">从最近一篇开始 <span aria-hidden="true">↓</span></a>
            <a className="button button-quiet" href="#about">认识知返 <span aria-hidden="true">→</span></a>
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
        <div><strong>{String(articles.length).padStart(2, "0")}</strong><span>篇文章</span></div>
        <div><strong>03</strong><span>个长期栏目</span></div>
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
          {visibleArticles.map((article, index) => (
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
              <h3>{article.title}</h3>
              <p>{article.excerpt}</p>
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
          <p className="article-empty" data-article-empty>这个分类还没有文章，先去别处看看吧。</p>
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

      <section className="about section-shell" id="about">
        <div className="about-portrait" aria-hidden="true">
          <div className="portrait-sun" />
          <div className="portrait-shape" />
          <span>把日子<br />过成自己的<br />样子</span>
        </div>
        <div className="about-copy">
          <p className="eyebrow"><span /> 关于知返</p>
          <h2>有些答案，<br /><em>要走一段路才会遇见。</em></h2>
          <p>我是知返的记录者。白天做需要耐心和好奇心的工作，闲下来就观察人、读书、写字。这个小站没有标准答案，只有一些被认真想过的事。</p>
          <p>如果你也在寻找自己的节奏，希望这里的文字能成为一盏不刺眼的小灯。</p>
          <a className="text-link" href="mailto:hello@zhifan.example">写信给我 <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <section className="subscribe section-shell" id="subscribe">
        <div>
          <p className="eyebrow light"><span /> 每月一封</p>
          <h2>把值得回看的文字，<br /><em>放进你的收件箱。</em></h2>
        </div>
        <form className="subscribe-form" onSubmit={(event) => event.preventDefault()} data-subscribe-form>
          <label className="sr-only" htmlFor="email">你的邮箱</label>
          <input id="email" type="email" placeholder="输入你的邮箱地址" required />
          <button type="submit">订阅 <span aria-hidden="true">→</span></button>
          <p>不频繁打扰，随时可以取消。</p>
        </form>
      </section>

      <footer className="site-footer section-shell">
        <div className="footer-brand"><strong>知返</strong><span>让走过的路，留下可以回看的光。</span></div>
        <div className="footer-links"><a href="#top">回到顶部 ↑</a><a href="#latest">文章</a><a href="#about">关于</a></div>
        <small>© 2026 知返 · 用心记录，慢慢生长</small>
      </footer>
    </main>
  );
}
