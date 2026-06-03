const categories = [
  {
    id: "general",
    label: "General Discussion",
    shortLabel: "General",
    icon: "G",
    description: "Open conversations and everyday threads.",
  },
  {
    id: "questions",
    label: "Questions",
    shortLabel: "Questions",
    icon: "?",
    description: "Ask for advice, answers, or recommendations.",
  },
  {
    id: "pictures",
    label: "Pictures",
    shortLabel: "Pictures",
    icon: "P",
    description: "Photo posts, image threads, and visual updates.",
  },
  {
    id: "clubs",
    label: "Groups & Projects",
    shortLabel: "Groups",
    icon: "C",
    description: "Shared interests, projects, and group conversations.",
  },
];

const state = {
  posts: [],
  selectedId: null,
  category: "all",
  search: "",
};

const els = {
  forumSections: document.querySelector("#forumSections"),
  categorySelect: document.querySelector("#categorySelect"),
  postList: document.querySelector("#postList"),
  postDetail: document.querySelector("#postDetail"),
  emptyState: document.querySelector("#emptyState"),
  postCount: document.querySelector("#postCount"),
  searchInput: document.querySelector("#searchInput"),
  composer: document.querySelector("#composer"),
  postForm: document.querySelector("#postForm"),
  postError: document.querySelector("#postError"),
  newPostButton: document.querySelector("#newPostButton"),
  closeComposer: document.querySelector("#closeComposer"),
  cancelComposer: document.querySelector("#cancelComposer"),
  threadBrowser: document.querySelector("#threadBrowser"),
  threadBrowserTitle: document.querySelector("#threadBrowserTitle"),
  threadBrowserMeta: document.querySelector("#threadBrowserMeta"),
  newThreads: document.querySelector("#newThreads"),
  statThreads: document.querySelector("#statThreads"),
  statReplies: document.querySelector("#statReplies"),
  postImagePreview: document.querySelector("#postImagePreview"),
};

function formatDate(ms) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function categoryById(id) {
  return categories.find((category) => category.id === id);
}

function categoryLabel(id) {
  return categoryById(id)?.shortLabel || "General";
}

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function countText(count, singular, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function avatarText(name) {
  return (name || "A").trim().charAt(0).toUpperCase();
}

function filteredPosts() {
  const query = state.search.toLowerCase();
  return state.posts.filter((post) => {
    const matchesCategory = state.category === "all" || post.category === state.category;
    const haystack = `${post.title} ${post.body} ${post.author} ${categoryLabel(post.category)}`.toLowerCase();
    return matchesCategory && (!query || haystack.includes(query));
  });
}

function imageFromForm(form) {
  const file = form.elements.image?.files?.[0];
  if (!file) return Promise.resolve("");
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
    return Promise.reject(new Error("Picture must be PNG, JPEG, WebP, or GIF"));
  }
  if (file.size > 2_000_000) {
    return Promise.reject(new Error("Picture must be under 2 MB"));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("Could not read picture")));
    reader.readAsDataURL(file);
  });
}

function renderImage(src, alt = "Uploaded picture") {
  if (!src) return null;
  const image = createEl("img", "post-image");
  image.src = src;
  image.alt = alt;
  image.loading = "lazy";
  return image;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const contentType = response.headers.get("Content-Type") || "";
  const text = await response.text();
  let data = {};

  if (contentType.includes("application/json")) {
    try {
      data = text ? JSON.parse(text) : {};
    } catch (err) {
      throw new Error("Invalid JSON response from server");
    }
  } else if (text.trim()) {
    throw new Error("Unexpected server response: " + text.slice(0, 240));
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }
  return data;
}

async function loadPosts() {
  const data = await api("/api/posts");
  state.posts = data.posts;
  if (state.selectedId && !state.posts.some((post) => post.id === state.selectedId)) {
    state.selectedId = null;
  }
  render();
}

