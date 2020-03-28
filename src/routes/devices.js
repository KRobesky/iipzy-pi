const express = require("express");
const router = express.Router();

//const Defs = require("iipzy-shared/src/defs");
const http = require("iipzy-shared/src/services/httpService");
const { log, timestampToString } = require("iipzy-shared/src/utils/logFile");

const { isValidConnection } = require("./validateConnection");

const {
  getDeviceTable,
  putDeviceTable
} = require("../services/networkMonitor");

router.get("/", async (req, res) => {
  log(
    "GET devices: timestamp = " + timestampToString(req.header("x-timestamp")),
    "devs",
    "info"
  );

  const connToken = req.header("x-conn-token");

  if (!isValidConnection(res, connToken)) return;

  const aliveOnly = req.query.aliveonly === "1";

  const data = getDeviceTable(aliveOnly);

  res.send(data);
});

router.put("/", async (req, res) => {
  log(
    "PUT device: timestamp = " + timestampToString(req.header("x-timestamp")),
    "devs",
    "info"
  );

  const connToken = req.header("x-conn-token");

  if (!isValidConnection(res, connToken)) return;

  const data = await putDeviceTable(req.body.deviceChanges);
  //??
  log("...putDeviceTable: data = " + JSON.stringify(data, null, 2));
  res.send(data);
});

module.exports = router;
