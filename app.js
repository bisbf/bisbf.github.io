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

const STORAGE_KEY = "bisbfforum-data";

// Configure remote sync for cross-device forums.
// 1) Create a Firebase Realtime Database.
// 2) Use the database URL with a path ending in .json.
// 3) Set the rules to allow public read/write for this demo.
// Exact URL for this project:
const REMOTE_DB_URL = "https://bisbf-e75b1-default-rtdb.firebaseio.com/bisbf-forum.json";
const REMOTE_SYNC_ENABLED = REMOTE_DB_URL.trim().length > 0;

const state = {
  posts: [],
  selectedId: null,
  category: "all",
  search: "",
  currentProfile: null,
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
  profileButton: document.querySelector("#profileButton"),
  profileAvatar: document.querySelector("#profileAvatar"),
  profileName: document.querySelector("#profileName"),
  profileEditor: document.querySelector("#profileEditor"),
  profileForm: document.querySelector("#profileForm"),
  profileInputName: document.querySelector("#profileInputName"),
  profileImageUpload: document.querySelector("#profileImageUpload"),
  profilePreview: document.querySelector("#profilePreview"),
  profileFromGiphy: document.querySelector("#profileFromGiphy"),
  profileNameAnimation: document.querySelector("#profileNameAnimation"),
  profileGlowColor: document.querySelector("#profileGlowColor"),
  profileError: document.querySelector("#profileError"),
  closeProfile: document.querySelector("#closeProfile"),
  cancelProfile: document.querySelector("#cancelProfile"),
  giphySearch: document.querySelector("#giphySearch"),
  giphySearchInput: document.querySelector("#giphySearchInput"),
  giphyResults: document.querySelector("#giphyResults"),
  closeGiphy: document.querySelector("#closeGiphy"),
  notificationToast: document.querySelector("#notificationToast"),
  notificationMessage: document.querySelector("#notificationMessage"),
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

function loadLocalStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { posts: [], comments: [], nextPostId: 1, nextCommentId: 1, profiles: {} };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      nextPostId: Number(parsed.nextPostId) || 1,
      nextCommentId: Number(parsed.nextCommentId) || 1,
      profiles: typeof parsed.profiles === 'object' && parsed.profiles ? parsed.profiles : {},
    };
  } catch {
    return { posts: [], comments: [], nextPostId: 1, nextCommentId: 1, profiles: {} };
  }
}

function saveLocalStorage(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function fetchJson(url, options = {}) {
  const { allowNotFound = false, ...fetchOptions } = options;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...fetchOptions,
  });
  const text = await response.text();
  if (!response.ok) {
    if (allowNotFound && response.status === 404) {
      return null;
    }
    throw new Error(`Remote sync failed: ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

async function loadRemoteStorage() {
  if (!REMOTE_SYNC_ENABLED) {
    return loadLocalStorage();
  }
  try {
    const data = await fetchJson(REMOTE_DB_URL, { method: "GET", allowNotFound: true });
    if (!data || typeof data !== "object") {
      return { posts: [], comments: [], nextPostId: 1, nextCommentId: 1 };
    }
    return {
      posts: Array.isArray(data.posts) ? data.posts : [],
      comments: Array.isArray(data.comments) ? data.comments : [],
      nextPostId: Number(data.nextPostId) || 1,
      nextCommentId: Number(data.nextCommentId) || 1,
    };
  } catch (err) {
    console.error("Remote sync error:", err.message);
    return loadLocalStorage();
  }
}

async function saveRemoteStorage(data) {
  if (!REMOTE_SYNC_ENABLED) {
    saveLocalStorage(data);
    return;
  }

  try {
    await fetchJson(REMOTE_DB_URL, {
      method: "PUT",
      body: JSON.stringify(data),
      allowNotFound: true,
    });
    console.log("Remote sync saved successfully");
  } catch (err) {
    console.error("Failed to save to Firebase:", err.message);
    console.warn("Saving to localStorage only. Check Firebase rules and URL.");
  }
  saveLocalStorage(data);
}

async function loadStorageData() {
  const data = await loadRemoteStorage();
  if (!data.profiles) data.profiles = {};
  saveLocalStorage(data);
  return data;
}

function parseRequestBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Invalid request body");
  }
}

function clean_text(value, max_len) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max_len);
}

function clean_body(value, max_len) {
  if (typeof value !== "string") return "";
  let text = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  text = text.replace(/\n{4,}/g, "\n\n\n");
  return text.slice(0, max_len);
}

function clean_image(value) {
  if (typeof value !== "string" || !value) return "";
  const MAX_IMAGE_CHARS = 2_800_000;
  if (value.length > MAX_IMAGE_CHARS) return "";
  if (!value.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/)) {
    return "";
  }
  return value;
}

function showNotification(message, duration = 3000) {
  els.notificationMessage.textContent = message;
  els.notificationToast.hidden = false;
  window.setTimeout(() => {
    els.notificationToast.hidden = true;
  }, duration);
}

async function getProfiles() {
  const storage = await loadStorageData();
  return storage.profiles || {};
}

async function saveProfiles(profiles) {
  const storage = await loadStorageData();
  storage.profiles = profiles;
  await saveRemoteStorage(storage);
}

async function getOrCreateProfile(name) {
  if (!name) return null;
  const profiles = await getProfiles();
  if (!profiles[name]) {
    profiles[name] = {
      name,
      avatar: "",
      frame: "glow",
      nameAnimation: "glow",
      glowColor: "#ff00ff",
    };
    await saveProfiles(profiles);
    showNotification("Profile created! Check it out");
  }
  return profiles[name];
}

async function updateProfile(name, updates) {
  const profiles = await getProfiles();
  if (!profiles[name]) {
    profiles[name] = { name };
  }
  profiles[name] = { ...profiles[name], ...updates };
  await saveProfiles(profiles);
  showNotification("Profile saved!");
  state.currentProfile = profiles[name];
  renderProfileButton();
}

function renderProfileButton() {
  if (!state.currentProfile || !state.currentProfile.avatar) {
    els.profileButton.hidden = true;
    return;
  }
  els.profileButton.hidden = false;
  els.profileAvatar.src = state.currentProfile.avatar;
  els.profileName.textContent = state.currentProfile.name;
  applyProfileFrame();
}

function applyProfileFrame() {
  if (!state.currentProfile) return;
  const { frame, nameAnimation, glowColor } = state.currentProfile;
  els.profileName.className = `profile-name animation-${nameAnimation}`;
  els.profileName.style.textShadow = `0 0 10px ${glowColor}, 0 0 20px ${glowColor}`;
}

async function searchGiphy(query) {
  if (!query) {
    els.giphyResults.innerHTML = "";
    return;
  }

  const GIPHY_API_KEY = "qxIfKRiAotWJyEhQhHi8yXYDfAJLfxW3";
  const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=16&rating=g`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    els.giphyResults.innerHTML = "";

    if (data.data && data.data.length > 0) {
      for (const gif of data.data) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "giphy-result";
        btn.innerHTML = `<img src="${gif.images.fixed_height.url}" alt="${gif.title}" />`;
        btn.addEventListener("click", () => {
          selectGiphyGif(gif.images.fixed_height.url);
        });
        els.giphyResults.append(btn);
      }
    } else {
      els.giphyResults.textContent = "No GIFs found";
    }
  } catch (err) {
    els.giphyResults.textContent = "Search failed";
    console.error("Giphy search error:", err);
  }
}

