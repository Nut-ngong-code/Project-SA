// ===================================
// Comment Controller - (ปรับปรุงตามเงื่อนไขใหม่ + Reset Timer)
// ===================================

const { pool } = require("../config/db");

/**
 * ดึงความคิดเห็นทั้งหมดของ bug
 * GET /api/bugs/:bugId/comments
 * 
 * 🌟 Admin สามารถดูความคิดเห็นได้ทั้งหมด
 */
const getCommentsByBugId = async (req, res) => {
  try {
    const { bugId } = req.params;
    const userRole = req.user.role;
    const userId = req.user.id;

    // ตรวจสอบว่า bug มีอยู่จริง
    const [bugs] = await pool.query("SELECT * FROM Bugs WHERE id = ?", [bugId]);

    if (bugs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Bug not found",
      });
    }

    const bug = bugs[0];

    // 🌟 ตรวจสอบสิทธิ์การเข้าถึง
    // - Admin: ดูได้ทั้งหมด
    // - User: ดูได้เฉพาะของตัวเอง
    // - Staff: ดูได้เฉพาะที่รับผิดชอบ
    if (userRole === 'user' && bug.reporterId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: You can only view comments on your own bugs",
      });
    }

    if (userRole === 'staff' && bug.assigneeId !== userId && bug.assigneeId !== null) {
      return res.status(403).json({
        success: false,
        message: "Access denied: You can only view comments on bugs assigned to you",
      });
    }

    // ดึง comments
    const [comments] = await pool.query(
      `
      SELECT 
        c.id, c.content, c.createdAt,
        u.id as userId, u.username, u.role
      FROM Comments c
      LEFT JOIN Users u ON c.userId = u.id
      WHERE c.bugId = ?
      ORDER BY c.createdAt ASC
    `,
      [bugId]
    );

    res.json({
      success: true,
      data: comments,
    });
  } catch (error) {
    console.error("Get comments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve comments",
      error: error.message,
    });
  }
};

/**
 * สร้าง comment ใหม่
 * POST /api/bugs/:bugId/comments
 * 
 * 🌟 เงื่อนไขใหม่:
 * - เมื่อ staff comment → status เปลี่ยนเป็น 'in_progress' อัตโนมัติ
 * - ถ้า bug ยังไม่มี assigneeId → assign ให้ staff คนนี้
 * - เมื่อ user comment ตอบกลับ → reset timer (ป้องกันการปิดอัตโนมัติ)
 * - Admin ไม่สามารถ comment ได้ (ดูอย่างเดียว)
 */
const createComment = async (req, res) => {
  try {
    const { bugId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // 🌟 Admin ไม่สามารถ comment ได้
    if (userRole === 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied: Admins can only view tickets and comments, not create them",
      });
    }

    if (!content || content.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Comment content is required",
      });
    }

    // ตรวจสอบว่า bug มีอยู่จริง
    const [bugs] = await pool.query("SELECT * FROM Bugs WHERE id = ?", [bugId]);

    if (bugs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Bug not found",
      });
    }

    const bug = bugs[0];

    // ตรวจสอบสิทธิ์: user comment ได้เฉพาะของตัวเอง, staff comment ได้เฉพาะที่รับผิดชอบ
    if (userRole === 'user' && bug.reporterId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: You can only comment on your own bugs",
      });
    }

    if (userRole === 'staff' && bug.assigneeId !== null && bug.assigneeId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: You can only comment on bugs assigned to you",
      });
    }

    // 🌟 เงื่อนไขใหม่: เมื่อ staff comment
    if (userRole === 'staff') {
      let needsUpdate = false;
      let updateQuery = "UPDATE Bugs SET ";
      let updateFields = [];
      let updateValues = [];

      // 1. เปลี่ยน status เป็น 'in_progress' (ถ้ายังไม่ใช่)
      if (bug.status !== 'in_progress' && bug.status !== 'resolved' && bug.status !== 'closed') {
        updateFields.push("status = ?");
        updateValues.push('in_progress');
        needsUpdate = true;
      }

      // 2. Assign staff คนนี้ (ถ้ายังไม่มี assigneeId)
      if (bug.assigneeId === null) {
        updateFields.push("assigneeId = ?");
        updateValues.push(userId);
        needsUpdate = true;
      }

      // บันทึกการอัปเดต
      if (needsUpdate) {
        updateFields.push("updatedAt = NOW()");
        updateQuery += updateFields.join(", ") + " WHERE id = ?";
        updateValues.push(bugId);
        
        await pool.query(updateQuery, updateValues);
      }
    }

    // 🌟 เมื่อ user (reporter) comment ตอบกลับ → reset timer โดยอัปเดต updatedAt
    // เพื่อป้องกันการเปลี่ยนเป็น resolved/closed อัตโนมัติ
    if (userRole === 'user' && bug.reporterId === userId) {
      await pool.query(
        "UPDATE Bugs SET updatedAt = NOW() WHERE id = ?",
        [bugId]
      );
    }

    // สร้าง comment ใหม่
    const [result] = await pool.query(
      "INSERT INTO Comments (bugId, userId, content, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())",
      [bugId, userId, content]
    );

    // ดึงข้อมูล comment ที่สร้างใหม่
    const [newComment] = await pool.query(
      `
      SELECT 
        c.id, c.content, c.createdAt,
        u.id as userId, u.username, u.role
      FROM Comments c
      LEFT JOIN Users u ON c.userId = u.id
      WHERE c.id = ?
    `,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: "Comment created successfully",
      data: newComment[0],
    });
  } catch (error) {
    console.error("Create comment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create comment",
      error: error.message,
    });
  }
};

/**
 * ลบ comment
 * DELETE /api/comments/:commentId
 * 
 * 🌟 เงื่อนไขใหม่:
 * - Admin ไม่สามารถลบ comment ได้ (ดูอย่างเดียว)
 * - เฉพาะเจ้าของ comment เท่านั้นที่ลบได้
 */
const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // 🌟 Admin ไม่สามารถลบได้
    if (userRole === 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied: Admins can only view comments, not delete them",
      });
    }

    // ตรวจสอบว่า comment มีอยู่จริง
    const [comments] = await pool.query("SELECT * FROM Comments WHERE id = ?", [commentId]);

    if (comments.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    const comment = comments[0];

    // ตรวจสอบสิทธิ์การลบ (เฉพาะเจ้าของ comment)
    if (comment.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: You can only delete your own comments",
      });
    }

    // ลบ comment
    await pool.query("DELETE FROM Comments WHERE id = ?", [commentId]);

    res.json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (error) {
    console.error("Delete comment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete comment",
      error: error.message,
    });
  }
};

module.exports = {
  getCommentsByBugId,
  createComment,
  deleteComment,
};