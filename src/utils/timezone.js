const exec = require("child_process").execSync;
const fs = require("fs");
const publicIp = require("public-ip");

const { log } = require("iipzy-shared/src/utils/logFile");
const http = require("iipzy-shared/src/services/httpService");
const { spawnAsync } = require("iipzy-shared/src/utils/spawnAsync");
const { set_timezoneOffsetMinutes } = require("iipzy-shared/src/utils/time");

const userDataPath = process.platform === "win32" ? "c:/temp/" : "/etc/iipzy";

/*
async function getMachineTimezoneCode() {
  const { stdout, stderr } = await spawnAsync("get-timezone-code", []);
  log("getMachineTimezoneCode: " + stdout, "tz", "info");
  if (stderr) {
    log("(Error) getMachineTimezoneCode: " + stderr, "tz", "error");
    return null;
  }
  return stdout;
}
*/

async function getIPAddressTimezoneInfo() {
  // timezone.
  let timezoneInfo = null;
  const results = await http.get("/client/timezoneInfo");
  const { data } = results;
  log(
    "getIPAddressTimezoneInfo: data = " + JSON.stringify(data, null, 2),
    "tz"
  );
  if (data.timezoneGmtOffset)
    timezoneInfo = data;

  return timezoneInfo;
}


async function changeTimezoneIfNecessary(configFile) {
  // check timezone.
  const publicIPAddressConfig = configFile.get("publicIPAddress");
  const publicIPAddress = await publicIp.v4();
  log(
    "changeTimezoneIfNecessary: publicIPAddressConfig = " +
      publicIPAddressConfig +
      ", publicIPAddress = " +
      publicIPAddress,
    "tz",
    "info"
  );
 
  /*
  const machineTimezoneCode = await getMachineTimezoneCode();
  log("changeTimezoneIfNecessary: machineTimezoneCode = " + machineTimezoneCode, "tz", "info");
  if (!machineTimezoneCode) return false;
  */

  const ipAddressTimezoneInfo = await getIPAddressTimezoneInfo();
  if (!ipAddressTimezoneInfo) return false;
  /*
  let timezoneCode = 'UTC';
  const { stdout, stderr } = await spawnAsync("get-timezone-rule", [ipAddressTimezoneInfo.timezoneId]);
  if (stderr) {
    log("(Error) changeTimezoneIfNecessary.get-timezone-rule: " + stderr, "tz", "error");
    return false;
  }
  timezoneCode = stdout;
  */

  // NB: We only care about timezone offset.
  set_timezoneOffsetMinutes(ipAddressTimezoneInfo.timezoneGmtOffset);
  let curTimezoneGmtOffset = await configFile.get("timezoneGmtOffset");
  if (curTimezoneGmtOffset !== ipAddressTimezoneInfo.timezoneGmtOffset) {
    // change machine timezone.
    log("changeTimezoneIfNecessary: change timezoneGmtOffset, old = " + curTimezoneGmtOffset + ", new = " + ipAddressTimezoneInfo.timezoneGmtOffset, "tz", "info");
    await configFile.set("timezoneGmtOffset", ipAddressTimezoneInfo.timezoneGmtOffset);
     return true;
    /*
    const { stdout, stderr } = await spawnAsync("set-timezone", [timezoneCode, ipAddressTimezoneInfo.timezoneId]);
    if (stderr) {
      log("(Error) changeTimezoneIfNecessary.set-timezone: " + stderr, "tz", "error");
      return false;
    }
    // NB: verify change.
    if (timezoneCode === await getMachineTimezoneCode()) {
      log("changeTimezoneIfNecessary: verified TimezoneCode = " + timezoneCode, "tz", "info");
      //await configFile.set("publicIPAddress", publicIPAddress);
      return true;
    }
    */
  }


  return false;
}

module.exports = { changeTimezoneIfNecessary };
