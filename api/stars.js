// Shared "star to rank" counts for the Eve Events Radar.
// Backed by Vercel KV (Upstash Redis). Counts live in one hash keyed by the
// stable event id from events.json, so they survive a data refresh.
//
//   GET  /api/stars            -> { counts: { [id]: n } }
//   POST /api/stars {id,delta}  -> { id, count }   (delta is clamped to ±1)
//
// If KV isn't configured (e.g. local dev), GET returns empty counts and POST
// is a no-op echo — the client falls back to localStorage so the page still works.

import { kv } from "@vercel/kv";

const HASH = "eve:stars";
const kvReady = () => Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    if (!kvReady()) return res.status(200).json({ counts: {}, kv: false });
    try {
      const all = (await kv.hgetall(HASH)) || {};
      const counts = {};
      for (const [k, v] of Object.entries(all)) counts[k] = Number(v) || 0;
      return res.status(200).json({ counts, kv: true });
    } catch (e) {
      return res.status(200).json({ counts: {}, kv: false, error: String(e) });
    }
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
    const id = typeof body.id === "string" ? body.id.slice(0, 120) : "";
    const delta = body.delta < 0 ? -1 : 1; // one vote per click; sign only
    if (!id || !/^[a-z0-9-]+$/.test(id)) return res.status(400).json({ error: "invalid id" });
    if (!kvReady()) return res.status(200).json({ id, count: null, kv: false });
    try {
      let count = await kv.hincrby(HASH, id, delta);
      if (count < 0) { count = 0; await kv.hset(HASH, { [id]: 0 }); } // never negative
      return res.status(200).json({ id, count, kv: true });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
