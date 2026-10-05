require('dns').setServers(['8.8.8.8']);


require('dotenv').config();
const app = require('./app');
const connectDatabase = require('./config/database');

const port = Number(process.env.PORT) || 3000;

async function startServer() {
  await connectDatabase();
  app.listen(port, () => {
    console.log(`Maison Atelier is available at http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Unable to start the server:', error.message);
  process.exit(1);
});
