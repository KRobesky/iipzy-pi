const network = require("network");

const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");
const { sleep } = require("iipzy-shared/src/utils/utils");

async function getGatewayIp() {
  try {
    return new Promise((resolve, reject) => {
      network.get_gateway_ip((err, ip) => {
        if (err) {
          log("(Error) getGatewayIp: " + JSON.stringify(err), "neti", "error");
          resolve("0.0.0.0");
        } else resolve(ip);
      });
    });
  } catch (ex) {
    log("(Exception) getGatewayIp: " + ex, "neti", "error");
    return "0.0.0.0";
  }
}

async function getInterfaceName() {
  try {
    return new Promise((resolve, reject) => {
      network.get_active_interface((err, obj) => {
        if (err) {
          log("(Error) getInterfaceName: " + JSON.stringify(err), "neti", "error");
          resolve(null);
        } else resolve(obj.name);
      });
    });
  } catch (ex) {
    log("(Exception) getInterfaceName: " + ex, "neti", "error");
    return null;
  }
}

async function getPrivateIp() {
  try {
    return new Promise((resolve, reject) => {
      network.get_private_ip((err, ip) => {
        if (err) {
          log("(Error) getPrivateIp: " + JSON.stringify(err), "neti", "error");
          resolve("0.0.0.0");
        } else resolve(ip);
      });
    });
  } catch (ex) {
    log("(Exception) getPrivateIp: " + ex, "neti", "error");
    return "0.0.0.0";
  }
}

async function getPublicIp(http) {
  let publicIPAddress = null;
  while (true) {
    const { data, status } = await http.get("/myipAddress");
    if (status === Defs.httpStatusOk) {
      publicIPAddress = data.yourIPAddress;
      break;
    }
    await sleep(1000);
  }
  return publicIPAddress;
}

module.exports = { getGatewayIp, getInterfaceName, getPrivateIp, getPublicIp };
