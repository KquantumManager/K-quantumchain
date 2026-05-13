const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

function ensureUploadDir(subdir) {
  const dest = path.join(__dirname, "..", "public", "uploads", subdir);
  fs.mkdirSync(dest, { recursive: true });
  return dest;
}

/** 디스크 저장 후 공개 URL은 /uploads/{subdir}/{filename} */
function diskStorage(subdir) {
  const dest = ensureUploadDir(subdir);
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dest),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "") || ".bin";
      cb(null, Date.now().toString() + "_" + crypto.randomBytes(6).toString("hex") + ext);
    },
  });
}

function publicUrl(subdir, filename) {
  return "/uploads/" + subdir + "/" + filename;
}

/** boardMulterS3 등 대체: files[].filename → URL */
function mapUploadedUrls(files, subdir) {
  if (!files || !files.length) return [];
  return files.map((f) => publicUrl(subdir, f.filename));
}

module.exports = { diskStorage, publicUrl, mapUploadedUrls, ensureUploadDir };
