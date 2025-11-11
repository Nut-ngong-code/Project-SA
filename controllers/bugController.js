// ===================================
// Bug Controller - (ปรับปรุงตามเงื่อนไขใหม่)
// ===================================

const { pool } = require("../config/db");
const { hasPermission } = require("../middlewares/roleMiddleware"); 

/**
 * ดึงรายการ bugs ทั้งหมด (พร้อม filtering)
 * GET /api/bugs?status=open&priority=high&assigneeId=2
 */
const getAllBugs = async (req, res) => {
  try {
    const { status, priority, assigneeId, page = 1, limit = 10 } = req.query;
    const userRole = req.user.role;
    const userId = req.user.id;

    // สร้าง SQL query แบบ dynamic
    let query = `
      SELECT 
        b.id, b.title, b.description, b.status, b.priority,
        b.createdAt, b.updatedAt,
        r.id as reporterId, r.username as reporterUsername,
        a.id as assigneeId, a.username as assigneeUsername
      FROM Bugs b
      LEFT JOIN Users r ON b.reporterId = r.id
      LEFT JOIN Users a ON b.assigneeId = a.id
      WHERE 1=1
    `;
    const params = [];

    // 🌟 กรอง bugs ตาม role
    if (userRole === "user") {
      // 'user' เห็นแค่ bugs ที่ตัวเองรายงาน
      query += " AND b.reporterId = ?";
      params.push(userId);
    } else if (userRole === "staff") {
      // 'staff' เห็น bugs ที่ถูกมอบหมายให้ หรือยังไม่มีคนรับผิดชอบ
      query += " AND (b.assigneeId = ? OR b.assigneeId IS NULL)";
      params.push(userId);
    }
    // 'admin' เห็นทั้งหมด (ไม่ต้องเพิ่ม AND)

    // Filter ตาม query parameters
    if (status) {
      query += " AND b.status = ?";
      params.push(status);
    }
    if (priority) {
      query += " AND b.priority = ?";
      params.push(priority);
    }
    if (assigneeId) {
      query += " AND b.assigneeId = ?";
      params.push(assigneeId);
    }

    // Pagination
    const offset = (page - 1) * limit;
    query += " ORDER BY b.createdAt DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), offset);

    const [bugs] = await pool.query(query, params);

    // นับจำนวน bugs ทั้งหมด
    let countQuery = "SELECT COUNT(*) as total FROM Bugs WHERE 1=1";
    const countParams = [];

    if (userRole === "user") {
      countQuery += " AND reporterId = ?";
      countParams.push(userId);
    } else if (userRole === "staff") {
      countQuery += " AND (assigneeId = ? OR assigneeId IS NULL)";
      countParams.push(userId);
    }

    const [countResult] = await pool.query(countQuery, countParams);
    const totalBugs = countResult[0].total;

    res.json({
      success: true,
      data: bugs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalBugs / limit),
        totalItems: totalBugs,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Get all bugs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve bugs",
      error: error.message,
    });
  }
};

/**
 * ดึงรายละเอียด bug ตาม ID
 * GET /api/bugs/:bugId
 * 
 * 🌟 เงื่อนไขใหม่:
 * - เมื่อ staff ดู ticket ที่ status = NULL จะเปลี่ยนเป็น 'open' อัตโนมัติ
 * - staff จะถูก assign เป็น assigneeId อัตโนมัติ (ถ้ายังไม่มี)
 * - admin ดูได้ทั้งหมด แต่ไม่มีผลต่อ status
 */
const getBugById = async (req, res) => {
  try {
    const { bugId } = req.params;

    const [bugs] = await pool.query(
      `
      SELECT 
        b.id, b.title, b.description, b.status, b.priority,
        b.createdAt, b.updatedAt, b.reporterId, b.assigneeId,
        r.id as reporterId, r.username as reporterUsername, r.email as reporterEmail,
        a.id as assigneeId, a.username as assigneeUsername, a.email as assigneeEmail
      FROM Bugs b
      LEFT JOIN Users r ON b.reporterId = r.id
      LEFT JOIN Users a ON b.assigneeId = a.id
      WHERE b.id = ?
    `,
      [bugId]
    );

    if (bugs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Bug not found",
      });
    }

    let bug = bugs[0];
    const userRole = req.user.role;
    const userId = req.user.id;

    // 🌟 ตรวจสอบสิทธิ์การเข้าถึง
    if (userRole === 'user' && bug.reporterId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: You can only view your own bugs",
      });
    }

    if (userRole === 'staff' && bug.assigneeId !== null && bug.assigneeId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: You can only view bugs assigned to you or unassigned bugs",
      });
    }

    // 🌟 เงื่อนไขใหม่: เมื่อ staff ดู ticket
    if (userRole === 'staff') {
      let needsUpdate = false;
      let updateQuery = "UPDATE Bugs SET ";
      let updateFields = [];
      let updateValues = [];

      // ถ้า status เป็น NULL → เปลี่ยนเป็น 'open'
      if (bug.status === null) {
        updateFields.push("status = ?");
        updateValues.push('open');
        bug.status = 'open';
        needsUpdate = true;
      }

      // ถ้ายังไม่มี assigneeId → assign ให้ staff คนนี้
      if (bug.assigneeId === null) {
        updateFields.push("assigneeId = ?");
        updateValues.push(userId);
        bug.assigneeId = userId;
        needsUpdate = true;
      }

      // ถ้ามีการอัปเดต → บันทึกลง database
      if (needsUpdate) {
        updateFields.push("updatedAt = NOW()");
        updateQuery += updateFields.join(", ") + " WHERE id = ?";
        updateValues.push(bugId);
        
        await pool.query(updateQuery, updateValues);

        // ดึงข้อมูลใหม่หลังอัปเดต
        const [updatedBugs] = await pool.query(
          `
          SELECT 
            b.id, b.title, b.description, b.status, b.priority,
            b.createdAt, b.updatedAt,
            r.id as reporterId, r.username as reporterUsername, r.email as reporterEmail,
            a.id as assigneeId, a.username as assigneeUsername, a.email as assigneeEmail
          FROM Bugs b
          LEFT JOIN Users r ON b.reporterId = r.id
          LEFT JOIN Users a ON b.assigneeId = a.id
          WHERE b.id = ?
        `,
          [bugId]
        );
        bug = updatedBugs[0];
      }
    }

    // Admin ดูได้ทั้งหมด แต่ไม่มีผลต่อ status

    res.json({
      success: true,
      data: bug,
    });
  } catch (error) {
    console.error("Get bug by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve bug",
      error: error.message,
    });
  }
};

