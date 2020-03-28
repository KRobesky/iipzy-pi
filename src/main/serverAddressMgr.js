const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");

let configFile = null;

function init(context) {
  log("serverAddress.init", "sadr", "info");
  const { _configFile } = context;
  configFile = _configFile;
}

async function saveServerAddress(serverAddress) {
  log("saveServerAddress: address = " + serverAddress, "sadr", "info");
  await configFile.set("serverAddress", serverAddress);
}

module.exports = {
  init,
  saveServerAddress
};
