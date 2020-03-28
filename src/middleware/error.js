const { log } = require("iipzy-shared/src/utils/logFile");

module.exports = function(err, req, res, next) {
  log(err.message, err, "err");
  res.status(500).send("Somthing failed.");
};
