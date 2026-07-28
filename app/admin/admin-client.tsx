"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  categories,
  type Article,
  type ArticleContentFormat,
  type ArticleStatus,
  type Category,
} from "@/lib/articles";

type AdminClientProps = {
  user: { displayName: string; email: string };
  signOutPath: string;
};

type ArticleDraft = {
  category: Exclude<Category, "全部">;
  date: string;
  readTime: string;
  title: string;
  excerpt: string;
  body: string;
  contentFormat: ArticleContentFormat;
  accent: "mint" | "coral" | "sky";
  status: ArticleStatus;
};

type StatusFilter = ArticleStatus | "all";

declare global {
  interface Window {
    ZhifanContent?: {
      renderContent: (
        container: Element,
        source: string,
        format: ArticleContentFormat,
        options?: { allowedMediaHosts?: string[]; emptyText?: string },
      ) => void;
    };
  }
}

const statusLabels: Record<StatusFilter, string> = {
  all: "全部",
  published: "已发布",
  draft: "草稿",
  archived: "已归档",
};

const categoryAccent: Record<ArticleDraft["category"], ArticleDraft["accent"]> = {
  项目经验: "mint",
  生活随想: "sky",
};

function today() {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()).replaceAll("/", ".");
}

function emptyDraft(): ArticleDraft {
  return {
    category: "项目经验",
    date: today(),
    readTime: "5 分钟",
    title: "",
    excerpt: "",
    body: "",
    contentFormat: "markdown",
    accent: "mint",
    status: "draft",
  };
}

function toDraft(article: Article): ArticleDraft {
  return {
    category: article.category,
    date: article.date,
    readTime: article.readTime,
    title: article.title,
    excerpt: article.excerpt,
    body: article.body,
    contentFormat: article.contentFormat === "markdown" ? "markdown" : "plain",
    accent: article.accent,
    status: article.status ?? "draft",
  };
}

function statusOf(article: Article): ArticleStatus {
  return article.status ?? "published";
}

async function requestArticles() {
  const response = await fetch("/api/admin/articles?status=all", { cache: "no-store" });
  const payload = (await response.json()) as { articles?: Article[]; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "文章加载失败");
  return payload.articles ?? [];
}

