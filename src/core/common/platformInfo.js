const fs = require("fs");

const { log } = require("iipzy-shared/src/utils/logFile");
const Defs = require("iipzy-shared/src/defs");

function init() {
  const platform = process.platform;
  let osName = "unknown";
  let isRaspberryPi = false;

  switch (platform) {
    case "darwin": {
      osName = "macOS";
      break;
    }
    case "linux": {
      const osReleasePath = "/etc/os-release";
      if (fs.existsSync(osReleasePath)) {
        const data = fs.readFileSync(osReleasePath, "utf8");
        osName = getLinuxOsName(data);
        isRaspberryPi = osName.startsWith("Raspbian ");
      } else {
        log("linux os-release: does not exist ", "plat", "info");
      }
      break;
    }
    case "win32": {
      osName = "windows";
      break;
    }
    default: {
      log("os-release: ??? " + platform, "plat", "info");
      break;
    }
  }
  log(
    "platformInfo.init: platform = " + platform + ", osName = " + osName,
    "plat",
    "info"
  );
  return { platform, osName, isRaspberryPi };
}

function getLinuxOsName(data) {
  /*
  PRETTY_NAME="Raspbian GNU/Linux 9 (stretch)"
  NAME="Raspbian GNU/Linux"
  VERSION_ID="9"
  VERSION="9 (stretch)"
  ID=raspbian
  ID_LIKE=debian
  HOME_URL="http://www.raspbian.org/"
  SUPPORT_URL="http://www.raspbian.org/RaspbianForums"
  BUG_REPORT_URL="http://www.raspbian.org/RaspbianBugs"
  */
  const lines = data.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("NAME")) {
      let l = line.indexOf('"');
      if (l !== -1) {
        l++;
        const r = line.indexOf('"', l);
        if (r !== -1) return line.substring(l, r);
      }
    }
  }

  return null;
}

module.exports = { init };
