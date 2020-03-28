const uuidv4 = require("uuid/v4");

const { log } = require("iipzy-shared/src/utils/logFile");

let connectionUuid = "";
let connectionUuidCreateTime = 0;
let connectionIPAddr = "";

function createConnectionUuid(ipAddr) {
  connectionUuid = uuidv4();
  connectionUuidCreateTime = Date.now();
  log("createConnectionUuid: uuid = " + connectionUuid, "conn", "info");
  connectionIPAddr = ipAddr;
  return connectionUuid;
}

function createConnectionUuidIfNoConnection() {
  if (!connectionUuid) {
    return createConnectionUuid();
  }
  log("createConnectionUuidIfNoConnection: inUse - uuid = " + connectionUuid, "conn", "info");
  return "";
}

function getConnectionUuid() {
  //log("getConnectionUuid: uuid = " + connectionUuid, "conn", "info");
  return connectionUuid;
}

function getConnectionIPAddr() {
  return connectionIPAddr;
}

function clearConnectionUuid() {
  log(
    "clearConnectionUuid: uuid = " + connectionUuid + ", createTime = " + connectionUuidCreateTime,
    "conn",
    "info"
  );

  if (connectionUuidCreateTime !== 0 && Date.now() - connectionUuidCreateTime > 30 * 1000) {
    connectionUuid = "";
    connectionUuidCreateTime = 0;
    connectionIPAddr = "";
    return true;
  }
  return false;
}

module.exports = {
  createConnectionUuid,
  createConnectionUuidIfNoConnection,
  getConnectionIPAddr,
  getConnectionUuid,
  clearConnectionUuid
};
