const exec = require("child_process").execSync;
const fs = require("fs");
const publicIp = require("public-ip");

const { log } = require("iipzy-shared/src/utils/logFile");
const http = require("iipzy-shared/src/services/httpService");

const userDataPath = process.platform === "win32" ? "c:/temp/" : "/etc/iipzy";

function getMachineTimezoneString() {
  const result = exec("timedatectl", {});
  const str = result.toString("utf8");
  const tzLabel = "Time zone: ";
  const n = str.indexOf(tzLabel);
  if (n != -1) {
    const l = n + tzLabel.length;
    const r = str.indexOf(" (", l);
    const timezoneString = str.substring(l, r);
    log(
      "getMachineTimezoneString: timezoneString = '" + timezoneString + "'",
      "util"
    );
    return timezoneString;
  }
  return null;
}

async function getIPAddressTimezoneString() {
  // timezone.
  let timezone = null;

  const results = await http.get("/client/timezoneid");

  const { data } = results;
  if (data && data.timezoneId) {
    log(
      "getIPAddressTimezoneString: timezoneString = '" + data.timezoneId + "'",
      "util"
    );
    timezone = data.timezoneId;
  }

  return timezone;
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

  if (!publicIPAddressConfig || publicIPAddressConfig !== publicIPAddress) {
    const machineTimezoneString = getMachineTimezoneString();
    if (!machineTimezoneString) return false;
    const ipAddressTimezoneString = await getIPAddressTimezoneString();
    if (!ipAddressTimezoneString) return false;
    if (machineTimezoneString !== ipAddressTimezoneString) {
      // change machine timezone.
      const result = exec(
        "sudo timedatectl set-timezone " + ipAddressTimezoneString,
        {}
      );
      const str = result.toString("utf8");
      log("...datetimectl result = " + str);
      // NB: verify change.
      if (ipAddressTimezoneString === getMachineTimezoneString()) {
        log(
          "changeTimezoneIfNecessary: new timezoneString = " +
            ipAddressTimezoneString,
          "tz",
          "info"
        );
        await configFile.set("publicIPAddress", publicIPAddress);
        return true;
      }
    }
  }

  return false;
}

module.exports = { changeTimezoneIfNecessary };
