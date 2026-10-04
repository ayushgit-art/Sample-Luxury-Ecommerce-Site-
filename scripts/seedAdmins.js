require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const User = require('../models/User');

const ADMIN_COUNT = 3;

function readAdminCredentials() {
  const admins = Array.from({ length: ADMIN_COUNT }, (_, index) => {
    const number = index + 1;
    const email = process.env[`ADMIN_${number}_EMAIL`];
    const password = process.env[`ADMIN_${number}_PASSWORD`];

    if (!email || !password) {
      throw new Error(`Set ADMIN_${number}_EMAIL and ADMIN_${number}_PASSWORD before seeding.`);
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error(`ADMIN_${number}_EMAIL must be a valid email address.`);
    }
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error(`ADMIN_${number}_PASSWORD must be at least 8 characters and no more than 72 bytes.`);
    }

    return { email: normalizedEmail, password };
  });

  if (new Set(admins.map((admin) => admin.email)).size !== ADMIN_COUNT) {
    throw new Error('The three admin email addresses must be unique.');
  }

  return admins;
}

async function seedAdmins() {
  const admins = readAdminCredentials();
  await connectDatabase();
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Set MONGODB_URI in .env before running the admin seed.');
  }

  for (const admin of admins) {
    const passwordHash = await bcrypt.hash(admin.password, 12);
    await User.updateOne(
      { email: admin.email },
      {
        $set: {
          name: admin.email.split('@')[0],
          email: admin.email,
          passwordHash,
          role: 'admin'
        }
      },
      { upsert: true, runValidators: true }
    );
  }

  const emails = admins.map((admin) => admin.email);
  const storedAdmins = await User.find({ email: { $in: emails } })
    .select('+passwordHash email role')
    .lean();

  if (storedAdmins.length !== ADMIN_COUNT) {
    throw new Error(`Expected ${ADMIN_COUNT} seeded admin accounts; retrieved ${storedAdmins.length}.`);
  }

  const storedByEmail = new Map(storedAdmins.map((admin) => [admin.email, admin]));
  for (const admin of admins) {
    const storedAdmin = storedByEmail.get(admin.email);
    if (!storedAdmin || storedAdmin.role !== 'admin' || !(await bcrypt.compare(admin.password, storedAdmin.passwordHash))) {
      throw new Error('Admin seed verification failed for one or more configured accounts.');
    }
  }

  console.info(`Admin seed complete: ${ADMIN_COUNT} configured admin accounts verified.`);
}

seedAdmins()
  .catch((error) => {
    console.error('Unable to seed admin accounts:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