/**
 * สร้าง bug ใหม่
 * POST /api/bugs
 * 
 * 🌟 เงื่อนไขใหม่:
 * - User สร้าง ticket โดยไม่ต้องระบุ assigneeId และ status
 * - assigneeId และ status จะเป็น NULL
 */
const createBug = async (req, res) => {
  try {
    const { title, description, priority = "low" } = req.body;
    const reporterId = req.user.id;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }

    // ตรวจสอบ priority ที่ถูกต้อง
    const validPriorities = ["low", "medium", "high", "critical"];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority. Must be: low, medium, high, critical",
      });
    }

    // 🌟 สร้าง bug ใหม่โดย assigneeId และ status เป็น NULL
    const [result] = await pool.query(
      `INSERT INTO Bugs (title, description, priority, reporterId, assigneeId, status, createdAt, updatedAt) 
       VALUES (?, ?, ?, ?, NULL, NULL, NOW(), NOW())`,
      [title, description, priority, reporterId]
    );

    // ดึงข้อมูล bug ที่สร้างใหม่
    const [newBug] = await pool.query(
      `
      SELECT 
        b.id, b.title, b.description, b.status, b.priority,
        b.createdAt, b.updatedAt,
        r.username as reporterUsername,
        a.username as assigneeUsername
      FROM Bugs b
      LEFT JOIN Users r ON b.reporterId = r.id
      LEFT JOIN Users a ON b.assigneeId = a.id
      WHERE b.id = ?
    `,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: "Bug created successfully",
      data: newBug[0],
    });
  } catch (error) {
    console.error("Create bug error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create bug",
      error: error.message,
    });
  }
};

/**
 * อัปเดต bug ทั้งหมด (PUT)
 * PUT /api/bugs/:bugId
 * 
 * 🌟 เงื่อนไขใหม่:
 * - Admin ไม่สามารถใช้ PUT ได้ (ดูอย่างเดียว)
 * - User แก้ไขได้เฉพาะของตัวเอง
 * - Staff แก้ไขได้เฉพาะ ticket ที่ตัวเองรับผิดชอบ
 */
const updateBug = async (req, res) => {
  try {
    const { bugId } = req.params;
    const { title, description, priority, status, assigneeId } = req.body;
    const userRole = req.user.role;
    const userId = req.user.id;

    // 🌟 Admin ไม่สามารถแก้ไขได้
    if (userRole === 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied: Admins can only view tickets, not modify them",
      });
    }

    const [bugs] = await pool.query("SELECT * FROM Bugs WHERE id = ?", [bugId]);

    if (bugs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Bug not found",
      });
    }
    const bug = bugs[0];

    // ตรวจสอบสิทธิ์: user แก้ได้เฉพาะของตัวเอง
    if (userRole === 'user' && bug.reporterId !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied: You can only update your own bugs" 
      });
    }

    // ตรวจสอบสิทธิ์: staff แก้ได้เฉพาะที่ตัวเองรับผิดชอบ
    if (userRole === 'staff' && bug.assigneeId !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied: You can only update bugs assigned to you" 
      });
    }

    if (!title || !description || !priority || !status) {
      return res.status(400).json({
        success: false,
        message: "Title, description, priority, and status are required for PUT",
      });
    }

    // ตรวจสอบ priority และ status
    const validPriorities = ["low", "medium", "high", "critical"];
    const validStatuses = ["open", "in_progress", "resolved", "closed"];

    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority. Must be: low, medium, high, critical",
      });
    }

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be: open, in_progress, resolved, closed",
      });
    }

    // อัปเดต bug
    await pool.query(
      `UPDATE Bugs 
       SET title = ?, description = ?, priority = ?, status = ?, assigneeId = ?, updatedAt = NOW()
       WHERE id = ?`,
      [title, description, priority, status, assigneeId || null, bugId]
    );

    // ดึงข้อมูล bug ที่อัปเดตแล้ว
    const [updatedBug] = await pool.query(
      `
      SELECT 
        b.id, b.title, b.description, b.status, b.priority,
        b.createdAt, b.updatedAt,
        r.username as reporterUsername,
        a.username as assigneeUsername
      FROM Bugs b
      LEFT JOIN Users r ON b.reporterId = r.id
      LEFT JOIN Users a ON b.assigneeId = a.id
      WHERE b.id = ?
    `,
      [bugId]
    );

    res.json({
      success: true,
      message: "Bug updated successfully",
      data: updatedBug[0],
    });
  } catch (error) {
    console.error("Update bug error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update bug",
      error: error.message,
    });
  }
};

