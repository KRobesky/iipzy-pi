//??const { getSerialNumber } = require("raspi-serial-number");

const Defs = require("iipzy-shared/src/defs");
const { set_os_id } = require("iipzy-shared/src/utils/globals");
const { log } = require("iipzy-shared/src/utils/logFile");
const { sleep } = require("iipzy-shared/src/utils/utils");
const { spawnAsync } = require("iipzy-shared/src/utils/spawnAsync");

const { getGatewayIp, getPrivateIp, getPublicIp } = require("../utils/networkInfo");
const { changeTimezoneIfNecessary } = require("../utils/timezone");

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

  await changeTimezoneIfNecessary(configFile);
  /*
  if (await changeTimezoneIfNecessary(configFile)) {
    // restart.
    log("timezone change. Restarting in 5 seconds", "preq", "info");
    setTimeout(() => {
      process.exit(99);
    }, 5 * 1000);
    await sleep(6 * 1000)
  }
  */
 
  /*
  //??testing
  log("---calling Ping constructor");
  const ping = new Ping("testing");
  const pingRes = await ping.ping("ibm.com", 1);
  log("---pingRes = " + JSON.stringify(pingRes));
  */

  /*
  log("---calling TrafficControl constructor");
  await sleep(1000);
  const tc = new TrafficControl("testing", "br-lan", "ibm.com");
  await sleep(1000);
  await tc.run();
  await sleep(1000);
  */


  const ret = { gatewayIPAddress, localIPAddress, publicIPAddress, serialNumber };

  log("<<<prerequisite: " + JSON.stringify(ret), "preq", "info");

  return ret;
}

module.exports = { prerequisite };
