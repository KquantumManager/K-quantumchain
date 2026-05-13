const express = require("express");
const router = express.Router();
const boardStore = require("../lib/boardJsonStore");

/** 게시 본문: Quill HTML은 그대로(스크립트·이벤트 속성만 제거), 그 외는 이스케이프 후 줄바꿈 유지 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function looksLikeRichHtml(s) {
  return /<(p|div|ul|ol|h[1-6]|a|img|blockquote|span|br|strong|em|b|i)[\s>/]/i.test(String(s));
}

/** 이스케이프된 본문에서 http(s) URL을 클릭 가능 링크로 (문장 끝 구두점은 링크 밖으로) */
function linkifyEscaped(escaped) {
  return escaped.replace(/https?:\/\/[^\s<]+/g, function (url) {
    var clean = url.replace(/[.,;:!?)'\]]+$/g, "");
    var tail = url.slice(clean.length);
    return (
      '<a href="' +
      clean +
      '" target="_blank" rel="noopener noreferrer">' +
      clean +
      "</a>" +
      tail
    );
  });
}

function formatBoardBody(str) {
  if (str === undefined || str === null || str === "") return "";
  const raw = String(str);
  if (looksLikeRichHtml(raw)) {
    var html = raw
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    html = html.replace(/<a\s+([^>]*?)>/gi, function (full, inner) {
      if (/\btarget\s*=/i.test(inner)) return full;
      return "<a target=\"_blank\" rel=\"noopener noreferrer\" " + inner + ">";
    });
    return html;
  }
  var escaped = escapeHtml(raw).replace(/\r\n|\n|\r/g, "<br />");
  return '<p class="board-plain">' + linkifyEscaped(escaped) + "</p>";
}

// 게시판 목록 (카테고리별)
router.get("/", (req, res) => {
  try {
    const categoryId = req.query.category || "";
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 20;
    const { posts: postsWithCategory, categories, total, totalPages, page: safePage } =
      boardStore.listPostsForPublic({ categoryId: categoryId || null, page, perPage });

    res.render("./board/list.ejs", {
      categories,
      posts: postsWithCategory,
      currentCategory: categoryId,
      page: safePage,
      totalPages,
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("게시판 목록을 불러오는 중 오류가 발생했습니다.");
  }
});

// 게시글 상세
router.get("/post/:id", (req, res) => {
  try {
    const id = req.params.id;
    const post = boardStore.findPostById(id);
    if (!post) return res.status(404).send("글이 없습니다.");

    const categories = boardStore.listCategories();
    const cat = categories.find((c) => String(c._id) === String(post.categoryId));

    const contentEnRaw =
      post.contentEn !== undefined && post.contentEn !== null && String(post.contentEn).trim() !== ""
        ? post.contentEn
        : post.content;

    res.render("./board/detail.ejs", {
      post: {
        ...post,
        _id: String(post._id),
        categoryName: cat ? cat.name : "-",
        categoryNameEn: cat ? cat.nameEn || cat.name : "-",
        contentHtml: formatBoardBody(post.content),
        contentEnHtml: formatBoardBody(contentEnRaw),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("글을 불러오는 중 오류가 발생했습니다.");
  }
});

/** Mongo 연동 제거: board 라우터는 JSON 스토어만 사용 */
function setDB() {}

module.exports = { router, setDB };
