const express = require("express");
const router = express.Router();

// Controllers
const {
  register,
  login,
  getCurrentUser,
} = require("../controllers/authController");

const {
  getAllBugs,
  getBugById,
  createBug,
  updateBug,
  patchBug,
  deleteBug,
} = require("../controllers/bugController");

const {
  getCommentsByBugId,
  createComment,
  deleteComment,
} = require("../controllers/commentController");

const {
  getStatuses,
  getPriorities,
  getUsers,
  getStats,
} = require("../controllers/dashboardController");

// Middleware
const { verifyToken } = require("../middlewares/authMiddleware");
const { checkPermission, checkAnyPermission, checkRole } = require("../middlewares/roleMiddleware");

// 🌟 Import Utils
const { manualTrigger } = require("../utils/autoStatusScheduler");

// ===================================
// Routes
// ===================================

// --- Auth Routes ---
router.post("/auth/register", register);
router.post("/auth/login", login);
router.get("/auth/me", verifyToken, getCurrentUser);

// --- Bug Routes ---
router.get("/bugs",
  verifyToken,
  checkAnyPermission(["bug:read:own", "bug:read:assigned", "bug:read:all"]),
  getAllBugs
);
router.post("/bugs",
  verifyToken,
  checkPermission("bug:create"),
  createBug
);
router.get("/bugs/:bugId",
  verifyToken,
  checkAnyPermission(["bug:read:own", "bug:read:assigned", "bug:read:all"]),
  getBugById
);
router.put("/bugs/:bugId",
  verifyToken,
  checkAnyPermission(["bug:update:own", "bug:update:all"]),
  updateBug
);
router.patch("/bugs/:bugId",
  verifyToken,
  checkAnyPermission(["bug:update:own", "bug:update:status", "bug:update:all"]),
  patchBug
);
router.delete("/bugs/:bugId",
  verifyToken,
  checkPermission("bug:delete"),
  deleteBug
);

// --- Comment Routes ---
router.get(
  "/bugs/:bugId/comments",
  verifyToken,
  checkAnyPermission(["bug:read:own", "bug:read:assigned", "bug:read:all"]),
  getCommentsByBugId
);
router.post(
  "/bugs/:bugId/comments",
  verifyToken,
  checkPermission("comment:create"),
  createComment
);
router.delete(
  "/comments/:commentId",
  verifyToken,
  checkAnyPermission(["comment:delete:own", "comment:delete:all"]),
  deleteComment
);

// --- Metadata & Stats Routes ---
router.get(
  "/statuses",
  verifyToken,
  checkPermission("meta:read"),
  getStatuses
);

router.get(
  "/priorities",
  verifyToken,
  checkPermission("meta:read"),
  getPriorities
);

router.get(
  "/users",
  verifyToken,
  checkPermission("user:read:all"),
  getUsers
);

router.get(
  "/stats",
  verifyToken,
  checkPermission("stats:read"),
  getStats
);

// ===================================
// 🧪 Admin Testing Routes
// ===================================

/**
 * 🧪 Manual Trigger สำหรับทดสอบระบบ Auto-Status
 * POST /api/admin/trigger-auto-status
 * 
 * Body (Optional):
 * {
 *   "testMode": true,
 *   "resolvedHours": 0.0167,  // 1 นาที (สำหรับทดสอบ)
 *   "closedHours": 0.0334     // 2 นาที (สำหรับทดสอบ)
 * }
 */
// router.post(
//   "/admin/trigger-auto-status",
//   verifyToken,
//   checkRole(["admin"]),
//   async (req, res) => {
//     try {
//       console.log(`🧪 [Manual Trigger] Triggered by admin: ${req.user.username}`);
      
//       const { testMode, resolvedHours, closedHours } = req.body;
      
//       let customHours = null;
//       if (testMode) {
//         customHours = {
//           resolved: resolvedHours || 0.0167,  // Default: 1 นาที
//           closed: closedHours || 0.0334,      // Default: 2 นาที
//         };
//         console.log(`🧪 [Test Mode] Using custom hours:`, customHours);
//       }
      
//       // เรียกฟังก์ชันอัปเดต status
//       const summary = await manualTrigger(customHours);
      
//       res.json({
//         success: true,
//         message: "Auto-status update triggered successfully",
//         triggeredBy: req.user.username,
//         timestamp: new Date().toISOString(),
//         testMode: testMode || false,
//         summary,
//       });
//     } catch (error) {
//       console.error("Manual trigger error:", error);
//       res.status(500).json({
//         success: false,
//         message: "Failed to trigger auto-status update",
//         error: error.message,
//       });
//     }
//   }
// );

/**
 * 📊 ดูสถิติการอัปเดตอัตโนมัติ
 * GET /api/admin/auto-status-stats
 */
// router.get(
//   "/admin/auto-status-stats",
//   verifyToken,
//   checkRole(["admin"]),
//   async (req, res) => {
//     try {
//       const { pool } = require("../config/db");
      
//       // นับจำนวน bugs แต่ละ status
//       const [stats] = await pool.query(`
//         SELECT 
//           status,
//           COUNT(*) as count
//         FROM Bugs
//         GROUP BY status
//       `);
      
//       // หา bugs ที่ใกล้จะถูกอัปเดตอัตโนมัติ (24 ชม.)
//       const now = new Date();
//       const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
//       const [nearResolve] = await pool.query(`
//         SELECT 
//           b.id, 
//           b.title,
//           b.status,
//           b.updatedAt,
//           TIMESTAMPDIFF(HOUR, b.updatedAt, NOW()) as hoursSinceUpdate
//         FROM Bugs b
//         WHERE b.status IN ('open', 'in_progress')
//           AND b.updatedAt < ?
//         ORDER BY b.updatedAt ASC
//         LIMIT 10
//       `, [twentyFourHoursAgo]);
      
//       // หา bugs ที่ใกล้จะถูกปิด (48 ชม.)
//       const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      
//       const [nearClose] = await pool.query(`
//         SELECT 
//           b.id, 
//           b.title,
//           b.status,
//           b.updatedAt,
//           TIMESTAMPDIFF(HOUR, b.updatedAt, NOW()) as hoursSinceResolved
//         FROM Bugs b
//         WHERE b.status = 'resolved'
//           AND b.updatedAt < ?
//         ORDER BY b.updatedAt ASC
//         LIMIT 10
//       `, [fortyEightHoursAgo]);
      
//       res.json({
//         success: true,
//         data: {
//           statusCounts: stats,
//           nearAutoResolve: nearResolve,
//           nearAutoClose: nearClose,
//         },
//       });
//     } catch (error) {
//       console.error("Get auto-status stats error:", error);
//       res.status(500).json({
//         success: false,
//         message: "Failed to retrieve stats",
//         error: error.message,
//       });
//     }
//   }
// );

module.exports = router;