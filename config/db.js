// ไฟล์: database/config/db.js
const mysql = require("mysql2/promise"); // ใช .promise()
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ฟังก์ชันสำหรับทดสอบการเชื่อมต่อ (แทน syncDB)
const testConnection = async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Database connection successful!");
  } catch (error) {
    console.error("❌ Unable to connect to the database:", error);
    throw error; // โยน error เพื่อให้ server หยุดทำงาน
  }
};

module.exports = { pool, testConnection };