// backend/db/jsonDb.js – MongoDB‑only persistence (sync‑style API)
import { MongoClient, ObjectId } from "mongodb";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "zero_hunger_connect";

let mongoClient = null;
let mongoDb = null;
let state = null; // in‑memory cache mirroring collections

/** Connect to MongoDB (singleton) */
async function connectMongo() {
  if (!MONGO_URI) {
    throw new Error("MONGODB_URI not set in environment");
  }
  if (mongoDb) return mongoDb;
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  mongoDb = mongoClient.db(MONGO_DB_NAME);
  console.log(`✅ MongoDB connected: ${MONGO_DB_NAME}`);
  return mongoDb;
}

/** Load all collections into the in‑memory cache */
async function loadState() {
  const db = await connectMongo();
  const collections = [
    "users",
    "admins",
    "foodListings",
    "requests",
    "matches",
    "matchHistory",
    "notifications",
    "districtAnalytics",
    "analytics"
  ];
  const snapshot = {};
  for (const col of collections) {
    const docs = await db.collection(col).find({}).toArray();
    // Convert ObjectId fields to string for consistency with existing code
    snapshot[col] = docs.map(d => ({ ...d, _id: d._id?.toString() }));
  }
  state = snapshot;
}

/** Persist the current in‑memory state back to MongoDB (async fire‑and‑forget) */
let persistQueued = false;
function queuePersist() {
  if (persistQueued) return;
  persistQueued = true;
  setImmediate(async () => {
    try {
      const db = await connectMongo();
      const collections = Object.keys(state);
      for (const col of collections) {
        const collection = db.collection(col);
        await collection.deleteMany({});
        const docs = state[col];
        if (docs && docs.length) {
          // Ensure _id is an ObjectId when writing back
          const toInsert = docs.map(d => {
            const copy = { ...d };
            if (copy._id && typeof copy._id === "string") {
              copy._id = new ObjectId(copy._id);
            }
            return copy;
          });
          await collection.insertMany(toInsert);
        }
      }
    } catch (e) {
      console.warn("MongoDB persist failed:", e.message);
    } finally {
      persistQueued = false;
    }
  });
}

/** Ensure the in‑memory cache exists (lazy load) */
function ensureState() {
  if (!state) {
    // Synchronous fallback – loadState is async, but routes expect sync.
    // In practice the server calls db.initialize() at startup, so state will be ready.
    throw new Error("Database not initialized. Call db.initialize() before using db methods.");
  }
  return state;
}

export const db = {
  /** Initialise the DB layer – must be awaited at server start */
  async initialize() {
    await loadState();
    return state;
  },

  // Simple synchronous read of the whole cached state (rarely used)
  read() {
    return ensureState();
  },

  // Write replaces the whole cache and persists to MongoDB
  write(data) {
    state = data;
    queuePersist();
    return state;
  },

  findOne(collection, predicate) {
    const col = ensureState()[collection] || [];
    return col.find(predicate) || null;
  },

  findMany(collection, predicate = () => true) {
    const col = ensureState()[collection] || [];
    return col.filter(predicate);
  },

  insert(collection, doc) {
    const col = ensureState()[collection] || [];
    const newDoc = { ...doc, _id: doc._id ?? `fl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` };
    col.push(newDoc);
    state[collection] = col;
    queuePersist();
    return newDoc;
  },

  updateOne(collection, predicate, updater) {
    const col = ensureState()[collection] || [];
    const idx = col.findIndex(predicate);
    if (idx === -1) return null;
    const updated = { ...col[idx], ...updater(col[idx]) };
    col[idx] = updated;
    state[collection] = col;
    queuePersist();
    return updated;
  },

  updateMany(collection, predicate, updater) {
    const col = ensureState()[collection] || [];
    let count = 0;
    const updated = col.map(item => {
      if (predicate(item)) {
        count++;
        return { ...item, ...updater(item) };
      }
      return item;
    });
    state[collection] = updated;
    queuePersist();
    return count;
  },

  deleteOne(collection, predicate) {
    const col = ensureState()[collection] || [];
    const before = col.length;
    const filtered = col.filter(item => !predicate(item));
    if (filtered.length === before) return false;
    state[collection] = filtered;
    queuePersist();
    return true;
  },

  archiveMatch(matchId) {
    const matches = ensureState()["matches"] || [];
    const idx = matches.findIndex(m => m._id === matchId);
    if (idx === -1) return false;
    const match = matches.splice(idx, 1)[0];
    const history = ensureState()["matchHistory"] || [];
    history.push({ ...match, archivedAt: Date.now() });
    state["matches"] = matches;
    state["matchHistory"] = history;
    queuePersist();
    return true;
  },

  incrementAnalytic(field, amount = 1) {
    const analytics = ensureState()["analytics"] || {};
    analytics[field] = (analytics[field] || 0) + amount;
    state["analytics"] = analytics;
    queuePersist();
    return analytics;
  },

  getAnalytics() {
    return ensureState()["analytics"] || {};
  },

  updateDistrictAnalytics(district, updater) {
    const districts = ensureState()["districtAnalytics"] || {};
    const current = districts[district] || {};
    const updated = { ...current, ...updater(current) };
    districts[district] = updated;
    state["districtAnalytics"] = districts;
    queuePersist();
    return updated;
  },

  getDistrictAnalytics(district) {
    const districts = ensureState()["districtAnalytics"] || {};
    return districts[district] || null;
  }
};

export default db;
