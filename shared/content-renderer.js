import DOMPurify from "dompurify";
import { marked, Renderer } from "marked";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";

const languageModules = {
  bash,
  cpp,
  css,
  go,
  java,
  javascript,
  json,
  plaintext,
  powershell,
  python,
  rust,
  sql,
  typescript,
  xml,
};

for (const [name, language] of Object.entries(languageModules)) {
  hljs.registerLanguage(name, language);
}

hljs.registerAliases(["sh", "shell"], { languageName: "bash" });
hljs.registerAliases(["c", "c++"], { languageName: "cpp" });
hljs.registerAliases(["html", "svg"], { languageName: "xml" });
hljs.registerAliases(["js", "jsx"], { languageName: "javascript" });
hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
hljs.registerAliases(["text", "txt"], { languageName: "plaintext" });
hljs.registerAliases(["ps1"], { languageName: "powershell" });

const renderer = new Renderer();
renderer.html = ({ text }) => escapeHtml(text);

marked.setOptions({
  breaks: true,
  gfm: true,
  renderer,
});

const VIDEO_LINE = /^@\[video\]\((https:\/\/[^\s)]+)(?:\s+"([^"\n]{0,160})")?\)\s*$/gm;
const SAFE_PROTOCOLS = new Set(["https:", "mailto:"]);
const CODE_LANGUAGE_ALIASES = {
  c: "cpp",
  "c++": "cpp",
  html: "xml",
  js: "javascript",
  jsx: "javascript",
  ps1: "powershell",
  sh: "bash",
  shell: "bash",
  text: "plaintext",
  ts: "typescript",
  tsx: "typescript",
  txt: "plaintext",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeHosts(hosts) {
  return new Set(
    (Array.isArray(hosts) ? hosts : [])
      .map((host) => String(host ?? "").trim().toLowerCase())
      .filter(Boolean)
      .map((host) => {
        try {
          return new URL(host.includes("://") ? host : `https://${host}`).host.toLowerCase();
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
}

function parseUrl(value) {
  try {
    return new URL(value, window.location.href);
  } catch {
    return null;
  }
}

function isSafeLink(value) {
  if (!value || value.startsWith("#")) return true;
  if (value.startsWith("//")) return false;
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (parsed.origin === window.location.origin) return true;
  return SAFE_PROTOCOLS.has(parsed.protocol) && !parsed.username && !parsed.password;
}

function isSafeMedia(value, allowedHosts) {
  if (value.startsWith("//")) return false;
  const parsed = parseUrl(value);
  if (!parsed || parsed.username || parsed.password) return false;
  if (parsed.origin === window.location.origin) return true;
  return parsed.protocol === "https:" && allowedHosts.has(parsed.host.toLowerCase());
}

function mediaError(label) {
  const element = document.createElement("p");
  element.className = "content-media-error";
  element.textContent = `${label}地址未通过安全校验，暂时无法显示。`;
  return element;
}

function decorateLinks(fragment) {
  fragment.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    if (!isSafeLink(href)) {
      link.removeAttribute("href");
      link.classList.add("content-link-disabled");
      link.setAttribute("aria-disabled", "true");
      return;
    }
    const parsed = parseUrl(href);
    if (parsed && parsed.origin !== window.location.origin && parsed.protocol === "https:") {
      link.target = "_blank";
      link.rel = "noopener noreferrer nofollow";
    }
  });
}

function decorateImages(fragment, allowedHosts) {
  fragment.querySelectorAll("img").forEach((image) => {
    const src = image.getAttribute("src") ?? "";
    if (!isSafeMedia(src, allowedHosts)) {
      image.replaceWith(mediaError("图片"));
      return;
    }
    image.loading = "lazy";
    image.decoding = "async";
    if (!image.alt.trim()) image.alt = "文章图片";
  });
}

function decorateTables(fragment) {
  fragment.querySelectorAll("table").forEach((table) => {
    const wrapper = document.createElement("div");
    wrapper.className = "content-table-wrap";
    table.replaceWith(wrapper);
    wrapper.append(table);
  });
}

function normalizeLanguage(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  const normalized = CODE_LANGUAGE_ALIASES[raw] ?? raw;
  return hljs.getLanguage(normalized) ? normalized : "plaintext";
}

function decorateCode(fragment) {
  fragment.querySelectorAll("pre > code").forEach((code) => {
    const className = [...code.classList].find((item) => item.startsWith("language-"));
    const language = normalizeLanguage(className?.slice("language-".length));
    const source = code.textContent ?? "";
    const highlighted = hljs.highlight(source, { language, ignoreIllegals: true }).value;
    const highlightedFragment = DOMPurify.sanitize(highlighted, {
      ALLOWED_ATTR: ["class"],
      ALLOWED_TAGS: ["span"],
      RETURN_DOM_FRAGMENT: true,
    });
    code.replaceChildren(highlightedFragment);
    code.className = `hljs language-${language}`;

    const pre = code.parentElement;
    if (!pre || pre.parentElement?.classList.contains("content-code-block")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "content-code-block";
    const header = document.createElement("div");
    header.className = "content-code-header";
    const label = document.createElement("span");
    label.textContent = language === "plaintext" ? "代码" : language;
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "复制代码";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(source);
        copyButton.textContent = "已复制";
      } catch {
        copyButton.textContent = "复制失败";
      }
      window.setTimeout(() => {
        copyButton.textContent = "复制代码";
      }, 1600);
    });
    header.append(label, copyButton);
    pre.replaceWith(wrapper);
    wrapper.append(header, pre);
  });
}

function markdownFragment(source, allowedHosts) {
  const html = marked.parse(source, { async: false });
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_ATTR: ["alt", "class", "href", "src", "title"],
    ALLOWED_TAGS: [
      "a",
      "blockquote",
      "br",
      "code",
      "del",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "hr",
      "img",
      "li",
      "ol",
      "p",
      "pre",
      "strong",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "ul",
    ],
    RETURN_DOM_FRAGMENT: true,
  });
  decorateLinks(fragment);
  decorateImages(fragment, allowedHosts);
  decorateTables(fragment);
  decorateCode(fragment);
  return fragment;
}

