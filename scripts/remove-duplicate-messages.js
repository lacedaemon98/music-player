require('dotenv').config();
const { Message, sequelize } = require('../models');

async function removeDuplicateMessages() {
  try {
    console.log('🔍 Đang tìm tin nhắn trùng lặp...\n');

    // Find all messages with their counts
    const [duplicates] = await sequelize.query(`
      SELECT
        message,
        user_id,
        COUNT(*) as count,
        MIN(id) as first_id,
        GROUP_CONCAT(id) as all_ids
      FROM messages
      GROUP BY message, user_id
      HAVING count > 1
      ORDER BY count DESC
    `);

    if (duplicates.length === 0) {
      console.log('✅ Không tìm thấy tin nhắn trùng lặp nào!');
      await sequelize.close();
      process.exit(0);
    }

    console.log(`📊 Tìm thấy ${duplicates.length} nhóm tin nhắn trùng lặp:\n`);

    let totalDeleted = 0;

    for (const dup of duplicates) {
      const allIds = dup.all_ids.split(',').map(id => parseInt(id));
      const idsToDelete = allIds.filter(id => id !== dup.first_id);

      console.log(`📝 Message: "${dup.message.substring(0, 50)}${dup.message.length > 50 ? '...' : ''}"`);
      console.log(`   Số lần lặp: ${dup.count}`);
      console.log(`   Giữ lại ID: ${dup.first_id}`);
      console.log(`   Xóa ${idsToDelete.length} bản sao: ${idsToDelete.join(', ')}`);

      // Delete duplicates, keep the first one
      const deleted = await Message.destroy({
        where: {
          id: idsToDelete
        }
      });

      totalDeleted += deleted;
      console.log(`   ✅ Đã xóa ${deleted} tin nhắn\n`);
    }

    console.log(`\n🎉 Hoàn thành! Tổng cộng đã xóa ${totalDeleted} tin nhắn trùng lặp.`);

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi:', error);
    await sequelize.close();
    process.exit(1);
  }
}

removeDuplicateMessages();
