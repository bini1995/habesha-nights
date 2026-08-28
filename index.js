require("dotenv").config();
const { createApp } = require("./src/app");
const { readConfig } = require("./src/config");

const config = readConfig();
const server = createApp({ config }).listen(config.port, () => console.log(`Habesha Nights available at http://localhost:${config.port}`));

function stop() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
