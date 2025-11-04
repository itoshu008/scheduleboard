// server/mock-server.js
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 8000;
const HOST = "127.0.0.1"; // ★ IPv4 に固定

// 静的配信: ../suke/dist を優先
const STATIC_ROOT = fs.existsSync(path.join(__dirname, "..", "suke", "dist", "index.html"))
  ? path.join(__dirname, "..", "suke", "dist")
  : path.join(__dirname, "suke", "dist");

app.use(express.json());
app.use(express.static(STATIC_ROOT));

// 完全モックAPI（DBアクセスなし）
const departments = [{ id: 1, name: "撮影部" }, { id: 2, name: "編集部" }];
const employees   = [
  { id: 1, name: "田中", departmentId: 1, color: "#3498db" },
  { id: 2, name: "佐藤", departmentId: 2, color: "#e74c3c" },
];
const equipment   = [{ id: 1, name: "Aスタジオ" }, { id: 2, name: "ライティングB" }];
const schedules   = [];

app.get("/api/health", (_req,res)=>res.json({ ok:true, ts: Date.now(), mode:"MOCK_STANDALONE" }));
app.get("/api/departments", (_req,res)=>res.json(departments));
app.get("/api/employees",   (_req,res)=>res.json(employees));
app.get("/api/equipment",   (_req,res)=>res.json(equipment));
app.get("/api/schedules",   (_req,res)=>res.json(schedules));
app.get("/api/schedules/daily-all", (_req,res)=>res.json([]));
app.get("/api/equipment-reservations", (_req,res)=>res.json([]));

// SPA fallback
app.get("*", (_req,res)=>res.sendFile(path.join(STATIC_ROOT, "index.html")));

// ★ 起動を明示＆エラーハンドラ
const server = app.listen(PORT, HOST, () => {
  const addr = server.address();
  console.log(`[mock] listening on http://${addr.address}:${addr.port} (no DB)`);
});
server.on("error", (err) => {
  console.error("[mock] server error:", err);
});
