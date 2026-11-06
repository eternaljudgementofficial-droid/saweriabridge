// ===== Saweria -> Roblox Donation Bridge =====
// Jalankan: npm install ws && node server.js
const WebSocket = require("ws");
const http = require("http");

// ===== KONFIGURASI =====
const STREAM_KEY = "029fe611e683cade112d831313a821f6"; // stream key kamu
const PORT = process.env.PORT || 3000;

// Penyimpanan donasi (in-memory, simpan 500 terakhir)
const donations = [];

// ===== Koneksi websocket Saweria =====
function connectSaweria() {
  const ws = new WebSocket("wss://api.saweria.co/stream", {
    headers: { Authorization: STREAM_KEY },
  });

  ws.on("open", () => console.log("[Bridge] Terhubung ke Saweria"));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const d = msg.data || msg;
      // Normalisasi berbagai kemungkinan nama field Saweria
      const donor =
        d.donor || d.supporter_name || d.username || d.name || "Anonymous";
      const amountRaw =
        d.amount ?? d.amount_kontan ?? d.donation_amount ?? 0;
      const amount = Math.floor(Number(amountRaw) || 0);
      const message = String(d.message ?? d.msg ?? "").slice(0, 200);
      const ts = Number(d.ts ?? d.timestamp ?? Date.now());
      const id = String(d.id ?? d.donation_id ?? `${ts}-${Math.random()}`);

      if (amount > 0) {
        donations.push({ id, ts, donor, amount, message });
        if (donations.length > 500) donations.shift();
        console.log(`[Donasi] ${donor}: Rp ${amount}`);
      }
    } catch (e) {
      console.warn("[Bridge] Pesan tidak terbaca:", e.message);
    }
  });

  ws.on("close", () => {
    console.log("[Bridge] Koneksi putus, reconnect dalam 5 detik...");
    setTimeout(connectSaweria, 5000);
  });
  ws.on("error", (e) => console.warn("[Bridge] WS error:", e.message));
}
connectSaweria();

// ===== REST API untuk Roblox =====
// Format yang dibaca DonationService:
//   GET /api/saweria/donations/{SECRET_KEY}?since={ms}&limit=10
//   -> { ok: true, donations: [ { id, ts, donor, amount, message } ] }
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const match = url.pathname.match(
      /^\/api\/saweria\/donations\/([a-zA-Z0-9]+)$/
    );
    if (!match) {
      res.writeHead(404).end("Not found");
      return;
    }
    if (match[1] !== STREAM_KEY) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const since = Number(url.searchParams.get("since") || 0);
    const limit = Math.min(Number(url.searchParams.get("limit") || 10), 50);
    const list = donations
      .filter((d) => d.ts > since)
      .sort((a, b) => a.ts - b.ts)
      .slice(0, limit);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, donations: list }));
  })
  .listen(PORT, () =>
    console.log(`[Bridge] API siap di port ${PORT}`)
  );
