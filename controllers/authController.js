// ===================================
// Authentication Controller (ปรับปรุง)
// ===================================

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db"); // Path นี้ถูกต้องสำหรับโครงสร้างปัจจุบัน
require("dotenv").config();

/**
 * ลงทะเบียนผู้ใช้ใหม่
 * POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    // ตรวจสอบข้อมูลที่จำเป็น
    if (!username || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Please provide username, email, password, and role",
      });
    }

    // 🌟 แก้ไข: ใช้ Role-system เดิมของเรา
    const validRoles = ["user", "staff", "admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be: user, staff, or admin",
      });
    }

    // 🌟 คงเดิม: ตรวจสอบตาราง 'Users' (ตัวใหญ่)
    const [existingUsers] = await pool.query(
      "SELECT id FROM Users WHERE username = ? OR email = ?",
      [username, email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username or email already exists",
      });
    }

    // เข้ารหัส password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🌟 คงเดิม: บันทึกลง 'Users' และเพิ่ม 'createdAt', 'updatedAt'
    const [result] = await pool.query(
      "INSERT INTO Users (username, email, password, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())",
      [username, email, hashedPassword, role]
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        id: result.insertId,
        username,
        email,
        role,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
};

/**
 * เข้าสู่ระบบ
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body; // 🌟 ใช้ username ในการ login

    // ตรวจสอบข้อมูลที่จำเป็น
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide username and password",
      });
    }

    // 🌟 คงเดิม: ค้นหาจาก 'Users' (ตัวใหญ่)
    const [users] = await pool.query(
      "SELECT id, username, email, password, role FROM Users WHERE username = ?",
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    const user = users[0];

    // ตรวจสอบ password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    // สร้าง JWT token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" } // 🌟 เพิ่ม || "1d"
    );

    res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

/**
 * ดูข้อมูลผู้ใช้ที่ login อยู่
 * GET /api/auth/me
 */
const getCurrentUser = async (req, res) => {
  try {
    // 🌟 คงเดิม: ค้นหาจาก 'Users' (ตัวใหญ่) และ 'createdAt' (camelCase)
    const [users] = await pool.query(
      "SELECT id, username, email, role, createdAt FROM Users WHERE id = ?",
      [req.user.id] // req.user มาจาก authMiddleware
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: users[0],
    });
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user information",
      error: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  getCurrentUser,
};

