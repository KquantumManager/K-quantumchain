//_____________________________________________________
//        kquantum 1.0.0
//_____________________________________________________
const express = require("express");
const app = express();
const path = require("path");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
var cors = require("cors");
app.use(cors());
var crypto = require("crypto");
const bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
const http = require("http").createServer(app);
const { Server } = require("socket.io");
const { count, log, time, Console } = require("console");
const io = new Server(http);

var request = require("request");
const axios = require("axios");

const { SolapiMessageService } = require("solapi");
const messageService = new SolapiMessageService(
  process.env.SOLAPI_API_KEY,
  process.env.SOLAPI_API_SECRET
);

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
require("dotenv").config();
const schedule = require("node-schedule");
const nodemailer = require("nodemailer");
const fs = require("fs");

const { getDb } = require("./lib/localJsonDb");
const { ObjectId } = require("./lib/bsonCompat");
const db = getDb();

const adminRoutes = require("./routes/admin");
const boardRoutes = require("./routes/board");

adminRoutes.setDB(db);
boardRoutes.setDB(db);

app.use("/admin", adminRoutes.router);
app.use("/board", boardRoutes.router);

// -------------------------------------------------------
//        업로드 (로컬 디스크 public/uploads)
// -------------------------------------------------------
const multer = require("multer");
const multerLocal = require("./lib/multerLocal");

const chatUpload = multer({
  storage: multerLocal.diskStorage("chat"),
  limits: { fileSize: 15 * 1024 * 1024 },
});
const apiKey = process.env.OPENAI_API_KEY;
const CREDIT_PER_TOKEN = 2 / 3;
const IMAGE_TOKENS = 250;

async function deductCredits(uid, tokens) {
  if (!uid) return 0;
  try {
    // 토큰당 크레딧 비용 계산 (올림 처리로 소수점 방지)
    const creditCost = Math.ceil(tokens * CREDIT_PER_TOKEN);
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(uid) });
    if (!user) return 0;
    const current = user.credits || 0;
    if (current < creditCost) {
      return null; // 크레딧 부족
    }
    // 올림 처리된 금액을 차감하여 남은 크레딧 계산
    const updated = current - creditCost;
    await db
      .collection("users")
      .updateOne({ _id: new ObjectId(uid) }, { $set: { credits: updated } });
    return updated;
  } catch (err) {
    console.error("credit update error", err);
    return 0;
  }
}

// 문의 접수 API (DB 저장, 이메일 노출 없음)
app.post("/api/contact", async (req, res) => {
  try {
    const { name, phone, email, message } = req.body || {};
    if (!name || !phone || !email || !message) {
      return res.status(400).json({ success: false, message: "이름, 연락처, 이메일, 문의 내용을 모두 입력해 주세요." });
    }
    await db.collection("contacts").insertOne({
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: String(email).trim(),
      message: String(message).trim(),
      createdAt: new Date(),
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("contact submit error", err);
    return res.status(500).json({ success: false, message: "접수 중 오류가 발생했습니다." });
  }
});

//메인 - 공개 캐릭터 목록 표시
app.get("/", async (req, res) => {
  try {
    const list = await db
      .collection("contents")
      .find({ isPublic: true })
      .project({
        "formData.productName": 1,
        "formData.productDescription": 1,
        images: { $slice: 1 },
      })
      .sort({ createdAt: -1 })
      .toArray();
    
    // 요금제 설정 불러오기
    const planSettings = await db
      .collection("planSettings")
      .findOne({ type: "subscription" });
    
    const settings = planSettings && planSettings.settings ? planSettings.settings : null;

    const desktopBanners = await db
      .collection("mainBanners")
      .find({ type: "desktop" })
      .sort({ order: 1, createdAt: 1 })
      .toArray();

    const mobileBanners = await db
      .collection("mainBanners")
      .find({ type: "mobile" })
      .sort({ order: 1, createdAt: 1 })
      .toArray();
    
    res.render("./main/main.ejs", {
      list: list,
      planSettings: settings,
      desktopBanners,
      mobileBanners,
    });
  } catch (err) {
    console.error(err);
    res.render("./main/main.ejs", {
      list: [], 
      desktopBanners: [],
      mobileBanners: [],
    });
  }
});

http.listen(process.env.PORT || 3000, function () {
  console.log("listening on " + (process.env.PORT || 3000));
});
http.setTimeout(300000);
