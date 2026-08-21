const fs = require("fs/promises");
const path = require("path");

function createAtomicJsonStore({ file, createDefault }) {
  let writeQueue = Promise.resolve();
  async function load() {
    try { return JSON.parse(await fs.readFile(file, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return createDefault(); throw error; }
  }
  async function write(value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(temporary, file);
    return value;
  }
  function update(change) {
    const operation = writeQueue.then(async () => write(await change(await load())));
    writeQueue = operation.catch(() => {});
    return operation;
  }
  return { load, update, write };
}

module.exports = { createAtomicJsonStore };
