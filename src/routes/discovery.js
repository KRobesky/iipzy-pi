const express = require("express");
const router = express.Router();

const {
  configFileGet,
  configFileSet
} = require("iipzy-shared/src/utils/configFile");
const Defs = require("iipzy-shared/src/defs");
const { log, timestampToString } = require("iipzy-shared/src/utils/logFile");

const {
  getConnectionUuid,
  createConnectionUuidIfNoConnection
} = require("../ipc/connection");

const { sendLogFiles } = require("../utils/sendLogFiles");

const { isValidConnection } = require("./validateConnection");

router.get("/", async (req, res) => {
  log(
    "GET discover: timestamp = " + timestampToString(req.header("x-timestamp")),
    "dscv",
    "info"
  );

  let connToken = req.header("x-conn-token");
  if (!connToken) connToken = "";
  log("connToken=" + connToken, "dscv", "info");

  let connectionUuid = getConnectionUuid();
  log("connUuid =" + connectionUuid, "dscv", "info");

  let inUse = false;
  if (connectionUuid && connToken !== connectionUuid) inUse = true;

  log("inUse =" + inUse, "dscv", "info");

  if (!inUse) connectionUuid = createConnectionUuidIfNoConnection();
  else connectionUuid = "";

  if (req.query.discoveryUuid) {
    const requestDiscoveryUuid = req.query.discoveryUuid;
    if (requestDiscoveryUuid === Defs.reqDiscoveryUuid) {
      const results =
        '{"discoveryUuid":"' +
        Defs.rspDiscoveryUuid +
        '","inUse":' +
        inUse +
        ',"connectionUuid":"' +
        connectionUuid +
        '"}';
      log("discovery: results = " + results, "dscv", "info");
      return res.send(results);
    }
  }

  res.send({});
});

router.get("/clienttoken", async (req, res) => {
  log(
    "GET discovery/clienttoken: timestamp = " +
      timestampToString(req.header("x-timestamp")),
    "dscv",
    "info"
  );

  let connToken = req.header("x-conn-token");

  if (!isValidConnection(res, connToken)) return;

  //const userDataPath = "/etc/iipzy";
  // const configFile = new ConfigFile(userDataPath, Defs.configFilename);
  // await configFile.init();
  const clientToken = configFileGet("clientToken");

  res.send({ clientToken });
});

router.get("/loglevel", async (req, res) => {
  log(
    "GET discovery/loglevel: timestamp = " +
      timestampToString(req.header("x-timestamp")),
    "ewat"
  );

  //const userDataPath = "/etc/iipzy";
  // const configFile = new ConfigFile(userDataPath, Defs.configFilename);
  // await configFile.init();
  const logLevel = configFileGet("logLevel");

  res.send({ logLevel });
});

router.post("/loglevel", async (req, res) => {
  log(
    "POST discovery/loglevel: timestamp = " +
      timestampToString(req.header("x-timestamp")),
    "dscv",
    "info"
  );

  const logLevel = req.body.logLevel;
  if (logLevel) {
    //const userDataPath = "/etc/iipzy";
    // const configFile = new ConfigFile(userDataPath, Defs.configFilename);
    // await configFile.init();
    await configFileSet("logLevel", logLevel);
  }
  res.send({});
});

// async function sendLogFiles(name, prefix) {
//   try {
//     const dest = await compressLogFiles(
//       "/tmp/" + name + "-" + Date.now() + ".tar.gz",
//       prefix
//     );
//     if (dest) {
//       log("sendLogFiles: dest = " + dest, "dscv", "info");
//       const { data, status } = await http.fileUpload(dest);
//       log("sendLogFiles: status = " + status, "dscv", "info");
//       if (status === Defs.httpStatusOk) {
//         log("sendLogFiles: " + JSON.stringify(data, null, 2), "dscv", "info");
//       }
//       await fileDeleteAsync(dest);
//     }
//   } catch (ex) {
//     log("(Exception) sendLogFiles: " + ex, "dscv", "error");
//   }
// }

router.post("/sendlogs", async (req, res) => {
  log(
    "POST discovery/sendlogs: timestamp = " +
      timestampToString(req.header("x-timestamp")),
    "dscv",
    "info"
  );

  await sendLogFiles("appliance", "iipzy-pi");
  await sendLogFiles("updater", "iipzy-updater");

  res.send({});
});

module.exports = router;
