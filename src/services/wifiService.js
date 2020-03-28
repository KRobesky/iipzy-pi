//const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");
const { spawnAsync } = require("iipzy-shared/src/utils/spawnAsync");
const { sleep } = require("iipzy-shared/src/utils/utils");

/**
On start:

  sudo wpa_cli -i wlan0 scan

GetStatus:

  sudo wpa_cli -i wlan0 list_networks
  
GetNetworks:

  sudo wpa_cli -i wlan0 list_networks
  sudo wpa_cli -i wlan0 scan
  sleep 10 seconds
  sudo wpa_cli -i wlan0 scan_results

Join:

  sudo wpa_cli -i wlan0 add_network ==> <netid>
  sudo wpa_cli -i wlan0 set_network <netid> ssid '<network-name>' 
  sudo wpa_cli -i wlan0 set_network <netid> psk '<password>'
  sudo wpa_cli -i wlan0 enable_network <netid>
  sudo wpa_cli -i wlan0 save_config
  write wifi : {<netid>, <ssid>} to configFile.

To go back (i.e., Join with empty network):

  read wifi: { <netid>, <ssid> } from configFile
  sudo wpa_cli -i wlan0 remove_network <netid>
  sudo wpa_cli -i wlan0 save_config

=======================================================
Note: Lan is still active until lan plug is removed.

Question: Will Lan take over from Wifi when lan cable is plugged back in, while wifi is active.
Answer: Yes - lan will take over while wifi is active.

Solution to determining which interface is active: Call network.get_private_ip once a minute.  
	If address changes, restart iipzy-pi.  
	If address goes to null ignore.
	sentinel-admin and updater will follow clientToken change.
*/

let wifiService = null;

class WifiService {
  constructor() {
    log("WifiService.constructor", "wifi", "info");

    wifiService = this;

    setTimeout(() => {
      this.doScan();
    }, 5 * 1000);
  }

  async doScan() {
    // sudo wpa_cli -i wlan0 scan
    const { stdout, stderr } = await spawnAsync("sudo", ["wpa_cli", "-i", "wlan0", "scan"]);
    log("WifiService.doScan: " + stdout, "wifi", "info");
    if (stderr) log("(Error) WifiService.doScan: " + stderr, "wifi", "error");
  }

  async getWifiStatus() {
    // sudo wpa_cli -i wlan0 list_networks
    const { stdout, stderr } = await spawnAsync("sudo", [
      "wpa_cli",
      "-i",
      "wlan0",
      "list_networks"
    ]);
    log("WifiService.getWifiStatus: " + stdout, "wifi", "info");
    if (stderr) {
      log("(Error) WifiService.getWifiStatus: " + stderr, "wifi", "error");
      return { __hadError__: { errorMessage: stderr } };
    } else if (stdout.startsWith("FAIL")) {
      log("(Error) WifiService.joinWifiNetwork: " + stdout, "wifi", "error");
      return { __hadError__: { errorMessage: "failed at list_networks" } };
    }

    // 0123456789x123456789x123456789x
    // 0	robesky-home	any	[CURRENT]
    let network = "";
    let netid = "";
    const lines = stdout.split("\n");
    for (let i = 1; i < lines.length; i++) {
      let line = lines[i];
      if (line) {
        if (line.indexOf("[CURRENT]") !== -1) {
          const fields = line.split("\t");
          netid = fields[0];
          network = fields[1];
          //log("-----netid='" + netid + "'", "wifi", "info");
          //log("-----network='" + network + "'", "wifi", "info");
          break;
        }
      }
    }

    return { network, netid };
  }

