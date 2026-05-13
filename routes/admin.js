const express = require("express");
const router = express.Router();
const { ObjectId } = require("../lib/bsonCompat");
const boardStore = require("../lib/boardJsonStore");
const multer = require("multer");
const multerLocal = require("../lib/multerLocal");

let db;

const boardMulter = multer({
  storage: multerLocal.diskStorage("board"),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function setDB(database) {
  db = database;
}

let multerImg = multer({
  storage: multerLocal.diskStorage("product"),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// -------------------
// 어드민 GET
// -------------------
// 어드민 로그인 페이지
router.get("/login", (req, res) => {
  res.render("./admin/adminLogin.ejs");
});

// 어드민 메인 (게시판·카테고리 관리만)
router.get("/main", async (req, res) => {
  res.render("./admin/adminMain.ejs");
});


// 어드민 비밀번호 확인
router.post("/api/checkPassword", (req, res) => {
  const password = req.body.password;
  console.log(password);
  if (password == process.env.ADMIN_PASSWORD) {
    res.send({ success: true });
  } else {
    res.send({ success: false });
  }
});

// -------------------
// 어드민 상품 업로드 API
router.post(
  "/api/uploadProduct",
  multerImg.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "subImages", maxCount: 10 },
  ]),
  (req, res) => {
    let bodyData = req.body;
    let filesData = req.files;
    console.log(filesData);
    console.log(bodyData);

    let mainImage = multerLocal.publicUrl("product", filesData.mainImage[0].filename);
    let subImages = filesData.subImages.map((image) => ({
      url: multerLocal.publicUrl("product", image.filename),
      originalname: image.originalname,
    }));

    // 사용자가 지정한 순서 파싱
    let sortOrder = JSON.parse(bodyData.subImageOrder);

    // 정렬 함수
    function sortSubImages(images, order) {
      return order
        .map((filename) =>
          images.find((image) => image.originalname === filename)
        )
        .filter(Boolean)
        .map((image) => image.url);
    }

    // subImages를 정렬
    let sortedSubImages = sortSubImages(subImages, sortOrder);

    const productOptions = bodyData.optionNames.map((name, index) => ({
      optionNum: index + 1,
      optionName: name,
      optionValue: bodyData.optionValues[index],
    }));

    let productData = {
      productName: bodyData.productName,
      productDescription: bodyData.productDescription,
      mainImage: mainImage,
      subImages: sortedSubImages,
      productOptions: productOptions,
      brandName: bodyData.brandName,
      category: bodyData.category,
      category2: bodyData.category2,
      price: parseInt(bodyData.price),
      createdAt: new Date(),
      updatedAt: new Date(),
      bid: [],
      review: [],
      curriculumLink: "",
    };
    console.log(productData);

    db.collection("products").insertOne(productData, (err, result) => {
      if (err) {
        console.error("DB 삽입 오류:", err);
        res.status(500).send("상품을 업로드하는 중 오류가 발생했습니다.");
      } else {
        res.redirect("/admin/productList/all/all/1");
      }
    });
  }
);



// 캐릭터 상세 페이지
router.get("/characterDetail/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const content = await db
      .collection("contents")
      .findOne({ _id: new ObjectId(id) });
    if (!content) return res.send("존재하지 않는 캐릭터입니다");
    res.render("./admin/characterDetail.ejs", { content });
  } catch (err) {
    console.error(err);
    res.send("오류 발생");
  }
});

