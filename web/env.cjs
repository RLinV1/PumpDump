exports.loadRootEnv = function loadRootEnv() {
  try { process.loadEnvFile(`${__dirname}/../.env`); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
};
