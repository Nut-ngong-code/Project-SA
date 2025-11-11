// ===================================
// Dashboard & Metadata Controller - (อัปเกรดแล้ว)
// ===================================

const { pool } = require("../config/db");

/**
 * ดึงรายการ statuses ทั้งหมด (ที่ตรงกับ init.sql)
 * GET /api/statuses
 */
const getStatuses = async (req, res) => {
  try {
    const statuses = [
      { value: "open", label: "Open", description: "Bug has been reported" },
      {
        value: "in_progress",
        label: "In Progress",
        description: "Staff is working on it",
      },
      {
        value: "resolved",
        label: "Resolved",
        description: "Bug has been fixed",
      },
      {
        value: "closed",
        label: "Closed",
        description: "Bug is verified and closed",
      },
    ];

    res.json({
      success: true,
      data: statuses,
    });
  } catch (error) {
    console.error("Get statuses error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve statuses",
      error: error.message,
    });
  }
};

/**
 * ดึงรายการ priorities ทั้งหมด (ที่ตรงกับ init.sql)
 * GET /api/priorities
 */
const getPriorities = async (req, res) => {
  try {
    const priorities = [
      { value: "low", label: "Low", color: "#52c41a" },
      { value: "medium", label: "Medium", color: "#faad14" },
      { value: "high", label: "High", color: "#fa8c16" },
      { value: "critical", label: "Critical", color: "#f5222d" },
    ];

    res.json({
      success: true,
      data: priorities,
    });
  } catch (error) {
    console.error("Get priorities error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve priorities",
      error: error.message,
    });
  }
};

/**
 * ดึงรายชื่อผู้ใช้ทั้งหมด (สำหรับการมอบหมายงาน)
 * GET /api/users
 */
const getUsers = async (req, res) => {
  try {
    // 🌟 ใช้ 'Users' และ 'createdAt' (camelCase)
    const [users] = await pool.query(`
      SELECT 
        id, username, email, role, createdAt
      FROM Users
      ORDER BY username ASC
    `);

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve users",
      error: error.message,
    });
  }
};

/**
 * ดึงสถิติของ bugs (สำหรับ dashboard)
 * GET /api/stats
 */
const getStats = async (req, res) => {
  try {
    // 🌟 ใช้ 'Bugs' และ 'assigneeId' (camelCase)

    // นับจำนวน bugs ตาม status
    const [statusStats] = await pool.query(`
      SELECT 
        status, 
        COUNT(*) as count
      FROM Bugs
      GROUP BY status
    `);

    // นับจำนวน bugs ตาม priority
    const [priorityStats] = await pool.query(`
      SELECT 
        priority, 
        COUNT(*) as count
      FROM Bugs
      GROUP BY priority
    `);

    // นับจำนวน bugs ทั้งหมด
    const [totalBugs] = await pool.query("SELECT COUNT(*) as total FROM Bugs");

    // นับจำนวน bugs ที่ยังไม่ได้มอบหมาย
    const [unassignedBugs] = await pool.query(
      "SELECT COUNT(*) as count FROM Bugs WHERE assigneeId IS NULL"
    );

    res.json({
      success: true,
      data: {
        total: totalBugs[0].total,
        unassigned: unassignedBugs[0].count,
        byStatus: statusStats,
        byPriority: priorityStats,
      },
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve statistics",
      error: error.message,
    });
  }
};

module.exports = {
  getStatuses,
  getPriorities,
  getUsers,
  getStats,
};
