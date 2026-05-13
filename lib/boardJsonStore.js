const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_PATH = path.join(__dirname, "..", "data", "boardData.json");

function ensureDir() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStore() {
  ensureDir();
  if (!fs.existsSync(DATA_PATH)) {
    const initial = { categories: [], posts: [] };
    writeStore(initial);
    return initial;
  }
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.categories)) data.categories = [];
    if (!Array.isArray(data.posts)) data.posts = [];
    return data;
  } catch {
    return { categories: [], posts: [] };
  }
}

function writeStore(data) {
  ensureDir();
  const tmp = DATA_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, DATA_PATH);
}

function newId() {
  return crypto.randomBytes(12).toString("hex");
}

function listCategories() {
  const { categories } = readStore();
  return [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function listPostsNewestFirst() {
  const { posts } = readStore();
  return [...posts].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function findPostById(id) {
  if (!id) return null;
  const { posts } = readStore();
  return posts.find((p) => String(p._id) === String(id)) || null;
}

function findCategoryById(id) {
  if (!id) return null;
  const { categories } = readStore();
  return categories.find((c) => String(c._id) === String(id)) || null;
}

function insertPost(doc) {
  const data = readStore();
  const post = {
    _id: newId(),
    title: doc.title || "(제목 없음)",
    titleEn: doc.titleEn || "",
    content: doc.content || "",
    contentEn: doc.contentEn || "",
    categoryId: doc.categoryId || null,
    images: Array.isArray(doc.images) ? doc.images : [],
    createdAt: new Date().toISOString(),
  };
  data.posts.push(post);
  writeStore(data);
  return post;
}

function updatePost(id, patch) {
  const data = readStore();
  const i = data.posts.findIndex((p) => String(p._id) === String(id));
  if (i === -1) return null;
  const cur = data.posts[i];
  data.posts[i] = {
    ...cur,
    ...patch,
    _id: cur._id,
    updatedAt: new Date().toISOString(),
  };
  writeStore(data);
  return data.posts[i];
}

function deletePost(id) {
  const data = readStore();
  const before = data.posts.length;
  data.posts = data.posts.filter((p) => String(p._id) !== String(id));
  writeStore(data);
  return data.posts.length < before;
}

function insertCategory({ name, nameEn }) {
  const data = readStore();
  const cat = {
    _id: newId(),
    name: name || "새 카테고리",
    nameEn: nameEn || "",
    order: data.categories.length,
    createdAt: new Date().toISOString(),
  };
  data.categories.push(cat);
  writeStore(data);
  return cat;
}

function updateCategory(id, fields) {
  const data = readStore();
  const c = data.categories.find((x) => String(x._id) === String(id));
  if (!c) return null;
  if (fields.name !== undefined) c.name = fields.name;
  if (fields.nameEn !== undefined) c.nameEn = fields.nameEn;
  if (fields.order !== undefined && !Number.isNaN(fields.order)) c.order = fields.order;
  writeStore(data);
  return c;
}

function deleteCategory(id) {
  const data = readStore();
  const sid = String(id);
  data.categories = data.categories.filter((c) => String(c._id) !== sid);
  data.posts.forEach((p) => {
    if (p.categoryId != null && String(p.categoryId) === sid) p.categoryId = null;
  });
  writeStore(data);
  return true;
}

/** 목록 페이지용: 필터·페이지네이션 */
function listPostsForPublic({ categoryId, page, perPage }) {
  const categories = listCategories();
  let posts = listPostsNewestFirst();
  if (categoryId) {
    posts = posts.filter((p) => p.categoryId != null && String(p.categoryId) === String(categoryId));
  }
  const total = posts.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const p = Math.min(Math.max(1, page), totalPages);
  const skip = (p - 1) * perPage;
  const slice = posts.slice(skip, skip + perPage);
  const withCat = slice.map((p) => {
    const cat = categories.find((c) => String(c._id) === String(p.categoryId));
    return {
      ...p,
      _id: String(p._id),
      categoryId: p.categoryId != null ? String(p.categoryId) : null,
      categoryName: cat ? cat.name : "-",
      categoryNameEn: cat ? cat.nameEn || cat.name : "-",
    };
  });
  return { posts: withCat, categories, total, totalPages, page: p };
}

function attachCategoryNames(posts) {
  const categories = listCategories();
  return posts.map((p) => {
    const c = categories.find((x) => String(x._id) === String(p.categoryId));
    return { ...p, _id: String(p._id), categoryName: c ? c.name : "-" };
  });
}

module.exports = {
  listCategories,
  listPostsNewestFirst,
  findPostById,
  insertPost,
  updatePost,
  deletePost,
  insertCategory,
  updateCategory,
  deleteCategory,
  listPostsForPublic,
  attachCategoryNames,
  DATA_PATH,
};
