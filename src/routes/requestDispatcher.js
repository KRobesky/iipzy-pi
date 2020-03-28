const express = require("express");
const router = express.Router();

const Defs = require("iipzy-shared/src/defs");
const { log, timestampToString } = require("iipzy-shared/src/utils/logFile");

const { recvEvent } = require("../ipc/ipcRecv");
const { isValidConnection } = require("./validateConnection");

router.post("/", async (req, res) => {
  log(
    "POST request: timestamp = " + timestampToString(req.header("x-timestamp")),
    "reqd",
    "info"
  );

  const connToken = req.header(Defs.httpCustomHeader_XConnToken);
  log("POST request: connToken = " + connToken);
  if (!isValidConnection(res, connToken)) return;

  const event = req.body.event;
  const data = req.body.data;

  recvEvent(event, data);

  let results = {};

  res.send(results);
});

module.exports = router;
