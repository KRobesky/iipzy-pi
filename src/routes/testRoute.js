const express = require("express");
const router = express.Router();

const { log } = require("iipzy-shared/src/utils/logFile");
const { now } = require("iipzy-shared/src/utils/time");

// create a GET route
router.get("/", (req, res) => {
  log("GET request: express_backend", "reqd", "info");
  res.send({
    express: "YOUR EXPRESS BACKEND IS CONNECTED TO REACT @ " + now()
  });
});

module.exports = router;