function selectGiphyGif(url) {
  els.profilePreview.src = url;
  els.profilePreview.hidden = false;
  els.profileImageUpload.value = "";
  els.giphySearch.close();
  els.profileForm.dataset.avatarUrl = url;
}

function getPostById(postId, storage) {
  const post = storage.posts.find((item) => item.id === postId);
  if (!post) {
    throw new Error("Post not found");
  }
  return post;
}

async function listPosts() {
  const storage = await loadStorageData();
  return storage.posts.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

async function getPostDetail(postId) {
  const storage = await loadStorageData();
  const post = getPostById(postId, storage);
  const comments = storage.comments
    .filter((comment) => comment.postId === postId)
    .sort((a, b) => a.createdAt - b.createdAt);
  return { post, comments };
}

async function createPost(body) {
  const storage = await loadStorageData();
  const title = clean_text(body.title, 120);
  const author = clean_text(body.author, 60) || "Anonymous";
  const category = clean_text(body.category, 64) || "general";
  const postBody = clean_body(body.body, 5000);
  const imageData = clean_image(body.imageData);

  const normalizedCategory = categories.some((item) => item.id === category) ? category : "general";
  if (title.length < 3) {
    throw new Error("Title must be at least 3 characters");
  }
  if (postBody.length < 3 && !imageData) {
    throw new Error("Post must include text or a picture");
  }
  if (body.imageData && !imageData) {
    throw new Error("Picture must be PNG, JPEG, WebP, or GIF under about 2 MB");
  }

  const createdAt = Date.now();
  const post = {
    id: storage.nextPostId,
    title,
    body: postBody,
    author,
    category: normalizedCategory,
    imageData,
    createdAt,
    updatedAt: createdAt,
    commentCount: 0,
  };
  storage.posts.push(post);
  storage.nextPostId += 1;
  await saveRemoteStorage(storage);
  
  if (author !== "Anonymous") {
    localStorage.setItem("currentUserName", author);
    await getOrCreateProfile(author);
  }
  
  return { post, comments: [] };
}
async function createComment(postId, body) {
  const storage = await loadStorageData();
  const author = clean_text(body.author, 60) || "Anonymous";
  const commentBody = clean_body(body.body, 2000);
  const imageData = clean_image(body.imageData);

  if (commentBody.length < 2 && !imageData) {
    throw new Error("Reply must include text or a picture");
  }
  if (body.imageData && !imageData) {
    throw new Error("Picture must be PNG, JPEG, WebP, or GIF under about 2 MB");
  }

  const post = storage.posts.find((item) => item.id === postId);
  if (!post) {
    throw new Error("Post not found");
  }

  const createdAt = Date.now();
  const comment = {
    id: storage.nextCommentId,
    postId,
    body: commentBody,
    author,
    imageData,
    createdAt,
  };
  storage.comments.push(comment);
  storage.nextCommentId += 1;
  post.updatedAt = createdAt;
  post.commentCount = storage.comments.filter((item) => item.postId === postId).length;
  await saveRemoteStorage(storage);
  return getPostDetail(postId);
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
  const method = (options.method || "GET").toUpperCase();
  const body = parseRequestBody(options.body);

  if (path === "/api/posts" && method === "GET") {
    return { posts: await listPosts() };
  }

  const postIdMatch = path.match(/^\/api\/posts\/(\d+)$/);
  if (postIdMatch && method === "GET") {
    return await getPostDetail(Number(postIdMatch[1]));
  }

  const commentMatch = path.match(/^\/api\/posts\/(\d+)\/comments$/);
  if (commentMatch && method === "POST") {
    return await createComment(Number(commentMatch[1]), body);
  }

  if (path === "/api/posts" && method === "POST") {
    return await createPost(body);
  }

  throw new Error("Unsupported API route");
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

// Profile event listeners
els.profileButton.addEventListener("click", async () => {
  if (!state.currentProfile) return;
  els.profileInputName.value = state.currentProfile.name;
  els.profilePreview.hidden = true;
  els.profilePreview.removeAttribute("src");
  els.profileNameAnimation.value = state.currentProfile.nameAnimation || "glow";
  els.profileGlowColor.value = state.currentProfile.glowColor || "#ff00ff";
  document.querySelectorAll(".frame-option").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.frame === (state.currentProfile.frame || "glow"));
  });
  els.profileEditor.showModal();
});