export default function AdminClient({ user, signOutPath }: AdminClientProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ArticleDraft>(emptyDraft);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Article | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mediaHosts, setMediaHosts] = useState<string[]>([]);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const selectedArticle = useMemo(
    () => articles.find((article) => article.id === selectedId) ?? null,
    [articles, selectedId],
  );

  const visibleArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return articles.filter((article) => {
      const matchesStatus = filter === "all" || statusOf(article) === filter;
      const matchesQuery = !normalizedQuery || `${article.title} ${article.excerpt}`.toLowerCase().includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [articles, filter, query]);

  const counts = useMemo(() => ({
    all: articles.length,
    published: articles.filter((article) => statusOf(article) === "published").length,
    draft: articles.filter((article) => statusOf(article) === "draft").length,
    archived: articles.filter((article) => statusOf(article) === "archived").length,
  }), [articles]);

  const loadArticles = async () => {
    setLoading(true);
    setError("");
    try {
      setArticles(await requestArticles());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "文章加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    requestArticles()
      .then((result) => {
        if (active) setArticles(result);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "文章加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/media-config.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { allowedHosts: [] })
      .then((payload: { allowedHosts?: string[] }) => {
        if (active) setMediaHosts(Array.isArray(payload.allowedHosts) ? payload.allowedHosts : []);
      })
      .catch(() => {
        if (active) setMediaHosts([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let attempts = 0;
    let timer = 0;
    const render = () => {
      if (previewRef.current && window.ZhifanContent?.renderContent) {
        window.ZhifanContent.renderContent(previewRef.current, draft.body, draft.contentFormat, {
          allowedMediaHosts: mediaHosts,
          emptyText: "正文预览会显示在这里。",
        });
        return;
      }
      attempts += 1;
      if (attempts < 20) timer = window.setTimeout(render, 50);
    };
    render();
    return () => window.clearTimeout(timer);
  }, [draft.body, draft.contentFormat, mediaHosts]);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingDelete(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("admin-modal-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("admin-modal-open");
    };
  }, [pendingDelete]);

  const selectArticle = (article: Article) => {
    setSelectedId(article.id);
    setDraft(toDraft(article));
    setMessage("");
    setError("");
  };

  const startNew = () => {
    setSelectedId(null);
    setDraft(emptyDraft());
    setMessage("");
    setError("");
  };

  const updateDraft = <K extends keyof ArticleDraft>(field: K, value: ArticleDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const replaceBodySelection = (replacement: string, selectStart = 0, selectEnd = replacement.length) => {
    const input = bodyInputRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const nextBody = `${draft.body.slice(0, start)}${replacement}${draft.body.slice(end)}`;
    updateDraft("body", nextBody);
    window.requestAnimationFrame(() => {
      bodyInputRef.current?.focus();
      bodyInputRef.current?.setSelectionRange(start + selectStart, start + selectEnd);
    });
  };

  const wrapBodySelection = (before: string, after: string, fallback: string) => {
    const input = bodyInputRef.current;
    if (!input) return;
    const selected = draft.body.slice(input.selectionStart, input.selectionEnd) || fallback;
    replaceBodySelection(`${before}${selected}${after}`, before.length, before.length + selected.length);
  };

  const prefixBodyLines = (prefix: (index: number) => string) => {
    const input = bodyInputRef.current;
    if (!input) return;
    const selected = draft.body.slice(input.selectionStart, input.selectionEnd) || "在这里继续写";
    const replacement = selected.split("\n").map((line, index) => `${prefix(index)}${line}`).join("\n");
    replaceBodySelection(replacement);
  };

  const markdownAction = (action: string) => {
    if (draft.contentFormat !== "markdown") return;
    if (action === "heading") prefixBodyLines(() => "## ");
    if (action === "bold") wrapBodySelection("**", "**", "重点文字");
    if (action === "italic") wrapBodySelection("*", "*", "强调文字");
    if (action === "quote") prefixBodyLines(() => "> ");
    if (action === "unordered-list") prefixBodyLines(() => "- ");
    if (action === "ordered-list") prefixBodyLines((index) => `${index + 1}. `);
    if (action === "inline-code") wrapBodySelection("`", "`", "代码");
    if (action === "code") {
      const language = window.prompt("代码语言，例如 javascript、python、sql", "javascript")?.trim() || "plaintext";
      wrapBodySelection(`\`\`\`${language}\n`, "\n```", "在这里粘贴代码");
    }
    if (action === "link") {
      const href = window.prompt("请输入 HTTPS 链接或站内相对地址", "https://");
      if (href) wrapBodySelection("[", `](${href.trim()})`, "链接文字");
    }
    if (action === "image") {
      const url = window.prompt("请粘贴已上传图片的 HTTPS 地址", "https://");
      if (!url) return;
      const alt = window.prompt("请填写图片替代文字", "文章图片")?.replaceAll("]", "\\]") || "文章图片";
      replaceBodySelection(`![${alt}](${url.trim()})`);
    }
    if (action === "video") {
      const url = window.prompt("请粘贴已上传 MP4 或 WebM 的 HTTPS 地址", "https://");
      if (!url) return;
      const caption = window.prompt("视频标题（可选）", "")?.replaceAll('"', "'").trim();
      replaceBodySelection(`@[video](${url.trim()}${caption ? ` "${caption}"` : ""})`);
    }
    if (action === "table") replaceBodySelection("| 项目 | 说明 |\n| --- | --- |\n| 内容 | 在这里填写 |");
    if (action === "divider") replaceBodySelection("\n\n---\n\n", 2, 5);
  };

  const saveArticle = async (requestedStatus: ArticleStatus) => {
    setSaving(true);
    setMessage("");
    setError("");
    const payload = { ...draft, status: requestedStatus };
    try {
      const response = await fetch(selectedId ? `/api/admin/articles/${encodeURIComponent(selectedId)}` : "/api/admin/articles", {
        method: selectedId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { article?: Article; error?: string };
      if (!response.ok || !result.article) throw new Error(result.error ?? "保存失败");
      setArticles((current) => {
        const exists = current.some((article) => article.id === result.article!.id);
        return exists
          ? current.map((article) => article.id === result.article!.id ? result.article! : article)
          : [result.article!, ...current];
      });
      setSelectedId(result.article.id);
      setDraft(toDraft(result.article));
      setMessage(requestedStatus === "published" ? "文章已发布" : requestedStatus === "archived" ? "文章已归档" : "草稿已保存");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const submitArticle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const requestedStatus = submitter?.dataset.status;
    const status = requestedStatus === "published" || requestedStatus === "archived" ? requestedStatus : "draft";
    void saveArticle(status);
  };

  const deleteArticle = async () => {
    if (!pendingDelete) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/articles/${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "删除失败");
      setArticles((current) => current.filter((article) => article.id !== pendingDelete.id));
      if (selectedId === pendingDelete.id) startNew();
      setPendingDelete(null);
      setMessage("文章已删除");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="admin-page">
      <header className="admin-header section-shell">
          <Link className="brand" href="/" aria-label="返回知返首页">
          <span className="brand-mark" aria-hidden="true"><span /><span /></span>
          <span><strong>知返</strong><small>EDITOR DESK</small></span>
          </Link>
        <div className="admin-header-actions">
          <span className="admin-user">{user.displayName}</span>
          <Link className="button button-quiet" href="/">查看博客 <span aria-hidden="true">↗</span></Link>
          <a className="admin-signout" href={signOutPath}>退出</a>
        </div>
      </header>

      <section className="admin-layout section-shell">
        <aside className="admin-sidebar" aria-label="管理导航">
          <p className="eyebrow"><span /> 内容工作台</p>
          <nav>
            <a className="admin-nav-active" href="#articles">文章管理 <span>{counts.all}</span></a>
            <a href="#editor">写作编辑器</a>
            <Link href="/">返回公开博客</Link>
          </nav>
          <div className="admin-sidebar-note"><strong>慢慢写，也认真发布。</strong><span>所有更改会保存到云端文章库。</span></div>
        </aside>

        <div className="admin-content">
          <div className="admin-title-row" id="articles">
            <div><p className="eyebrow"><span /> 知返管理后台</p><h1>文章管理</h1><p>写下新的想法，整理走过的路。</p></div>
            <button className="button button-primary" type="button" onClick={startNew}>＋ 写新文章</button>
          </div>

          <div className="admin-stat-row" aria-label="文章统计">
            {(Object.keys(statusLabels) as StatusFilter[]).map((item) => (
              <button key={item} className={`admin-stat ${filter === item ? "selected" : ""}`} type="button" onClick={() => setFilter(item)}>
                <strong>{counts[item]}</strong><span>{statusLabels[item]}</span>
              </button>
            ))}
          </div>

          <div className="admin-toolbar">
            <label className="admin-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或摘要" aria-label="搜索文章" /></label>
            <button className="admin-refresh" type="button" onClick={() => void loadArticles()} disabled={loading}>刷新列表</button>
          </div>

          <div className="admin-workspace">
            <section className="admin-list-card" aria-label="文章列表">
              <div className="admin-card-heading"><h2>你的文章</h2><span>{visibleArticles.length} 篇</span></div>
              {loading ? <p className="admin-empty">正在读取文章……</p> : visibleArticles.length === 0 ? <div className="admin-empty"><strong>这里还没有文章</strong><span>从右侧编辑器写下第一篇吧。</span></div> : (
                <div className="admin-article-list">
                  {visibleArticles.map((article) => (
                    <article className={`admin-article-row ${selectedId === article.id ? "selected" : ""}`} key={article.id}>
                      <button className="admin-article-select" type="button" onClick={() => selectArticle(article)}>
                        <span className={`admin-dot dot-${article.accent}`} aria-hidden="true" />
                        <span className="admin-article-copy"><strong>{article.title}</strong><small>{article.category} · {article.date}</small></span>
                        <span className={`admin-status status-${statusOf(article)}`}>{statusLabels[statusOf(article)]}</span>
                      </button>
                      <button className="admin-delete-link" type="button" onClick={() => setPendingDelete(article)} aria-label={`删除：${article.title}`}>删除</button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="admin-editor-card" id="editor" aria-label="文章编辑器">
              <div className="admin-card-heading"><div><p className="eyebrow"><span /> {selectedArticle ? "编辑文章" : "新文章"}</p><h2>{selectedArticle ? "把想说的话，整理成光。" : "从一个念头开始。"}</h2></div>{selectedArticle && <span className={`admin-status status-${statusOf(selectedArticle)}`}>{statusLabels[statusOf(selectedArticle)]}</span>}</div>
              <form onSubmit={submitArticle}>
                <label className="admin-field admin-field-title">标题<input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} placeholder="给这篇文章一个标题" required maxLength={120} /></label>
                <div className="admin-field-grid"><label className="admin-field">栏目<select value={draft.category} onChange={(event) => { const category = event.target.value as ArticleDraft["category"]; updateDraft("category", category); updateDraft("accent", categoryAccent[category]); }}>{categories.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}</select></label><label className="admin-field">日期<input value={draft.date} onChange={(event) => updateDraft("date", event.target.value)} required /></label><label className="admin-field">阅读时长<input value={draft.readTime} onChange={(event) => updateDraft("readTime", event.target.value)} required /></label></div>
                <label className="admin-field">摘要<textarea value={draft.excerpt} onChange={(event) => updateDraft("excerpt", event.target.value)} placeholder="用一句话告诉读者，这篇文章值得回看的地方" rows={3} maxLength={300} /></label>
                <div className="admin-rich-editor">
                  {draft.contentFormat === "plain" && <div className="admin-format-notice"><span>这是一篇旧的纯文本文章，当前会保持原样显示。</span><button type="button" onClick={() => updateDraft("contentFormat", "markdown")}>升级为多格式文章</button></div>}
                  <div className="admin-markdown-toolbar" aria-label="Markdown 格式工具栏">
                    {[
                      ["heading", "H2"],
                      ["bold", "粗体"],
                      ["italic", "斜体"],
                      ["quote", "引用"],
                      ["unordered-list", "列表"],
                      ["ordered-list", "编号"],
                      ["link", "链接"],
                      ["image", "图片 URL"],
                      ["video", "视频 URL"],
                      ["inline-code", "行内代码"],
                      ["code", "代码块"],
                      ["table", "表格"],
                      ["divider", "分隔线"],
                    ].map(([action, label]) => <button key={action} type="button" onClick={() => markdownAction(action)} disabled={draft.contentFormat !== "markdown"}>{label}</button>)}
                  </div>
                  <p className="admin-upload-note">本地图片和视频请在 ECS 安全后台上传；这里可以插入已经上传好的 HTTPS 地址。</p>
                  <div className="admin-rich-grid">
                    <label className="admin-field">正文（Markdown）<textarea ref={bodyInputRef} className="admin-body-input" value={draft.body} onChange={(event) => updateDraft("body", event.target.value)} placeholder="从这里开始写正文……" rows={18} maxLength={100000} required /></label>
                    <section className="admin-rich-preview" aria-label="文章实时预览"><span>实时预览</span><div ref={previewRef} /></section>
                  </div>
                </div>
                <div className="admin-editor-footer"><label className="admin-field admin-status-select">当前状态<select value={draft.status} onChange={(event) => updateDraft("status", event.target.value as ArticleStatus)}><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option></select></label><div className="admin-form-actions"><button className="button button-quiet" type="button" onClick={startNew}>清空</button><button className="button button-secondary" type="submit" data-status={draft.status} disabled={saving}>{saving ? "保存中…" : "保存更改"}</button><button className="button button-primary" type="submit" data-status="published" disabled={saving}>发布文章 <span aria-hidden="true">↗</span></button></div></div>
              </form>
            </section>
          </div>

          <p className={`admin-message ${error ? "is-error" : ""}`} role="status" aria-live="polite">{error || message}</p>
        </div>
      </section>

      {pendingDelete && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDelete(null); }}><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><p className="eyebrow"><span /> 确认删除</p><h2 id="delete-title">要删除这篇文章吗？</h2><p>“{pendingDelete.title}”删除后将从文章库中移除，之后无法在后台恢复。</p><div className="admin-modal-actions"><button className="button button-quiet" type="button" onClick={() => setPendingDelete(null)}>先不删</button><button className="button button-danger" type="button" onClick={() => void deleteArticle()} disabled={saving}>确认删除</button></div></div></div>}
    </main>
  );
}
