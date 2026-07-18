(() => {
  const start = () => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "auto";
    }

    const filterButtons = [...document.querySelectorAll("[data-filter]")];
    const articleCards = [...document.querySelectorAll("[data-article-id]")];
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

    filterButtons.forEach((button) => {
      button.addEventListener("click", () => selectCategory(button.dataset.filter ?? "全部"));
    });

    document.querySelectorAll("[data-category-trigger]").forEach((button) => {
      button.addEventListener("click", () => {
        selectCategory(button.dataset.categoryTrigger ?? "全部", true);
      });
    });

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

    document.querySelector("[data-close-preview]")?.addEventListener("click", closePreview);
    document.querySelector("[data-subscribe-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