els.closeProfile.addEventListener("click", () => els.profileEditor.close());
els.cancelProfile.addEventListener("click", () => els.profileEditor.close());

document.querySelectorAll(".frame-option").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".frame-option").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    els.profileForm.dataset.frame = btn.dataset.frame;
  });
});

els.profileImageUpload.addEventListener("change", async () => {
  const file = els.profileImageUpload.files?.[0];
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
    showNotification("Image must be PNG, JPEG, WebP, or GIF");
    return;
  }
  if (file.size > 2_000_000) {
    showNotification("Image must be under 2 MB");
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    els.profilePreview.src = reader.result;
    els.profilePreview.hidden = false;
    els.profileForm.dataset.avatarUrl = reader.result;
  });
  reader.readAsDataURL(file);
});

els.profileFromGiphy.addEventListener("click", (e) => {
  e.preventDefault();
  els.giphySearch.showModal();
});

els.closeGiphy.addEventListener("click", () => els.giphySearch.close());

let giphySearchTimer;
els.giphySearchInput.addEventListener("input", () => {
  window.clearTimeout(giphySearchTimer);
  giphySearchTimer = window.setTimeout(() => {
    searchGiphy(els.giphySearchInput.value.trim());
  }, 300);
});

els.profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.profileError.hidden = true;
  const name = els.profileInputName.value.trim();
  if (!name) {
    els.profileError.textContent = "Name is required";
    els.profileError.hidden = false;
    return;
  }

  const avatarUrl = els.profileForm.dataset.avatarUrl || "";
  const frame = els.profileForm.dataset.frame || "glow";
  const nameAnimation = els.profileNameAnimation.value;
  const glowColor = els.profileGlowColor.value;

  try {
    await updateProfile(name, {
      avatar: avatarUrl,
      frame,
      nameAnimation,
      glowColor,
    });
    els.profileEditor.close();
  } catch (err) {
    els.profileError.textContent = err.message;
    els.profileError.hidden = false;
  }
});

renderCategorySelect();

async function syncRemoteData() {
  if (!REMOTE_SYNC_ENABLED) return;

  try {
    await loadPosts();
    if (state.selectedId) {
      const data = await api(`/api/posts/${state.selectedId}`);
      renderPostDetail(data.post, data.comments);
    }
  } catch {
    // keep the current UI state if remote refresh fails
  }
}

if (REMOTE_SYNC_ENABLED) {
  window.addEventListener("focus", syncRemoteData);
  window.setInterval(syncRemoteData, 15000);
}

loadPosts().catch((err) => {
  els.forumSections.innerHTML = "";
  els.postList.innerHTML = "";
  els.emptyState.hidden = false;
  els.emptyState.querySelector("h3").textContent = "Server unavailable";
  els.emptyState.querySelector("p").textContent = err.message;
});

// Load current user's profile on app startup
(async () => {
  const currentUserName = localStorage.getItem("currentUserName");
  if (currentUserName) {
    const profiles = await getProfiles();
    state.currentProfile = profiles[currentUserName];
    renderProfileButton();
  }
})();
