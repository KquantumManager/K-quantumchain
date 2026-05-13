"use strict";

const fs = require("fs");
const path = require("path");
const { ObjectId, wrapInsertedId } = require("./bsonCompat");

const DATA_FILE = path.join(__dirname, "..", "data", "appData.json");

/** planSettings 만 문서 배열(요금제 설정 등) */
const ARRAY_COLLECTIONS = [
  "users",
  "contents",
  "products",
  "orders",
  "chats",
  "agentChats",
  "agents",
  "contacts",
  "planSettings",
  "mainBanners",
  "creditCharges",
  "generatedImages",
  "smsSettings",
  "callSettings",
  "smsAutoreplySettings",
  "addressBook",
];

function defaultData() {
  const o = {};
  ARRAY_COLLECTIONS.forEach((c) => {
    o[c] = [];
  });
  o.planSettings = [
    {
      _id: "plansetting_subscription_default",
      type: "subscription",
      settings: {
        plans: [],
        note: "요금제: data/appData.json → planSettings 수정",
      },
    },
  ];
  return o;
}

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

function serializeDates(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializeDates);
  if (typeof obj === "object" && obj.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = serializeDates(v);
    }
    return out;
  }
  return obj;
}

function readData() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const d = defaultData();
    writeData(d);
    return d;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(raw);
    ARRAY_COLLECTIONS.forEach((c) => {
      if (!Array.isArray(data[c])) data[c] = [];
    });
    return data;
  } catch {
    return defaultData();
  }
}

