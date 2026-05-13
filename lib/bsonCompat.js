const crypto = require("crypto");

/** MongoDB ObjectId 호환: 24자 hex 문자열 (로컬 JSON DB 전용) */
class ObjectId {
  constructor(id) {
    if (id == null) {
      this._id = crypto.randomBytes(12).toString("hex");
    } else if (id instanceof ObjectId) {
      this._id = id._id;
    } else {
      const s = String(id).toLowerCase();
      if (!ObjectId.isValid(s)) {
        throw new TypeError("Invalid ObjectId: " + id);
      }
      this._id = s;
    }
  }

  toString() {
    return this._id;
  }

  toHexString() {
    return this._id;
  }

  equals(other) {
    return String(this) === String(other);
  }

  toJSON() {
    return this._id;
  }
}

ObjectId.isValid = function (id) {
  return typeof id === "string" && /^[0-9a-f]{24}$/i.test(id);
};

/** insertOne 결과용 (insertedId.toString() 호환) */
function wrapInsertedId(hex) {
  return new ObjectId(hex);
}

module.exports = { ObjectId, wrapInsertedId };
