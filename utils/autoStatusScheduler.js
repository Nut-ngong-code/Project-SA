// ===================================
// Auto Status Scheduler - อัปเดต Status อัตโนมัติ
// ===================================

const cron = require("node-cron");
const { pool } = require("../config/db");

/**
 * ฟังก์ชันอัปเดต status ของ bugs อัตโนมัติ
 * 
 * เงื่อนไข:
 * - ถ้า user ไม่ comment ตอบกลับภายใน 24 ชม. → เปลี่ยน status เป็น 'resolved'
 * - ถ้า user ไม่ comment ตอบกลับภายใน 48 ชม. → เปลี่ยน status เป็น 'closed'
 */
async function autoUpdateBugStatus() {
  try {
    console.log("\n🔄 [Auto-Status] Starting auto status update...");
    
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // 1️⃣ หา bugs ที่ควรเปลี่ยนเป็น 'resolved' (24 ชม.)
    // ใช้ subquery เพื่อหา comment ล่าสุดของ user (reporter)
    const [bugsToResolve] = await pool.query(
      `
      SELECT 
        b.id,
        b.title,
        b.status,
        b.updatedAt,
        (
          SELECT MAX(c.createdAt)
          FROM Comments c
          WHERE c.bugId = b.id AND c.userId = b.reporterId
        ) as lastUserCommentTime
      FROM Bugs b
      WHERE b.status IN ('open', 'in_progress')
        AND b.updatedAt < ?
        AND (
          (
            SELECT MAX(c.createdAt)
            FROM Comments c
            WHERE c.bugId = b.id AND c.userId = b.reporterId
          ) IS NULL
          OR (
            SELECT MAX(c.createdAt)
            FROM Comments c
            WHERE c.bugId = b.id AND c.userId = b.reporterId
          ) < ?
        )
      `,
      [twentyFourHoursAgo, twentyFourHoursAgo]
    );

    // อัปเดตเป็น 'resolved'
    if (bugsToResolve.length > 0) {
      const bugIdsToResolve = bugsToResolve.map((bug) => bug.id);
      
      await pool.query(
        `UPDATE Bugs 
         SET status = 'resolved', updatedAt = NOW() 
         WHERE id IN (?)`,
        [bugIdsToResolve]
      );
      
      console.log(`✅ [Auto-Status] Updated ${bugsToResolve.length} bug(s) to 'resolved'`);
      bugsToResolve.forEach((bug) => {
        console.log(`   - Bug #${bug.id}: "${bug.title}" (Last updated: ${bug.updatedAt})`);
      });
    }

    // 2️⃣ หา bugs ที่ควรเปลี่ยนเป็น 'closed' (48 ชม.)
    const [bugsToClose] = await pool.query(
      `
      SELECT 
        b.id,
        b.title,
        b.status,
        b.updatedAt,
        (
          SELECT MAX(c.createdAt)
          FROM Comments c
          WHERE c.bugId = b.id AND c.userId = b.reporterId
        ) as lastUserCommentTime
      FROM Bugs b
      WHERE b.status = 'resolved'
        AND b.updatedAt < ?
        AND (
          (
            SELECT MAX(c.createdAt)
            FROM Comments c
            WHERE c.bugId = b.id AND c.userId = b.reporterId
          ) IS NULL
          OR (
            SELECT MAX(c.createdAt)
            FROM Comments c
            WHERE c.bugId = b.id AND c.userId = b.reporterId
          ) < ?
        )
      `,
      [fortyEightHoursAgo, fortyEightHoursAgo]
    );

    // อัปเดตเป็น 'closed'
    if (bugsToClose.length > 0) {
      const bugIdsToClose = bugsToClose.map((bug) => bug.id);
      
      await pool.query(
        `UPDATE Bugs 
         SET status = 'closed', updatedAt = NOW() 
         WHERE id IN (?)`,
        [bugIdsToClose]
      );
      
      console.log(`✅ [Auto-Status] Updated ${bugsToClose.length} bug(s) to 'closed'`);
      bugsToClose.forEach((bug) => {
        console.log(`   - Bug #${bug.id}: "${bug.title}" (Last updated: ${bug.updatedAt})`);
      });
    }

    if (bugsToResolve.length === 0 && bugsToClose.length === 0) {
      console.log("ℹ️  [Auto-Status] No bugs need status update");
    }

    console.log("✅ [Auto-Status] Auto status update completed\n");
  } catch (error) {
    console.error("❌ [Auto-Status] Error during auto status update:", error);
  }
}

/**
 * เริ่มต้น Scheduler ให้ทำงานทุกๆ 1 ชั่วโมง
 */
function startAutoStatusScheduler() {
  // ทำงานทันทีเมื่อเริ่มต้น server
  autoUpdateBugStatus();

  // ตั้งเวลาให้ทำงานทุกๆ 1 ชั่วโมง
  cron.schedule("0 * * * *", () => {
    autoUpdateBugStatus();
  });

  console.log("🔧 [Auto-Status] Scheduler started");
  console.log("⏰ [Auto-Status] Running every 1 hour");
}

