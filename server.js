// ===================================
// IT TICKET SUPPORT API SERVER
// ===================================

const express = require("express");
const cors = require("cors");
require("dotenv").config(); // .env อยู่ในโฟลเดอร์ api/ นี้แล้ว

// เพิ่มการนำเข้า autoStatusScheduler เพื่อเริ่มต้นการทำงาน จับเวลาในการ อัพเดต Status อัตโนมัติ 
const { startAutoStatusScheduler } = require("./utils/autoStatusScheduler");

// --- 1. แก้ไข Path ที่นี่ ---
const { testConnection } = require("./config/db"); // (จาก ../database/config/db)
const routes = require("./routes"); // (จาก ./routes)

const app = express();
const PORT = process.env.PORT || 3000;

// ===================================
// Middleware
// ===================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  if (req.path !== "/") {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  }
  next();
});

// ===================================
// Routes
// ===================================

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "IT Ticket Support API is running (Host Mode)",
    // ... (ส่วนที่เหลือเหมือนเดิม) ...
  });
});

// API routes
app.use("/api", routes);

// ===================================
// Error Handling
// ===================================

// 404 Not Found
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    path: req.path,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// ===================================
// Start Server
// ===================================

const startServer = async () => {
  try {
    // --- 2. แก้ไข Path ที่นี่ ---
    await testConnection();

    // เริ่ม server
    app.listen(PORT, () => {
      console.log("=".repeat(50));
      console.log("🚀 IT Ticket Support API Server Started (Host Mode)");
      console.log("=".repeat(50));
      console.log(`📍 Server running on: http://localhost:${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
      // ... (Log ที่เหลือเหมือนเดิม) ...
      // 🌟 เริ่มต้น Scheduler
      startAutoStatusScheduler();
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// ... (Shutdown handlers เหมือนเดิม) ...

startServer();

