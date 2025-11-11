// ===================================
// Admin Routes - สำหรับ Manual Trigger และ Testing
// ===================================

const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/authMiddleware");
const { checkRole } = require("../middlewares/roleMiddleware");
const { manualTrigger } = require("../utils/autoStatusScheduler");

/**
 * 🧪 Manual Trigger สำหรับทดสอบระบบ Auto-Status
 * POST /api/admin/trigger-auto-status
 * 
 * - เฉพาะ admin เท่านั้นที่เรียกได้
 * - ใช้สำหรับทดสอบหรือรันด้วยตนเองเมื่อต้องการ
 */
router.post(
  "/trigger-auto-status",
  authenticate,
  checkRole(["admin"]),
  async (req, res) => {
    try {
      console.log(`🧪 [Manual Trigger] Triggered by admin: ${req.user.username}`);
      
      // เรียกฟังก์ชันอัปเดต status
      await manualTrigger();
      
      res.json({
        success: true,
        message: "Auto-status update triggered successfully",
        triggeredBy: req.user.username,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Manual trigger error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to trigger auto-status update",
        error: error.message,
      });
    }
  }
);

/**
 * 📊 ดูสถิติการอัปเดตอัตโนมัติ (Optional)
 * GET /api/admin/auto-status-stats
 */
router.get(
  "/auto-status-stats",
  authenticate,
  checkRole(["admin"]),
  async (req, res) => {
    try {
      const { pool } = require("../config/db");
      
      // นับจำนวน bugs แต่ละ status
      const [stats] = await pool.query(`
        SELECT 
          status,
          COUNT(*) as count,
          GROUP_CONCAT(DISTINCT CONCAT('#', id, ': ', title) SEPARATOR ', ') as examples
        FROM Bugs
        GROUP BY status
      `);
      
      // หา bugs ที่ใกล้จะถูกอัปเดตอัตโนมัติ
      const [nearResolve] = await pool.query(`
        SELECT 
          b.id, 
          b.title,
          b.status,
          MAX(c.createdAt) as lastCommentTime,
          TIMESTAMPDIFF(HOUR, MAX(c.createdAt), NOW()) as hoursSinceLastComment
        FROM Bugs b
        LEFT JOIN Comments c ON b.id = c.bugId
        WHERE b.status = 'in_progress'
        GROUP BY b.id
        HAVING hoursSinceLastComment >= 20
        ORDER BY hoursSinceLastComment DESC
      `);
      
      const [nearClose] = await pool.query(`
        SELECT 
          b.id, 
          b.title,
          b.status,
          b.updatedAt as resolvedTime,
          TIMESTAMPDIFF(HOUR, b.updatedAt, NOW()) as hoursSinceResolved
        FROM Bugs b
        WHERE b.status = 'resolved'
        HAVING hoursSinceResolved >= 40
        ORDER BY hoursSinceResolved DESC
      `);
      
      res.json({
        success: true,
        data: {
          statusCounts: stats,
          nearAutoResolve: nearResolve,
          nearAutoClose: nearClose,
        },
      });
    } catch (error) {
      console.error("Get auto-status stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve stats",
        error: error.message,
      });
    }
  }
);

module.exports = router;