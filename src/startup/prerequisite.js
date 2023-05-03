//??const { getSerialNumber } = require("raspi-serial-number");

const Defs = require("iipzy-shared/src/defs");
const { set_os_id } = require("iipzy-shared/src/utils/globals");
const { log } = require("iipzy-shared/src/utils/logFile");
const { sleep } = require("iipzy-shared/src/utils/utils");
const { getGatewayIp, getPrivateIp, getPublicIp } = require("iipzy-shared/src/utils/networkInfo");
const { spawnAsync } = require("iipzy-shared/src/utils/spawnAsync");
const { changeTimezoneIfNecessary } = require("iipzy-shared/src/utils/timezone");

///*
//??testing
//??const Ping = require("../core/main/ping");
//*/
//const TrafficControl = require("../core/main/trafficControl");

// see if device has changed ip addresses.
async function prerequisite(http, configFile) {
  log(">>>prerequisite", "preq", "info");

  let gatewayIPAddress = null;
  let localIPAddress = null;
  let publicIPAddress = null;
  let serialNumber = null;

  while (true) {
    gatewayIPAddress = await getGatewayIp();
    if (gatewayIPAddress !== "0.0.0.0") break;
    await sleep(1000);
  }
  log("prerequisite: gatewayIPAddress = " + gatewayIPAddress, "preq", "info");

  while (true) {
    localIPAddress = await getPrivateIp();
    if (localIPAddress !== "0.0.0.0") break;
    await sleep(1000);
  }
  log("prerequisite: localIPAddress = " + localIPAddress, "preq", "info");

  publicIPAddress = await getPublicIp(http);
  log("prerequisite: publicIPAddress = " + publicIPAddress, "preq", "info");

  const { stdout, stderr } = await spawnAsync("serial-number", []);
  if (stderr)
      log("(Error) serial-number: stderr = " + stderr, "preq", "error");
  else
    serialNumber = stdout;
  log("prerequisite: serialNumber = " + serialNumber, "preq", "info");

  {
    const { stdout, stderr } = await spawnAsync("os-id", []);
    if (stderr)
        log("(Error) os-id: stderr = " + stderr, "preq", "error");
    else
    {
      log("prerequisite: os_id = " + stdout, "preq", "info");
      set_os_id(stdout);
    }
  }

  const clientName = configFile.get("clientName");
  log("prerequisite: clientName=" + clientName, "preq", "info");
  const clientToken = configFile.get("clientToken");
  log("prerequisite: clientToken = " + clientToken, "preq", "info");
  const localIPAddress_config = configFile.get("localIPAddress");
  log("prerequisite: localIPAddress_config = " + localIPAddress_config, "preq", "info");
  const publicIPAddress_config = configFile.get("publicIPAddress");
  log("prerequisite: publicIPAddress_config = " + publicIPAddress_config, "preq", "info");
  
  await changeTimezoneIfNecessary(configFile);

  const ret = { 
    clientName,
    clientToken,
    gatewayIPAddress, 
    localIPAddress, 
    localIPAddress_config, 
    publicIPAddress, 
    publicIPAddress_config, 
    serialNumber };

  log("<<<prerequisite: " + JSON.stringify(ret, null, 2), "preq", "info");

  await sleep(1000);

  return ret;
}

module.exports = { prerequisite };