async function loadPostDetail(id) {
  const data = await api(`/api/posts/${id}`);
  state.selectedId = id;
  render();
  renderPostDetail(data.post, data.comments);
  els.postDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderForumSections() {
  // Categories panel removed — show only recent posts instead
  els.forumSections.innerHTML = "";
}

function categoryStats() {
  const counts = new Map(categories.map((category) => [category.id, { threads: 0, replies: 0, latest: null }]));
  for (const post of state.posts) {
    const categoryId = categoryById(post.category) ? post.category : "general";
    const stats = counts.get(categoryId);
    stats.threads += 1;
    stats.replies += post.commentCount;
    if (!stats.latest || post.updatedAt > stats.latest.updatedAt) {
      stats.latest = post;
    }
  }
  return counts;
}

function renderCategorySelect() {
  // Simplify composer category select to a single default category
  els.categorySelect.innerHTML = "";
  const option = createEl("option", "", "General");
  option.value = "general";
  els.categorySelect.append(option);
}

function renderPostList() {
  // Show recent posts sorted by most-recent update
  const posts = [...state.posts].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);
  els.postList.innerHTML = "";

  els.threadBrowserTitle.textContent = "Recent Posts";
  els.threadBrowserMeta.textContent = "Latest discussions";

  for (const post of posts) {
    const row = createEl("button", "thread-row", "");
    row.type = "button";
    row.classList.toggle("active", post.id === state.selectedId);
    row.addEventListener("click", () => loadPostDetail(post.id));

    row.append(createEl("span", "mini-avatar", avatarText(post.author)));

    const title = createEl("div", "thread-title");
    title.append(createEl("strong", "", post.title));
    const imageNote = post.imageData ? " · picture" : "";
    title.append(createEl("span", "", `${categoryLabel(post.category)} · ${post.author} · ${formatDate(post.updatedAt)}${imageNote}`));

    const replies = createEl("div", "thread-replies");
    replies.append(createEl("span", "", "Replies"));
    replies.append(createEl("strong", "", String(post.commentCount)));

    row.append(title, replies);
    els.postList.append(row);
  }

  els.emptyState.hidden = posts.length > 0;
  els.postCount.textContent = countText(posts.length, "thread");
}

function renderSidebar() {
  els.newThreads.innerHTML = "";
  const latest = [...state.posts].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 7);
  for (const post of latest) {
    const button = createEl("button", "new-thread", "");
    button.type = "button";
    button.addEventListener("click", () => loadPostDetail(post.id));
    button.append(createEl("span", "mini-avatar", avatarText(post.author)));
    const text = createEl("span");
    text.append(createEl("strong", "", post.title));
    text.append(createEl("small", "", `${categoryLabel(post.category)} · ${post.author}${post.imageData ? " · picture" : ""}`));
    button.append(text);
    els.newThreads.append(button);
  }
  if (!latest.length) {
    els.newThreads.append(createEl("p", "side-empty", "No threads yet."));
  }

  const replyCount = state.posts.reduce((sum, post) => sum + post.commentCount, 0);
  els.statThreads.textContent = state.posts.length.toLocaleString();
  els.statReplies.textContent = replyCount.toLocaleString();
}