/**
 * ฟังก์ชันสำหรับ Manual Trigger (เรียกจาก Admin API)
 * ใช้เวลาทดสอบที่กำหนดเองได้
 */
async function manualTrigger(customHours = null) {
  try {
    console.log("\n🧪 [Manual Trigger] Starting manual auto-status update...");
    
    // ถ้าส่ง customHours มา ใช้เวลาทดสอบ (เช่น 1 นาที = 0.0167 ชม.)
    const testMinutesFor24h = customHours?.resolved || 24;
    const testMinutesFor48h = customHours?.closed || 48;
    
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - testMinutesFor24h * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - testMinutesFor48h * 60 * 60 * 1000);

    console.log(`⏱️  [Manual Trigger] Using custom time window:`);
    console.log(`   - Resolved: ${testMinutesFor24h} hours ago`);
    console.log(`   - Closed: ${testMinutesFor48h} hours ago`);

    // 1️⃣ หา bugs ที่ควรเปลี่ยนเป็น 'resolved'
    const [bugsToResolve] = await pool.query(
      `
      SELECT 
        b.id,
        b.title,
        b.status,
        b.updatedAt,
        (
          SELECT MAX(c.createdAt)
          FROM Comments c
          WHERE c.bugId = b.id AND c.userId = b.reporterId
        ) as lastUserCommentTime
      FROM Bugs b
      WHERE b.status IN ('open', 'in_progress')
        AND b.updatedAt < ?
        AND (
          (
            SELECT MAX(c.createdAt)
            FROM Comments c
            WHERE c.bugId = b.id AND c.userId = b.reporterId
          ) IS NULL
          OR (
            SELECT MAX(c.createdAt)
            FROM Comments c
            WHERE c.bugId = b.id AND c.userId = b.reporterId
          ) < ?
        )
      `,
      [twentyFourHoursAgo, twentyFourHoursAgo]
    );

    // อัปเดตเป็น 'resolved'
    if (bugsToResolve.length > 0) {
      const bugIdsToResolve = bugsToResolve.map((bug) => bug.id);
      
      await pool.query(
        `UPDATE Bugs 
         SET status = 'resolved', updatedAt = NOW() 
         WHERE id IN (?)`,
        [bugIdsToResolve]
      );
      
      console.log(`✅ [Manual Trigger] Updated ${bugsToResolve.length} bug(s) to 'resolved'`);
      bugsToResolve.forEach((bug) => {
        console.log(`   - Bug #${bug.id}: "${bug.title}"`);
      });
    }

    // 2️⃣ หา bugs ที่ควรเปลี่ยนเป็น 'closed'
    const [bugsToClose] = await pool.query(
      `
      SELECT 
        b.id,
        b.title,
        b.status,
        b.updatedAt,
        (
          SELECT MAX(c.createdAt)
          FROM Comments c
          WHERE c.bugId = b.id AND c.userId = b.reporterId
        ) as lastUserCommentTime
      FROM Bugs b
      WHERE b.status = 'resolved'
        AND b.updatedAt < ?
        AND (
          (
            SELECT MAX(c.createdAt)
            FROM Comments c
            WHERE c.bugId = b.id AND c.userId = b.reporterId
          ) IS NULL
          OR (
            SELECT MAX(c.createdAt)
            FROM Comments c
            WHERE c.bugId = b.id AND c.userId = b.reporterId
          ) < ?
        )
      `,
      [fortyEightHoursAgo, fortyEightHoursAgo]
    );

    // อัปเดตเป็น 'closed'
    if (bugsToClose.length > 0) {
      const bugIdsToClose = bugsToClose.map((bug) => bug.id);
      
      await pool.query(
        `UPDATE Bugs 
         SET status = 'closed', updatedAt = NOW() 
         WHERE id IN (?)`,
        [bugIdsToClose]
      );
      
      console.log(`✅ [Manual Trigger] Updated ${bugsToClose.length} bug(s) to 'closed'`);
      bugsToClose.forEach((bug) => {
        console.log(`   - Bug #${bug.id}: "${bug.title}"`);
      });
    }

    const summary = {
      resolved: bugsToResolve.length,
      closed: bugsToClose.length,
      total: bugsToResolve.length + bugsToClose.length,
      bugsToResolve: bugsToResolve.map(b => ({ id: b.id, title: b.title })),
      bugsToClose: bugsToClose.map(b => ({ id: b.id, title: b.title })),
    };

    if (summary.total === 0) {
      console.log("ℹ️  [Manual Trigger] No bugs need status update");
    }

    console.log("✅ [Manual Trigger] Manual trigger completed\n");
    return summary;
  } catch (error) {
    console.error("❌ [Manual Trigger] Error during manual trigger:", error);
    throw error;
  }
}

module.exports = {
  startAutoStatusScheduler,
  autoUpdateBugStatus,
  manualTrigger,
};