function writeData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(serializeDates(data), null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

let mem = null;

function loadMem() {
  mem = readData();
}

function saveMem() {
  writeData(mem);
}

function getVal(v) {
  if (v instanceof ObjectId) return v.toString();
  return v;
}

function matchDoc(doc, query) {
  if (!query || typeof query !== "object") return true;
  for (const [key, expected] of Object.entries(query)) {
    if (key === "_id" && expected && typeof expected === "object" && Array.isArray(expected.$in)) {
      const set = new Set(expected.$in.map((x) => String(getVal(x))));
      if (!set.has(String(doc._id))) return false;
    } else if (key === "_id") {
      if (String(doc._id) !== String(getVal(expected))) return false;
    } else {
      const dv = doc[key];
      if (dv === undefined && expected !== undefined) return false;
      if (String(dv) !== String(expected)) return false;
    }
  }
  return true;
}

function applySet(doc, setObj) {
  if (!setObj) return;
  for (const [k, v] of Object.entries(setObj)) {
    doc[k] = v instanceof Date ? v.toISOString() : v;
  }
}

function applyAddToSet(doc, addObj) {
  if (!addObj) return;
  for (const [k, spec] of Object.entries(addObj)) {
    if (spec && typeof spec === "object" && Array.isArray(spec.$each)) {
      const arr = Array.isArray(doc[k]) ? [...doc[k]] : [];
      const s = new Set(arr.map(String));
      for (const item of spec.$each) s.add(String(item));
      doc[k] = Array.from(s);
    } else {
      const arr = Array.isArray(doc[k]) ? doc[k] : [];
      if (!arr.map(String).includes(String(spec))) arr.push(spec);
      doc[k] = arr;
    }
  }
}

function getNested(obj, dotPath) {
  const parts = dotPath.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setNested(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function projectDocument(doc, spec) {
  if (!spec) return deepClone(doc);
  const out = { _id: doc._id };
  for (const [k, v] of Object.entries(spec)) {
    if (k === "_id") continue;
    if (v === 1) {
      const val = getNested(doc, k);
      if (val !== undefined) setNested(out, k, deepClone(val));
    }
    if (k === "images" && v && typeof v === "object" && Array.isArray(doc.images) && v.$slice != null) {
      out.images = doc.images.slice(0, v.$slice);
    }
  }
  return out;
}

function cmpField(va, vb) {
  if (va == null && vb == null) return 0;
  if (va == null) return -1;
  if (vb == null) return 1;
  if (typeof va === "number" && typeof vb === "number") return va - vb;
  const na = Number(va);
  const nb = Number(vb);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(va) === String(na) && String(vb) === String(nb)) {
    return na - nb;
  }
  const da = Date.parse(va);
  const db = Date.parse(vb);
  if (!Number.isNaN(da) && !Number.isNaN(db)) return da - db;
  return String(va).localeCompare(String(vb));
}

class LocalCursor {
  constructor(collName, query, getArr) {
    this.collName = collName;
    this.query = query;
    this.getArr = getArr;
    this.sortSpec = null;
    this.skipN = 0;
    this.limitN = null;
    this.proj = null;
  }

  sort(spec) {
    this.sortSpec = spec;
    return this;
  }

  skip(n) {
    this.skipN = n;
    return this;
  }

  limit(n) {
    this.limitN = n;
    return this;
  }

  project(spec) {
    this.proj = spec;
    return this;
  }

  toArray(callback) {
    const run = () => {
      const arr = this.getArr(this.collName);
      let list = arr.filter((d) => matchDoc(d, this.query));
      if (this.sortSpec) {
        const entries = Object.entries(this.sortSpec);
        list.sort((a, b) => {
          for (const [field, dir] of entries) {
            const cmp = cmpField(a[field], b[field]);
            if (cmp !== 0) return dir === -1 ? -cmp : cmp;
          }
          return 0;
        });
      }
      list = list.slice(this.skipN);
      if (this.limitN != null) list = list.slice(0, this.limitN);
      if (this.proj) list = list.map((d) => projectDocument(d, this.proj));
      return list;
    };

    if (typeof callback === "function") {
      try {
        callback(null, run());
      } catch (e) {
        callback(e);
      }
      return;
    }
    return Promise.resolve(run());
  }
}

class LocalCollection {
  constructor(name, getData) {
    this.name = name;
    this.getData = getData;
  }

  _arr() {
    const d = this.getData();
    if (!Array.isArray(d[this.name])) d[this.name] = [];
    return d[this.name];
  }

  findOne(query, callback) {
    const run = () => this._arr().find((doc) => matchDoc(doc, query)) || null;
    if (typeof callback === "function") {
      try {
        callback(null, run());
      } catch (e) {
        callback(e);
      }
      return;
    }
    return Promise.resolve(run());
  }

  find(query) {
    return new LocalCursor(this.name, query || {}, (n) => this.getData()[n]);
  }

  insertOne(doc, callback) {
    const run = () => {
      const d = deepClone(doc);
      if (!d._id) d._id = new ObjectId().toString();
      else d._id = String(getVal(d._id)).toLowerCase();
      const serialized = serializeDates(d);
      this._arr().push(serialized);
      saveMem();
      return { insertedId: wrapInsertedId(serialized._id), acknowledged: true };
    };

    if (typeof callback === "function") {
      try {
        callback(null, run());
      } catch (e) {
        callback(e);
      }
      return;
    }
    return Promise.resolve(run());
  }

  updateOne(filter, update, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    options = options || {};

    const run = () => {
      const arr = this._arr();
      const idx = arr.findIndex((d) => matchDoc(d, filter));

      if (idx === -1) {
        if (options.upsert) {
          const nu = deepClone(filter);
          for (const k of Object.keys(nu)) {
            if (nu[k] === undefined) delete nu[k];
          }
          if (update.$set) applySet(nu, update.$set);
          if (update.$addToSet) applyAddToSet(nu, update.$addToSet);
          if (!nu._id) nu._id = new ObjectId().toString();
          nu._id = String(nu._id).toLowerCase();
          arr.push(serializeDates(nu));
          saveMem();
          return { modifiedCount: 1, matchedCount: 0, upsertedCount: 1 };
        }
        return { modifiedCount: 0, matchedCount: 0 };
      }

      const doc = arr[idx];
      if (update.$set) applySet(doc, update.$set);
      if (update.$addToSet) applyAddToSet(doc, update.$addToSet);
      saveMem();
      return { modifiedCount: 1, matchedCount: 1 };
    };

    if (typeof callback === "function") {
      try {
        callback(null, run());
      } catch (e) {
        callback(e);
      }
      return;
    }
    return Promise.resolve(run());
  }

  deleteOne(filter, callback) {
    const run = () => {
      const arr = this._arr();
      const idx = arr.findIndex((d) => matchDoc(d, filter));
      if (idx === -1) return { deletedCount: 0 };
      arr.splice(idx, 1);
      saveMem();
      return { deletedCount: 1 };
    };
    if (typeof callback === "function") {
      try {
        callback(null, run());
      } catch (e) {
        callback(e);
      }
      return;
    }
    return Promise.resolve(run());
  }

  countDocuments(query) {
    return Promise.resolve(this._arr().filter((d) => matchDoc(d, query || {})).length);
  }
}

let singleton;

function createDb() {
  loadMem();
  const getData = () => mem;

  return {
    collection(name) {
      return new LocalCollection(name, getData);
    },
  };
}

function getDb() {
  if (!singleton) singleton = createDb();
  return singleton;
}

module.exports = { getDb, DATA_FILE, ARRAY_COLLECTIONS };
