const mongoose = require('mongoose');

async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    console.info('MONGODB_URI is not set; running with placeholder catalog data.');
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.info('Connected to MongoDB.');
}

module.exports = connectDatabase;