/**
 * อัปเดตบางส่วนของ bug (PATCH)
 * PATCH /api/bugs/:bugId
 * 
 * 🌟 เงื่อนไขใหม่:
 * - Admin ไม่สามารถใช้ PATCH ได้ (ดูอย่างเดียว)
 * - User: แก้ไขได้เฉพาะ title, description
 * - Staff: แก้ไขได้เฉพาะ status, priority, assigneeId
 */
const patchBug = async (req, res) => {
  try {
    const { bugId } = req.params;
    const updates = req.body;
    const userRole = req.user.role;
    const userId = req.user.id;

    // 🌟 Admin ไม่สามารถแก้ไขได้
    if (userRole === 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied: Admins can only view tickets, not modify them",
      });
    }

    const [bugs] = await pool.query("SELECT * FROM Bugs WHERE id = ?", [bugId]);

    if (bugs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Bug not found",
      });
    }
    const bug = bugs[0];
    
    // กำหนด fields ที่แต่ละ role แก้ไขได้
    const allowedFields = {
        'user': ['title', 'description'],
        'staff': ['status', 'priority', 'assigneeId']
    };

    // ตรวจสอบสิทธิ์
    if (userRole === 'user' && bug.reporterId !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied: You can only update your own bugs" 
      });
    }

    if (userRole === 'staff' && bug.assigneeId !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied: You can only update bugs assigned to you" 
      });
    }

    const updateFields = [];
    const values = [];

    Object.keys(updates).forEach((key) => {
      // ตรวจสอบว่า Role นี้แก้ Field นี้ได้หรือไม่
      if (allowedFields[userRole] && allowedFields[userRole].includes(key)) {
        updateFields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update for your role",
      });
    }

    // อัปเดต bug
    values.push(bugId);
    await pool.query(
      `UPDATE Bugs SET ${updateFields.join(", ")}, updatedAt = NOW() WHERE id = ?`,
      values
    );

    // ดึงข้อมูล bug ที่อัปเดตแล้ว
    const [updatedBug] = await pool.query(
      `
      SELECT 
        b.id, b.title, b.description, b.status, b.priority,
        b.createdAt, b.updatedAt,
        r.username as reporterUsername,
        a.username as assigneeUsername
      FROM Bugs b
      LEFT JOIN Users r ON b.reporterId = r.id
      LEFT JOIN Users a ON b.assigneeId = a.id
      WHERE b.id = ?
    `,
      [bugId]
    );

    res.json({
      success: true,
      message: "Bug updated successfully",
      data: updatedBug[0],
    });
  } catch (error) {
    console.error("Patch bug error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update bug",
      error: error.message,
    });
  }
};

/**
 * ลบ bug
 * DELETE /api/bugs/:bugId
 * 
 * 🌟 เงื่อนไขใหม่:
 * - Admin ไม่สามารถลบได้ (ดูอย่างเดียว)
 * - เฉพาะ user (เจ้าของ ticket) และ staff (ผู้รับผิดชอบ) เท่านั้นที่ลบได้
 */
const deleteBug = async (req, res) => {
  try {
    const { bugId } = req.params;
    const userRole = req.user.role;
    const userId = req.user.id;

    // 🌟 Admin ไม่สามารถลบได้
    if (userRole === 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied: Admins can only view tickets, not delete them",
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

    // ตรวจสอบสิทธิ์: เฉพาะ reporter หรือ assignee ลบได้
    if (bug.reporterId !== userId && bug.assigneeId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: You can only delete your own bugs or bugs assigned to you",
      });
    }

    // ลบ bug (Comments จะถูกลบอัตโนมัติเนื่องจาก ON DELETE CASCADE)
    await pool.query("DELETE FROM Bugs WHERE id = ?", [bugId]);

    res.json({
      success: true,
      message: "Bug deleted successfully",
    });
  } catch (error) {
    console.error("Delete bug error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete bug",
      error: error.message,
    });
  }
};

module.exports = {
  getAllBugs,
  getBugById,
  createBug,
  updateBug,
  patchBug,
  deleteBug,
};