  async getWifiNetworks() {
    const { network } = await this.getWifiStatus();
    await this.doScan();
    // sudo wpa_cli -i wlan0 scan
    await sleep(6);

    // sudo wpa_cli -i wlan0 scan_results
    const { stdout, stderr } = await spawnAsync("sudo", ["wpa_cli", "-i", "wlan0", "scan_results"]);
    const networkNameSet = new Set();
    //log("WifiService.getWifiNetworks: " + stdout, "wifi", "info");
    if (stderr) {
      log("(Error) WifiService.getWifiNetworks: " + stderr, "wifi", "error");
      return { __hadError__: { errorMessage: stderr } };
    } else if (stdout.startsWith("FAIL")) {
      log("(Error) WifiService.joinWifiNetwork: " + stdout, "wifi", "error");
      return { __hadError__: { errorMessage: "failed at scan_results" } };
    }
    const lines = stdout.split("\n");
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line) {
        //log("---line [" + i + "] = " + line);
        let l = line.lastIndexOf("]");
        if (l !== -1 && l < line.length) {
          let name = line.substring(l + 1).trim();
          //log("---name = '" + name + "'");
          if (name) networkNameSet.add(name);
        }
      }
    }

    return { network, networks: [...networkNameSet] };
  }

  async joinWifiNetwork(data) {
    const { network, password } = data;
    log("WifiService.joinWifiNetwork: network = " + network, "wifi", "info");
    if (!network) {
      await this.removeWifiNetwork();
      return { network: "" };
    }
    // sudo wpa_cli -i wlan0 add_network ==> <netid>
    // sudo wpa_cli -i wlan0 set_network <netid> ssid '<network-name>'
    // sudo wpa_cli -i wlan0 set_network <netid> psk '<password>'
    // sudo wpa_cli -i wlan0 enable_network <netid>
    // sudo wpa_cli -i wlan0 save_config
    // write wifi : {<netid>, <ssid>} to configFile.
    // add network
    let netid = "";
    {
      const { stdout, stderr } = await spawnAsync("sudo", [
        "wpa_cli",
        "-i",
        "wlan0",
        "add_network"
      ]);
      if (stderr) {
        log("(Error) WifiService.joinWifiNetwork: " + stderr, "wifi", "error");
        return { __hadError__: { errorMessage: stderr } };
      } else if (stdout.startsWith("FAIL")) {
        log("(Error) WifiService.joinWifiNetwork: " + stdout, "wifi", "error");
        return { __hadError__: { errorMessage: "failed at add_network" } };
      }
      const nl = stdout.indexOf("\n");
      netid = stdout.substring(0, nl);
    }
    log("WifiService.joinWifiNetwork: netid = '" + netid + "'", "wifi", "info");
    // network
    {
      const { stdout, stderr } = await spawnAsync("sudo", [
        "wpa_cli",
        "-i",
        "wlan0",
        "set_network",
        netid,
        "ssid",
        '"' + network + '"'
      ]);
      if (stderr) {
        log("(Error) WifiService.joinWifiNetwork: " + stderr, "wifi", "error");
        this.removeWifiNetworkHelper(netid);
        return { __hadError__: { errorMessage: stderr } };
      } else if (stdout.startsWith("FAIL")) {
        log("(Error) WifiService.joinWifiNetwork: " + stdout, "wifi", "error");
        this.removeWifiNetworkHelper(netid);
        return { __hadError__: { errorMessage: "failed at set_newwork ssid" } };
      }
    }
    // password
    {
      const { stdout, stderr } = await spawnAsync("sudo", [
        "wpa_cli",
        "-i",
        "wlan0",
        "set_network",
        netid,
        "psk",
        '"' + password + '"'
      ]);
      if (stderr) {
        log("(Error) WifiService.joinWifiNetwork: " + stderr, "wifi", "error");
        this.removeWifiNetworkHelper(netid);
        return { __hadError__: { errorMessage: stderr } };
      } else if (stdout.startsWith("FAIL")) {
        log("(Error) WifiService.joinWifiNetwork: " + stdout, "wifi", "error");
        this.removeWifiNetworkHelper(netid);
        return { __hadError__: { errorMessage: "failed at set_network psk" } };
      }
    }
    // enable network.
    {
      const { stdout, stderr } = await spawnAsync("sudo", [
        "wpa_cli",
        "-i",
        "wlan0",
        "enable_network",
        netid
      ]);
      if (stderr) {
        log("(Error) WifiService.joinWifiNetwork: " + stderr, "wifi", "error");
        this.removeWifiNetworkHelper(netid);
        return { __hadError__: { errorMessage: stderr } };
      } else if (stdout.startsWith("FAIL")) {
        log("(Error) WifiService.joinWifiNetwork: " + stdout, "wifi", "error");
        this.removeWifiNetworkHelper(netid);
        return { __hadError__: { errorMessage: "failed at enable_network" } };
      }
    }
    // save config
    {
      const { stdout, stderr } = await spawnAsync("sudo", [
        "wpa_cli",
        "-i",
        "wlan0",
        "save_config"
      ]);
      if (stderr) {
        log("(Error) WifiService.joinWifiNetwork: " + stderr, "wifi", "error");
        this.removeWifiNetworkHelper(netid);
        return { __hadError__: { errorMessage: stderr } };
      } else if (stdout.startsWith("FAIL")) {
        log("(Error) WifiService.joinWifiNetwork: " + stdout, "wifi", "error");
        this.removeWifiNetworkHelper(netid);
        return { __hadError__: { errorMessage: "failed at save_config" } };
      }
    }

    // let the wifi world catch up.
    await sleep(5 * 1000);

    return { network };
  }

  async removeWifiNetwork() {
    log("WifiService.removeWifiNetwork", "wifi", "info");

    const { netid } = await this.getWifiStatus();
    if (!netid) return {};
    // sudo wpa_cli -i wlan0 remove_network 0
    // sudo wpa_cli -i wlan0 save_config

    // remove network
    const data = this.removeWifiNetworkHelper(netid);
    if (data) return data;
    // save config
    {
      const { stdout, stderr } = await spawnAsync("sudo", [
        "wpa_cli",
        "-i",
        "wlan0",
        "save_config"
      ]);
      if (stderr) {
        log("(Error) WifiService.joinWifiNetwork: " + stderr, "wifi", "error");
        return { __hadError__: { errorMessage: stderr } };
      } else if (stdout.startsWith("FAIL")) {
        log("(Error) WifiService.joinWifiNetwork: " + stdout, "wifi", "error");
        return { __hadError__: { errorMessage: "failed at save_config" } };
      }
    }
    return {};
  }

  async removeWifiNetworkHelper(netid) {
    log("WifiService.removeWifiNetworkHelper: netid = " + netid, "wifi", "info");

    // sudo wpa_cli -i wlan0 remove_network 0
    const { stdout, stderr } = await spawnAsync("sudo", [
      "wpa_cli",
      "-i",
      "wlan0",
      "remove_network",
      netid
    ]);
    if (stderr) {
      log("(Error) WifiService.removeWifiNetworkHelper: " + stderr, "wifi", "error");
      return { __hadError__: { errorMessage: stderr } };
    } else if (stdout.startsWith("FAIL")) {
      log("(Error) WifiService.removeWifiNetworkHelper: " + stdout, "wifi", "error");
      return { __hadError__: { errorMessage: "failed at remove_network" } };
    }

    return {};
  }
}

module.exports = WifiService;