function videoElement(src, title, allowedHosts) {
  if (!isSafeMedia(src, allowedHosts)) return mediaError("视频");
  const figure = document.createElement("figure");
  figure.className = "content-video";
  const video = document.createElement("video");
  video.controls = true;
  video.preload = "metadata";
  video.playsInline = true;
  video.src = src;
  video.addEventListener("error", () => {
    figure.classList.add("is-error");
  });
  figure.append(video);
  if (title) {
    const caption = document.createElement("figcaption");
    caption.textContent = title;
    figure.append(caption);
  }
  return figure;
}

function markdownParts(source) {
  const parts = [];
  let cursor = 0;
  for (const match of source.matchAll(VIDEO_LINE)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ type: "markdown", value: source.slice(cursor, index) });
    parts.push({ type: "video", src: match[1], title: match[2] ?? "" });
    cursor = index + match[0].length;
  }
  if (cursor < source.length) parts.push({ type: "markdown", value: source.slice(cursor) });
  return parts;
}

function renderContent(container, source, format = "plain", options = {}) {
  if (!(container instanceof Element)) return;
  const normalizedFormat = format === "markdown" ? "markdown" : "plain";
  const allowedHosts = normalizeHosts(options.allowedMediaHosts);
  container.classList.add("rich-content");
  container.classList.toggle("is-plain", normalizedFormat === "plain");
  container.replaceChildren();

  if (normalizedFormat === "plain") {
    container.textContent = String(source ?? "");
    return;
  }

  const content = String(source ?? "");
  if (!content.trim()) {
    const empty = document.createElement("p");
    empty.className = "content-empty";
    empty.textContent = options.emptyText || "正文预览会显示在这里。";
    container.append(empty);
    return;
  }

  for (const part of markdownParts(content)) {
    if (part.type === "video") {
      container.append(videoElement(part.src, part.title, allowedHosts));
    } else if (part.value) {
      container.append(markdownFragment(part.value, allowedHosts));
    }
  }
}

function readMediaHosts(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

const api = {
  renderContent,
  readMediaHosts,
  supportedCodeLanguages: Object.keys(languageModules),
};

if (typeof window !== "undefined") {
  window.ZhifanContent = api;
}

export { readMediaHosts, renderContent };
