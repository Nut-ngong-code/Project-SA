// ===================================
// RBAC Middleware - (ปรับปรุงตามเงื่อนไขใหม่)
// ===================================

// 🌟 กำหนด Permissions สำหรับแต่ละ Role (อัปเดตตามเงื่อนไขใหม่)
const PERMISSIONS = {
  // User (Reporter): สร้าง, อ่าน, แก้ไข ticket ของตัวเอง, comment ได้
  user: [
    "bug:create",           // สร้าง ticket ใหม่
    "bug:read:own",         // อ่าน ticket ของตัวเอง
    "bug:update:own",       // แก้ไข ticket ของตัวเอง (title, description)
    "bug:delete:own",       // ลบ ticket ของตัวเอง
    "comment:create",       // สร้าง comment
    "comment:read",         // อ่าน comments
    "comment:delete:own",   // ลบ comment ของตัวเอง
    "meta:read",            // อ่าน metadata (status/priority)
  ],
  
  // Staff (Developer/Support): ทำงานกับ ticket ที่รับผิดชอบ
  staff: [
    "bug:read:assigned",    // อ่าน ticket ที่ถูก assign หรือยังไม่มีคนรับ
    "bug:update:status",    // อัปเดต status
    "bug:update:priority",  // อัปเดต priority
    "bug:update:assign",    // มอบหมาย ticket
    "bug:delete:assigned",  // ลบ ticket ที่รับผิดชอบ
    "comment:create",       // สร้าง comment (เมื่อ comment จะเปลี่ยน status → in_progress อัตโนมัติ)
    "comment:read",         // อ่าน comments
    "comment:delete:own",   // ลบ comment ของตัวเอง
    "meta:read",            // อ่าน metadata
    "user:read:all",        // อ่านรายชื่อ users (สำหรับการ assign)
    "stats:read",           // อ่านสถิติ
  ],
  
  // Admin (Manager): ดูได้ทั้งหมด แต่ไม่สามารถแก้ไข/ลบ/เพิ่มอะไรได้เลย
  admin: [
    "bug:read:all",         // ดู tickets ทั้งหมด (ของทุก user)
    "comment:read",         // ดู comments ทั้งหมด
    "meta:read",            // อ่าน metadata
    "user:read:all",        // ดูรายชื่อ users ทั้งหมด
    "stats:read",           // ดูสถิติทั้งหมด
    // 🌟 หมายเหตุ: Admin ไม่มี permission ในการ create, update, delete
  ],
};

/**
 * ตรวจสอบว่า Role มี Permission ที่ต้องการหรือไม่
 * @param {string} role - Role ของผู้ใช้ (user, staff, admin)
 * @param {string} permission - Permission ที่ต้องการตรวจสอบ
 * @returns {boolean}
 */
const hasPermission = (role, permission) => {
  const rolePermissions = PERMISSIONS[role] || [];
  return rolePermissions.includes(permission);
};

/**
 * Middleware สำหรับตรวจสอบสิทธิ์การเข้าถึง
 * @param {string} requiredPermission - Permission ที่ต้องการ
 */
const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userRole = req.user.role;

    if (hasPermission(userRole, requiredPermission)) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied: Insufficient permissions",
        required: requiredPermission,
        userRole: userRole,
      });
    }
  };
};

/**
 * Middleware สำหรับตรวจสอบหลาย permissions (ต้องมีอย่างน้อย 1 อัน)
 * @param {Array<string>} permissions - Array ของ permissions ที่ต้องการ
 */
const checkAnyPermission = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userRole = req.user.role;
    const hasAnyPermission = permissions.some((permission) =>
      hasPermission(userRole, permission)
    );

    if (hasAnyPermission) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied: Insufficient permissions",
        required: permissions,
        userRole: userRole,
      });
    }
  };
};

/**
 * Middleware สำหรับตรวจสอบว่าเป็น Role ที่กำหนด
 * @param {Array<string>} allowedRoles - Array ของ roles ที่อนุญาต
 */
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (allowedRoles.includes(req.user.role)) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied: Invalid role",
        allowedRoles: allowedRoles,
        userRole: req.user.role,
      });
    }
  };
};

module.exports = {
  PERMISSIONS,
  hasPermission,
  checkPermission,
  checkAnyPermission,
  checkRole,
};