// 캐릭터 수정
router.post("/api/updateCharacter", async (req, res) => {
  try {
    const { id, formData } = req.body;
    await db
      .collection("contents")
      .updateOne({ _id: new ObjectId(id) }, { $set: { formData } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

// 캐릭터 삭제
router.post("/api/deleteCharacter", async (req, res) => {
  try {
    const { id } = req.body;
    await db.collection("contents").deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

// ========== 게시판 관리 (data/boardData.json) ==========
router.get("/boardList", (req, res) => {
  try {
    const posts = boardStore.attachCategoryNames(boardStore.listPostsNewestFirst());
    const categories = boardStore.listCategories();
    res.render("./admin/adminBoardList.ejs", { posts, categories });
  } catch (err) {
    console.error(err);
    res.render("./admin/adminBoardList.ejs", { posts: [], categories: [] });
  }
});

router.get("/boardWrite", (req, res) => {
  const categories = boardStore.listCategories();
  res.render("./admin/adminBoardWrite.ejs", { post: null, categories });
});

router.get("/boardEdit/:id", (req, res) => {
  try {
    const post = boardStore.findPostById(req.params.id);
    if (!post) return res.redirect("/admin/boardList");
    const categories = boardStore.listCategories();
    res.render("./admin/adminBoardWrite.ejs", {
      post: { ...post, _id: String(post._id), categoryId: post.categoryId != null ? String(post.categoryId) : null },
      categories,
    });
  } catch (err) {
    console.error(err);
    res.redirect("/admin/boardList");
  }
});

router.post(
  "/boardWrite",
  boardMulter.array("images", 20),
  (req, res) => {
    try {
      const { title, titleEn, content, contentEn, categoryId } = req.body;
      const files = req.files || [];
      const imageUrls = multerLocal.mapUploadedUrls(files || [], "board");
      boardStore.insertPost({
        title: title || titleEn || "(제목 없음)",
        titleEn: titleEn || "",
        content: content || "",
        contentEn: contentEn || "",
        categoryId: categoryId ? String(categoryId).trim() || null : null,
        images: imageUrls,
      });
      res.redirect("/admin/boardList");
    } catch (err) {
      console.error(err);
      res.redirect("/admin/boardWrite");
    }
  }
);

router.post(
  "/boardEdit",
  boardMulter.array("images", 20),
  (req, res) => {
    try {
      const { id, title, titleEn, content, contentEn, categoryId } = req.body;
      const post = boardStore.findPostById(id);
      if (!post) return res.redirect("/admin/boardList");
      const files = req.files || [];
      const newUrls = multerLocal.mapUploadedUrls(files || [], "board");
      const images = Array.isArray(post.images) ? [...post.images, ...newUrls] : newUrls;
      const nextCat = categoryId ? String(categoryId).trim() : null;
      boardStore.updatePost(id, {
        title: title !== undefined ? title : post.title,
        titleEn: titleEn !== undefined ? titleEn : post.titleEn || "",
        content: content !== undefined ? content : post.content,
        contentEn: contentEn !== undefined ? contentEn : post.contentEn || "",
        categoryId: nextCat || null,
        images,
      });
      res.redirect("/admin/boardList");
    } catch (err) {
      console.error(err);
      res.redirect("/admin/boardList");
    }
  }
);

router.post("/boardDelete", (req, res) => {
  try {
    if (req.body.id) boardStore.deletePost(req.body.id);
  } catch (err) {
    console.error(err);
  }
  res.redirect("/admin/boardList");
});

// ========== 문의 목록 (Contact 제출분) ==========
router.get("/contactList", async (req, res) => {
  try {
    const contacts = await db.collection("contacts").find({}).sort({ createdAt: -1 }).toArray();
    const list = contacts.map((c) => ({ ...c, _id: c._id.toString(), createdAt: c.createdAt }));
    res.render("./admin/adminContactList.ejs", { contacts: list });
  } catch (err) {
    console.error(err);
    res.render("./admin/adminContactList.ejs", { contacts: [] });
  }
});

router.post("/contactDelete", async (req, res) => {
  try {
    if (req.body.id) await db.collection("contacts").deleteOne({ _id: new ObjectId(req.body.id) });
  } catch (err) {
    console.error(err);
  }
  res.redirect("/admin/contactList");
});

// ========== 카테고리 관리 (data/boardData.json) ==========
router.get("/boardCategories", (req, res) => {
  const categories = boardStore.listCategories();
  res.render("./admin/adminBoardCategories.ejs", { categories });
});

router.post("/api/categoryAdd", (req, res) => {
  try {
    const { name, nameEn } = req.body;
    boardStore.insertCategory({ name, nameEn });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

router.post("/api/categoryUpdate", (req, res) => {
  try {
    const { id, name, nameEn, order } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (nameEn !== undefined) update.nameEn = nameEn;
    if (order !== undefined) update.order = parseInt(order, 10);
    const c = boardStore.updateCategory(id, update);
    res.json({ success: !!c });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

router.post("/api/categoryDelete", (req, res) => {
  try {
    const { id } = req.body;
    boardStore.deleteCategory(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

module.exports = { router, setDB };
