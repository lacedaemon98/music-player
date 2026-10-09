#!/usr/bin/env node
/**
 * Reset an admin account's password.
 *
 *   node scripts/reset-admin-password.js '<new-password>'
 *   node scripts/reset-admin-password.js <username> '<new-password>'
 *   ADMIN_PASSWORD='<new-password>' node scripts/reset-admin-password.js
 *
 * With no username, it resets the only admin account; if there is more than
 * one it lists them and exits so the right account can be named explicitly.
 *
 * The password is never stored in this file - pass it in, and quote it so the
 * shell does not eat characters like ! or $.
 */
require('dotenv').config();
const { sequelize, User } = require('../models');

const MIN_PASSWORD_LENGTH = 6; // same floor as POST /api/admin/claim

async function resolveAdmin(username) {
  if (username) {
    const user = await User.findOne({ where: { username } });
    if (!user) {
      throw new Error(`Không tìm thấy user "${username}"`);
    }
    if (!user.is_admin) {
      throw new Error(`User "${username}" không phải admin`);
    }
    return user;
  }

  const admins = await User.findAll({ where: { is_admin: true } });

  if (admins.length === 0) {
    throw new Error('Chưa có admin nào. Tạo admin qua POST /api/admin/claim trước.');
  }

  if (admins.length > 1) {
    const names = admins.map(a => `  - ${a.username}`).join('\n');
    throw new Error(`Có ${admins.length} admin, chỉ rõ username cần reset:\n${names}`);
  }

  return admins[0];
}

async function main() {
  const args = process.argv.slice(2);

  const envPassword = process.env.ADMIN_PASSWORD || null;

  let username = null;
  let password = envPassword;

  if (args.length >= 2) {
    [username, password] = args;
  } else if (args.length === 1) {
    // A lone argument is the username when the password came from the
    // environment, otherwise it is the password itself. Without this the
    // username would be silently stored as the new password.
    if (envPassword) {
      username = args[0];
    } else {
      password = args[0];
    }
  }

  if (!password) {
    console.error('❌ Thiếu password mới.');
    console.error("   Dùng: node scripts/reset-admin-password.js [username] '<new-password>'");
    process.exitCode = 1;
    return;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`❌ Password phải dài ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
    process.exitCode = 1;
    return;
  }

  const admin = await resolveAdmin(username);

  admin.password_hash = await User.hashPassword(password);
  await admin.save();

  // Sanity check that the stored hash really matches the new password.
  const ok = await admin.validatePassword(password);
  if (!ok) {
    throw new Error('Đã lưu hash nhưng verify lại không khớp - password CHƯA đổi được');
  }

  console.log(`✅ Đã reset password cho admin "${admin.username}" (id: ${admin.id})`);
  console.log('   Đăng nhập lại bằng password mới nha.');
}

main()
  .catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
