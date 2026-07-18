"use client";

import { useMemo, useState } from "react";

type Category = "全部" | "专业经验" | "项目复盘" | "生活随想";

type Article = {
  id: string;
  category: Exclude<Category, "全部">;
  date: string;
  readTime: string;
  title: string;
  excerpt: string;
  body: string;
  accent: "mint" | "coral" | "sky";
};

const articles: Article[] = [
  {
    id: "slow-work",
    category: "专业经验",
    date: "2026.07.12",
    readTime: "6 分钟",
    title: "把复杂的事，讲成别人听得懂的事",
    excerpt: "好的表达不是把话说满，而是给对方一条可以走下去的路。",
    body: "我把这件事拆成三个动作：先说结论，再补关键证据，最后留下一个可执行的下一步。写文档、做汇报、和人协作，其实都适用。",
    accent: "mint",
  },
  {
    id: "small-launch",
    category: "项目复盘",
    date: "2026.06.28",
    readTime: "8 分钟",
    title: "一个小功能上线后，我学会了先问为什么",
    excerpt: "复盘不是寻找谁做错了，而是找出系统怎样才能更温柔地工作。",
    body: "这次上线最有价值的部分，不是交付了多少代码，而是让我们看见了需求、节奏和反馈之间的缝隙。下一次，我会把验证提前一周。",
    accent: "coral",
  },
  {
    id: "window-light",
    category: "生活随想",
    date: "2026.06.05",
    readTime: "4 分钟",
    title: "给日子留一点没有安排的时间",
    excerpt: "当生活不再只剩下待办事项，心里才会长出新的方向。",
    body: "我开始把每周的一小段时间留给散步、发呆和不带目的地读几页书。那些看似没有产出的时刻，反而让下一次出发变得清醒。",
    accent: "sky",
  },
];

const categories: { label: Exclude<Category, "全部">; note: string; count: string }[] = [
  { label: "专业经验", note: "方法、协作与表达", count: "08 篇" },
  { label: "项目复盘", note: "做过的事与学到的课", count: "06 篇" },
  { label: "生活随想", note: "慢下来，也继续生长", count: "12 篇" },
];

const categoryColors: Record<Exclude<Category, "全部">, string> = {
  专业经验: "mint",
  项目复盘: "coral",
  生活随想: "sky",
};

export default function Home() {
  const [activeCategory, setActiveCategory] = useState<Category>("全部");
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const filteredArticles = useMemo(
    () =>
      activeCategory === "全部"
        ? articles
        : articles.filter((article) => article.category === activeCategory),
    [activeCategory],
  );

  const selectCategory = (category: Category) => {
    setActiveCategory(category);
    setSelectedArticle(null);
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
        <div><strong>26</strong><span>篇文章</span></div>
        <div><strong>03</strong><span>个长期栏目</span></div>
        <div><strong>01</strong><span>个持续更新的人</span></div>
        <p>写给正在路上的你，也写给未来的我。</p>
      </section>

      <section className="latest section-shell" id="latest">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span /> 最近更新</p>
            <h2>把走过的路，<br /><em>整理成可以分享的光。</em></h2>
          </div>
          <p className="section-intro">不追赶热点，只记录那些在时间里依然有用的东西。</p>
        </div>

        <div className="filter-row" role="tablist" aria-label="文章分类">
          {(["全部", ...categories.map((item) => item.label)] as Category[]).map((category) => (
            <button
              key={category}
              className={`filter-pill ${activeCategory === category ? "selected" : ""}`}
              onClick={() => selectCategory(category)}
              data-filter={category}
              role="tab"
              aria-selected={activeCategory === category}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="article-grid">
          {filteredArticles.map((article, index) => (
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
                <button
                  className="read-link"
                  onClick={() => setSelectedArticle(article)}
                  data-read-article={article.id}
                  aria-label={`阅读：${article.title}`}
                >
                  阅读全文 <span aria-hidden="true">↗</span>
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="article-preview" aria-live="polite" hidden={!selectedArticle} data-article-preview>
          <div>
            <p className="eyebrow">
              <span /> <b data-preview-meta>{selectedArticle ? `正在阅读 · ${selectedArticle.category}` : ""}</b>
            </p>
            <h3 data-preview-title>{selectedArticle?.title ?? ""}</h3>
            <p data-preview-body>{selectedArticle?.body ?? ""}</p>
          </div>
          <button
            className="close-preview"
            onClick={() => setSelectedArticle(null)}
            data-close-preview
            aria-label="关闭文章预览"
          >
            ×
          </button>
        </div>
      </section>

      <section className="categories section-shell" id="categories">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow"><span /> 三条线索</p>
            <h2>从不同的入口，<br /><em>走回自己。</em></h2>
          </div>
        </div>
        <div className="category-grid">
          {categories.map((item, index) => (
            <button
              className={`category-card category-${categoryColors[item.label]}`}
              key={item.label}
              onClick={() => selectCategory(item.label)}
              data-category-trigger={item.label}
            >
              <span className="category-index">0{index + 1}</span>
              <span className="category-icon" aria-hidden="true">{index === 0 ? "↗" : index === 1 ? "↺" : "✧"}</span>
              <strong>{item.label}</strong>
              <span>{item.note}</span>
              <small>{item.count} <b>→</b></small>
            </button>
          ))}
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
