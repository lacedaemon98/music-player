require('dotenv').config();
const { Song, sequelize } = require('../models');

async function setDedication() {
  try {
    console.log('🔍 Tìm bài "Trú Mưa" - HKT...');

    // Find song "Trú Mưa" by HKT
    const song = await Song.findOne({
      where: {
        title: 'Trú Mưa'
      }
    });

    if (!song) {
      console.log('❌ Không tìm thấy bài "Trú Mưa"');
      await sequelize.close();
      process.exit(1);
    }

    console.log(`✅ Tìm thấy bài: ${song.title} - ${song.artist || 'N/A'} (ID: ${song.id})`);

    // Set dedication message
    song.dedication_message = 'Team chị Hoa bác sĩ Minh Trung gửi tặng anh chị em';
    await song.save();

    console.log('✅ Đã set dedication message:');
    console.log(`   "${song.dedication_message}"`);

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi:', error);
    await sequelize.close();
    process.exit(1);
  }
}

setDedication();
