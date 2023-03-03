//??const { getSerialNumber } = require("raspi-serial-number");

const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");
const { sleep } = require("iipzy-shared/src/utils/utils");
const { spawnAsync } = require("iipzy-shared/src/utils/spawnAsync");

const { getGatewayIp, getPrivateIp, getPublicIp } = require("../utils/networkInfo");

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

  const { stdout, stderr } = await spawnAsync(
    "serial-number"
  );
  if (stderr)
      log("(Error) serial-number: stderr = " + stderr, "auth", "error");
  else
    serialNumber = stdout;
  log("prerequisite: serialNumber = " + serialNumber, "preq", "info");

  clientToken = configFile.get("clientToken");
  log("prerequisite: clientToken = " + clientToken, "preq", "info");
  if (clientToken && clientToken !== serialNumber) {
    clientToken = null;
  }

  if (!clientToken) {
    // clear some settings.
    const configPublicIPAddress = configFile.get("publicIPAddress");

    await configFile.set("clientToken", null);
    if (!configPublicIPAddress || configPublicIPAddress !== publicIPAddress) {
      await configFile.set("userName", null);
      await configFile.set("password", null);
      await configFile.set("clientName", null);
      // set publicIPAddress
      await configFile.set("publicIPAddress", publicIPAddress);
    }
  }

  const ret = { gatewayIPAddress, localIPAddress, publicIPAddress, serialNumber };

  log("<<<prerequisite: " + JSON.stringify(ret), "preq", "info");

  return ret;
}

module.exports = { prerequisite };
