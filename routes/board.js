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

const URL_IN_TEXT_RE = /https?:\/\/[^\s<]+/g;

function trimUrlTrailingPunctuation(url) {
  var clean = url.replace(/[.,;:!?)'\]]+$/g, "");
  return { clean: clean, tail: url.slice(clean.length) };
}

function hrefFromDisplayUrl(displayUrl) {
  return escapeHtml(String(displayUrl).replace(/&amp;/gi, "&"));
}

/** 텍스트(이스케이프 전/후) 안의 http(s) URL을 <a>로 변환 */
function linkifyUrlsInText(text) {
  return text.replace(URL_IN_TEXT_RE, function (url) {
    var parts = trimUrlTrailingPunctuation(url);
    return (
      '<a href="' +
      hrefFromDisplayUrl(parts.clean) +
      '" target="_blank" rel="noopener noreferrer">' +
      parts.clean +
      "</a>" +
      parts.tail
    );
  });
}

/** 이스케이프된 본문에서 http(s) URL을 클릭 가능 링크로 */
function linkifyEscaped(escaped) {
  return linkifyUrlsInText(escaped);
}

/** Quill 등 HTML 본문: 기존 <a>는 유지하고, 태그 사이 텍스트의 URL만 링크화 */
function linkifyHtmlContent(html) {
  var savedAnchors = [];
  var safe = html.replace(/<a\b[\s\S]*?<\/a>/gi, function (block) {
    var token = "@@BOARD_ANCHOR_" + savedAnchors.length + "@@";
    savedAnchors.push(block);
    return token;
  });
  safe = safe.replace(/>([^<]+)</g, function (match, text) {
    if (!/https?:\/\//i.test(text)) return match;
    return ">" + linkifyUrlsInText(text) + "<";
  });
  savedAnchors.forEach(function (block, i) {
    safe = safe.split("@@BOARD_ANCHOR_" + i + "@@").join(block);
  });
  return safe;
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
      return '<a target="_blank" rel="noopener noreferrer" ' + inner + ">";
    });
    html = linkifyHtmlContent(html);
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
