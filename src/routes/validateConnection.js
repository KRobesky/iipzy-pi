const Defs = require("iipzy-shared/src/defs");
const { handleError } = require("iipzy-shared/src/utils/handleError");
const { log } = require("iipzy-shared/src/utils/logFile");

const { getConnectionIPAddr, getConnectionUuid } = require("../ipc/connection");

const { sendDelayedResults } = require("../utils/sendDelayedResults");

// returns true if valid connection, false otherwise.
function isValidConnection(res, connectionToken) {
  log("isValidConnection: connectionToken = " + connectionToken, "rout", "info");

  if (!connectionToken) {
    sendDelayedResults(
      res,
      Defs.httpStatusUnauthorized,
      handleError(
        Defs.objectType_clientInstance,
        "",
        Defs.statusMissingConnectionToken,
        "Access denied. Missing connection token"
      ),
      1 * 1000
    );
    return false;
  }

  if (getConnectionUuid() !== connectionToken) {
    sendDelayedResults(
      res,
      Defs.httpStatusUnauthorized,
      handleError(
        Defs.objectType_clientInstance,
        "",
        Defs.statusInvalidConnectionToken,
        "Access denied. Invalid connection token"
      ),
      1 * 1000
    );
    return false;
  }

  return true;
}

// returns true if client matches connection ip addr, false otherwise.
function isValidClient(req, res) {
  log("isValidClient", "rout", "info");

  const connectionIPAddr = getConnectionIPAddr();

  log("prerequisite: req.ip = " + req.ip + ", conn.ip = " + connectionIPAddr, "preq", "info");
  if (req.ip !== connectionIPAddr) {
    sendDelayedResults(
      res,
      Defs.httpStatusUnauthorized,
      handleError(
        Defs.objectType_clientInstance,
        "",
        Defs.statusInvalidDownloadClient,
        "Access denied. Invalid download client"
      ),
      1 * 1000
    );
    return false;
  }

  return true;
}

module.exports = { isValidClient, isValidConnection };