function renderPostDetail(post, comments) {
  els.postDetail.innerHTML = "";

  const header = createEl("header", "thread-detail-header");
  const meta = createEl("div", "meta");
  meta.append(createEl("span", "tag", categoryLabel(post.category)));
  meta.append(createEl("span", "", `Started by ${post.author}`));
  meta.append(createEl("span", "", formatDate(post.createdAt)));
  header.append(meta, createEl("h2", "", post.title));

  const body = createEl("div", "thread-body");
  if (post.body) body.append(createEl("p", "", post.body));
  const postImage = renderImage(post.imageData, post.title);
  if (postImage) body.append(postImage);

  const replyArea = createEl("section", "reply-area");
  replyArea.append(createEl("h3", "", countText(comments.length, "Reply", "Replies")));

  const commentList = createEl("div", "comment-list");
  if (comments.length === 0) {
    commentList.append(createEl("p", "side-empty", "No replies yet."));
  }
  for (const comment of comments) {
    const item = createEl("article", "comment");
    const itemMeta = createEl("div", "meta");
    itemMeta.append(createEl("span", "mini-avatar", avatarText(comment.author)));
    itemMeta.append(createEl("strong", "", comment.author));
    itemMeta.append(createEl("span", "", formatDate(comment.createdAt)));
    item.append(itemMeta);
    if (comment.body) item.append(createEl("p", "", comment.body));
    const commentImage = renderImage(comment.imageData, `Picture from ${comment.author}`);
    if (commentImage) item.append(commentImage);
    commentList.append(item);
  }

  const form = createEl("form", "reply-form");
  form.innerHTML = `
    <label>
      <span>Your name</span>
      <input name="author" maxlength="60" placeholder="Name or nickname" autocomplete="name" />
    </label>
    <label>
      <span>Reply</span>
      <textarea name="body" rows="4" maxlength="2000" placeholder="Add to the discussion"></textarea>
    </label>
    <label>
      <span>Picture</span>
      <input name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
    </label>
    <img class="image-preview reply-preview" alt="" hidden />
    <div class="reply-grid">
      <p class="error" hidden></p>
      <button class="primary-button" type="submit">Reply</button>
    </div>
  `;
  const replyPreview = form.querySelector(".reply-preview");
  form.elements.image.addEventListener("change", () => updatePreview(form.elements.image, replyPreview));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = form.querySelector(".error");
    error.hidden = true;
    const formData = new FormData(form);
    try {
      const imageData = await imageFromForm(form);
      const data = await api(`/api/posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({
          author: formData.get("author"),
          body: formData.get("body"),
          imageData,
        }),
      });
      form.reset();
      replyPreview.hidden = true;
      await loadPosts();
      renderPostDetail(data.post, data.comments);
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });

  replyArea.append(commentList, form);
  els.postDetail.append(header, body, replyArea);
}

function renderPlaceholder() {
  els.postDetail.innerHTML = `
    <div class="thread-placeholder">
      <h2>Select a thread</h2>
      <p>Replies and full posts open here.</p>
    </div>
  `;
}

function render() {
  renderForumSections();
  renderPostList();
  renderSidebar();
  if (!state.selectedId) renderPlaceholder();
}

function updatePreview(input, preview) {
  const file = input.files?.[0];
  if (!file) {
    preview.hidden = true;
    preview.removeAttribute("src");
    return;
  }
  if (!file.type.startsWith("image/")) {
    preview.hidden = true;
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
}

function openComposer() {
  els.postError.hidden = true;
  els.postForm.reset();
  els.postImagePreview.hidden = true;
  els.postImagePreview.removeAttribute("src");
  els.categorySelect.value = state.category === "all" ? "general" : state.category;
  els.composer.showModal();
}

function closeComposer() {
  els.composer.close();
}

let searchTimer;
els.searchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    state.search = els.searchInput.value.trim();
    state.selectedId = null;
    render();
  }, 160);
});

els.postForm.elements.image.addEventListener("change", () => {
  updatePreview(els.postForm.elements.image, els.postImagePreview);
});

els.newPostButton.addEventListener("click", openComposer);
els.closeComposer.addEventListener("click", closeComposer);
els.cancelComposer.addEventListener("click", closeComposer);
document.querySelectorAll("[data-open-composer]").forEach((button) => {
  button.addEventListener("click", openComposer);
});

els.postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.postError.hidden = true;
  const formData = new FormData(els.postForm);
  try {
    const imageData = await imageFromForm(els.postForm);
    const data = await api("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        author: formData.get("author"),
        category: formData.get("category"),
        title: formData.get("title"),
        body: formData.get("body"),
        imageData,
      }),
    });
    closeComposer();
    state.selectedId = data.post.id;
    state.category = data.post.category;
    await loadPosts();
    renderPostDetail(data.post, data.comments);
  } catch (err) {
    els.postError.textContent = err.message;
    els.postError.hidden = false;
  }
});

renderCategorySelect();
loadPosts().catch((err) => {
  els.forumSections.innerHTML = "";
  els.postList.innerHTML = "";
  els.emptyState.hidden = false;
  els.emptyState.querySelector("h3").textContent = "Server unavailable";
  els.emptyState.querySelector("p").textContent = err.message;
});
