const dgram = require("dgram");
const dnsjs = require("dns-js");
const fs = require("fs");
const path = require("path");
const snmp = require("net-snmp");
const { spawn } = require("child_process");

const Defs = require("iipzy-shared/src/defs");
const { handleError } = require("iipzy-shared/src/utils/handleError");
const { log } = require("iipzy-shared/src/utils/logFile");
const {
  fileDeleteAsync,
  fileReadAsync,
  fileWriteAsync
} = require("iipzy-shared/src/utils/fileIO");
const { now_local } = require("iipzy-shared/src/utils/time");
const { sleep } = require("iipzy-shared/src/utils/utils");

const { bonjourServiceNameToProtocolInfo } = require("./bonjourServiceInfo");

const netList = require("./network-list");

let networkScan = null;

class NetworkScan {
  constructor(context) {
    log("NetworkScan.constructor", "nscn", "info");

    this.userDataPath = context._userDataPath;
    this.localNetworkDevicesPath = path.join(
      this.userDataPath,
      "localNetworkDevices.json"
    );

    this.http = context._http;
    this.ipcSend = context._ipcSend;

    this.sendAlert = context._sendAlert;

    this.deviceByIpAddress = new Map();
    this.ipAddressByMacAddress = new Map();
    this.execAvahiScan = null;
    this.avahiScanTimeout = null;
    this.execAvahiWatch = null;

    this.localCidr = "";

    this.accumulatedAvahiStr = "";

    this.accumulatedNetBiosScan = "";

    // for ping devices.
    this.ipAddresses = [];
    this.nextIpAddressesIndex = 0;

    this.firstTimeEver = false;
    this.allowClientUpdates = false;

    this.writeEnabled = true;

    // one write at a time.
    this.writing = false;

    networkScan = this;
  }

  async scan() {
    log(">>>scan", "nscn", "info");

    await this.getLocalCidr("eth0");

    await this.readDevicesFromFile();

    await this.deviceScan();

    await this.netBiosScan();

    await this.bonjourScan();

    this.fixupDeviceDisplayNames();

    await this.writeDevicesToFile();

    this.ipcSend.send(Defs.ipcDevicesReady, {});

    this.firstTimeEver = false;
    this.allowClientUpdates = true;

    this.watchBonjour();

    this.watchDevices();

    this.periodicWriteDevicesToFile();

    log("<<<scan", "nscn", "info");
  }

  cloneDevice(device) {
    log("cloneDevice: ipAddress = " + device.ipAddress, "nscn", "info");

    const clone = JSON.parse(JSON.stringify(device));
    return clone;
  }

  nullifyDevice(device) {
    if (device !== null) {
      log(
        "nullifyDevice: ipAddress = " +
          device.ipAddress +
          ", macAddress = " +
          device.macAddress,
        "nscn",
        "info"
      );
      device.displayName = device.ipAddress;
      device.alive = false;
      device.hostname = null;
      device.macAddress = null;
      device.vendor = null;
      device.pingSucceeded = false;
      device.latestGoodPing = null;
      device.services = null;
      device.reported = false;
    }
  }

  printDevice(title, device) {
    if (device) {
      const info = {
        ipAddress: device.ipAddress,
        macAddress: device.macAddress,
        alive: device.alive,
        displayName: device.displayName,
        latestGoodPing: device.latestGoodPing
      };
      log("Device - " + title + ": " + JSON.stringify(info), "nscn", "info");
    } else {
      log("Device - " + title + ": null", "nscn", "info");
    }
  }

  async addUpdateDevice(deviceParam) {
    let device = deviceParam;

    log(
      "addUpdateDevice: ipAddress = " +
        device.ipAddress +
        ", macAddress = " +
        device.macAddress,
      "nscn",
      "info"
    );

    this.printDevice("addUpdateDevice: device", device);

    if (device.macAddress && device.macAddress !== "(incomplete)") {
      let ipAddressByMacAddress = this.ipAddressByMacAddress.get(
        device.macAddress
      );
      if (!ipAddressByMacAddress) ipAddressByMacAddress = [];

      log(
        "...addUpdateDevice: set BEFORE = " +
          JSON.stringify(ipAddressByMacAddress),
        "nscn",
        "info"
      );

      if (ipAddressByMacAddress.indexOf(device.ipAddress) === -1)
        ipAddressByMacAddress.push(device.ipAddress);
      this.ipAddressByMacAddress.set(device.macAddress, ipAddressByMacAddress);

      log(
        "...addUpdateDevice: set AFTER  = " +
          JSON.stringify(ipAddressByMacAddress),
        "nscn",
        "info"
      );
    }

    // const deviceByMacAddress = ipAddressByMacAddress
    //   ? this.deviceByIpAddress.get(ipAddressByMacAddress)
    //   : null;

    // this.printDevice("addUpdateDevice: deviceByMacAddress", deviceByMacAddress);

    // if (
    //   deviceByMacAddress &&
    //   device.ipAddress !== deviceByMacAddress.ipAddress
    // ) {
    //   // ip address change for mac address.

    //   const latestGoodPingByDeviceIpAddressEpoch = Date.parse(
    //     device.latestGoodPing
    //   );
    //   const latestGoodPingByDeviceMacAddressEpoch = Date.parse(
    //     deviceByMacAddress.latestGoodPing
    //   );

    //   log(
    //     "addUpdateDevice: ipAddress ping epoch = " +
    //       latestGoodPingByDeviceIpAddressEpoch +
    //       ", macAddress ping epoch = " +
    //       latestGoodPingByDeviceMacAddressEpoch,
    //     "nscn",
    //     "info"
    //   );

    //   let oldDevice = null;
    //   let newDevice = null;
    //   if (
    //     latestGoodPingByDeviceIpAddressEpoch >
    //     latestGoodPingByDeviceMacAddressEpoch
    //   ) {
    //     oldDevice = deviceByMacAddress;
    //     newDevice = device;
    //   } else {
    //     oldDevice = device;
    //     newDevice = deviceByMacAddress;
    //   }

    //   log(
    //     "addUpdateDevice: old ipAddress = " +
    //       oldDevice.ipAddress +
    //       ", new ipAddress = " +
    //       newDevice.ipAddress +
    //       ", for macAddress = " +
    //       device.macAddress,
    //     "nscn",
    //     "info"
    //   );

    //   const oldIpAddress = oldDevice.ipAddress;
    //   const macAddress = device.macAddress;
    //   const pingSucceeded = device.pingSucceeded;
    //   const latestGoodPing = device.latestGoodPing;
    //   device = this.cloneDevice(oldDevice);
    //   device.ipAddress = newDevice.ipAddress;
    //   device.hostName = newDevice.hostName;
    //   device.macAddress = macAddress;
    //   device.pingSucceeded = pingSucceeded;
    //   device.latestGoodPing = latestGoodPing;
    //   this.nullifyDevice(oldDevice);

    //   this.ipAddressByMacAddress.set(device.macAddress, device.ipAddress);

    //   // report ip address change.
    //   await this.sendDeviceIpAddressChangeAlert(device, oldIpAddress);
    // }

    if (device.alive) {
      if (!this.firstTimeEver && !device.reported) {
        await this.sendDevicePresenceAlert(device, true);
      }
      device.reported = true;
    } else device.reported = false;

    this.deviceByIpAddress.set(device.ipAddress, device);
  }

  async deleteDevice(device) {
    log(
      "deleteDevice: ipAddress = " +
        device.ipAddress +
        ", macAddress = " +
        device.macAddress,
      "nscn",
      "info"
    );

    const deletedMacAddress = device.macAddress;
    this.nullifyDevice(device);
    // if (deletedMacAddress) this.ipAddressByMacAddress.delete(deletedMacAddress);
  }

  getDisplayName(ipAddress) {
    return this.deviceByIpAddress.get(ipAddress).displayName;
  }

  getLocalCidrExec(ifName, callback) {
    // ip -j -4  addr show dev eth0
    const exec = spawn("sudo", [
      "ip",
      "-j",
      "-4",
      "addr",
      "show",
      "dev",
      ifName
    ]);

    exec.stdout.on("data", data => {
      const str = data.toString();
      const intfs = JSON.parse(str);
      log("stdout: " + JSON.stringify(intfs, null, 2), "cidr", "verbose");
      for (let i = 0; i < intfs.length; i++) {
        const intf = intfs[i];
        if (intf.ifname === ifName) {
          if (intf.operstate === "UP") {
            for (let j = 0; j < intf.addr_info.length; j++) {
              const addr = intf.addr_info[j];
              if (addr.family === "inet") {
                const cidr = addr.local + "/" + addr.prefixlen;
                log("getLocalCidrExec = " + cidr, "cidr", "verbose");
                this.localCidr = cidr;
                break;
              }
            }
          }
          break;
        }
      }
    });

    exec.stderr.on("data", data => {
      const str = data.toString();
      log("stderr: " + str, "cidr", "info");
    });

    exec.on("exit", code => {
      log(`ip exited with code ${code}`, "cidr", "info");
      callback();
    });
  }

  getLocalCidrHelper(ifName) {
    return new Promise((resolve, reject) => {
      this.getLocalCidrExec(ifName, cidr => {
        resolve();
      });
    });
  }

  async getLocalCidr(ifName) {
    log(">>>getLocalCidr", "nscn", "info");
    await this.getLocalCidrHelper(ifName);
    log("<<<getLocalCidr", "nscn", "info");
  }

  async readDevicesFromFile() {
    log(">>>readDevicesFromFile", "nscn", "info");
    const data = await fileReadAsync(this.localNetworkDevicesPath);
    if (data) {
      const devices = JSON.parse(data);
      for (let i = 0; i < devices.length; i++) {
        const device = devices[i];
        if (i === 0 && !device.hasOwnProperty("reported"))
          this.firstTimeEver = true;
        if (this.firstTimeEver) device.reported = device.alive;
        this.printDevice("readDevicesFromFile: device", device);
        this.deviceByIpAddress.set(device.ipAddress, device);
        // if (device.macAddress)
        //   this.ipAddressByMacAddress.set(device.macAddress, device.ipAddress);
      }
    } else this.firstTimeEver = true;

    log(
      "<<<readDevicesFromFile: firstTimeEver = " + this.firstTimeEver,
      "nscn",
      "info"
    );
  }

  async writeDevicesToFile() {
    log(">>>writeDevicesToFile", "nscn", "info");
    if (this.writeEnabled) {
      if (!this.writing) {
        this.writing = true;
        try {
          let data = [];
          for (const [ipAddress, device] of this.deviceByIpAddress.entries()) {
            data.push(device);
          }
          await fileWriteAsync(
            this.localNetworkDevicesPath,
            JSON.stringify(data, null, 2)
          );
        } catch (ex) {
          log("(Exception) writeDevicesToFile: " + ex, "nscn", "error");
        }
        this.writing = false;
      }
    }
    log("<<<writeDevicesToFile", "nscn", "info");
  }

  removeDotLocal(str) {
    const l = str.indexOf(".local");
    if (l === -1) return str;
    return str.substring(0, l);
  }

  fixupDeviceDisplayName(device) {
    // if we have a hostname, use it.
    if (device.hostName !== null) {
      device.displayName = device.hostName;
      return;
    }
    // try services.
    if (device.services) {
      for (let i = 0; i < device.services.length; i++) {
        const service = device.services[i];
        let displayName = null;
        switch (service.serviceName) {
          case "_workstation._tcp": {
            displayName = service.id;
            break;
          }
          case "_hap._tcp": {
            displayName = service.name;
            break;
          }
          case "_http._tcp": {
            displayName = service.id;
            break;
          }
          case "_companion-link._tcp": {
            displayName = service.name;
            break;
          }
          case "_apple-mobdev2._tcp": {
            displayName = service.id;
            break;
          }
          case "_soundtouch._tcp": {
            displayName = service.name;
            break;
          }
          case "_smb._tcp": {
            displayName = service.name;
            break;
          }
          case "_spotify-connect._tcp": {
            displayName = service.name;
            break;
          }
          default:
            break;
        }
        if (displayName) {
          device.displayName = this.removeDotLocal(displayName);
          return;
        }
      }
    }

    if (device.netBiosName) {
      device.displayName = device.netBiosName.trim();
      return;
    }

    if (device.vendor) {
      device.displayName = device.vendor + "@" + device.ipAddress;
      return;
    }

    device.displayName = device.ipAddress;
  }

  fixupDeviceDisplayNames() {
    for (const [ipAddress, device] of this.deviceByIpAddress.entries()) {
      this.fixupDeviceDisplayName(device);
    }
  }

  scanHelper() {
    return new Promise((resolve, reject) => {
      netList.scan({}, (err, arr) => {
        if (err) {
          log("...scan err = " + err, "nscn", "info");
          resolve([]);
        } else resolve(arr);
      });
    });
  }

  async deviceScan() {
    log(">>>deviceScan", "nscn", "info");

    const netListDevices = await this.scanHelper();
    for (let i = 0; i < netListDevices.length; i++) {
      const netListDevice = netListDevices[i];
      log(
        ".........netListDevice = " + JSON.stringify(netListDevice),
        "nscn",
        "info"
      );
      log("devicesScan: " + netListDevice.ip, "nscn", "info");
      let device = this.deviceByIpAddress.get(netListDevice.ip);
      if (!device) {
        // first time seen.
        log("devicesScan: " + netListDevice.ip + " first time", "nscn", "info");
        device = {
          ipAddress: netListDevice.ip,
          displayName: null,
          alive: netListDevice.alive,
          hostName: netListDevice.hostname,
          macAddress: netListDevice.mac
            ? netListDevice.mac.toLowerCase()
            : null,
          vendor: netListDevice.vendor
        };
        await this.setDeviceStatus(device, netListDevice.alive);
      } else {
        // existing.
        if (netListDevice.mac) {
          if (device.macAddress !== netListDevice.mac.toLowerCase()) {
            // device changed.
            log(
              "devicesScan: " +
                netListDevice.ip +
                " existing - mac change - old = " +
                device.macAddress +
                ", new = " +
                netListDevice.mac,
              "nscn",
              "info"
            );
            device = {
              ipAddress: netListDevice.ip,
              displayName: null,
              alive: netListDevice.alive,
              hostName: netListDevice.hostname,
              macAddress: netListDevice.mac.toLowerCase(),
              vendor: netListDevice.vendor
            };
            await this.setDeviceStatus(device, netListDevice.alive);
          } else {
            // update.
            log(
              "devicesScan: " + netListDevice.ip + " existing - update",
              "nscn",
              "info"
            );
            // if (!device.alive) {
            //   if (netListDevice.alive) await this.setDeviceStatus(device, true);
            // }

            device.hostName = netListDevice.hostname;
            device.vendor = netListDevice.vendor;

            await this.setDeviceStatus(device, netListDevice.alive);
          }
        } else {
          // no macAddress.
          if (device.macAddress) {
            log(
              "devicesScan: " +
                netListDevice.ip +
                " existing - mac change - old = " +
                device.macAddress +
                ", new = " +
                netListDevice.mac,
              "nscn",
              "info"
            );

            //this.nullifyDevice(device);

            await this.setDeviceStatus(device, false);
          }
        }
      }
      await this.addUpdateDevice(device);
      log(
        "dev: " +
          JSON.stringify(this.deviceByIpAddress.get(netListDevice.ip), null, 2),
        "nscn",
        "info"
      );
    }

    log("<<<deviceScan", "nscn", "info");
  }

  netBiosScanImpl(callback) {
    // nbtscan -s : 192.168.1.0/24
    const exec = spawn("nbtscan", ["-s", ":", this.localCidr]);

    exec.stdout.on("data", data => {
      const str = data.toString();
      log("stdout: " + str, "nbio", "verbose");
      this.accumulatedNetBiosScan += str;
    });

    exec.stderr.on("data", data => {
      const str = data.toString();
      log("stderr: " + str, "nbio", "info");
    });

    exec.on("exit", code => {
      log(`ip exited with code ${code}`, "nbio", "info");
      callback();
    });
  }

  netBiosScanHelper() {
    return new Promise((resolve, reject) => {
      this.netBiosScanImpl(() => {
        resolve();
      });
    });
  }

  async netBiosScan() {
    log(">>>netBiosScan", "nscn", "info");

    await this.netBiosScanHelper();
    const netBiosScanLines = this.accumulatedNetBiosScan.split("\n");
    for (let i = 0; i < netBiosScanLines.length; i++) {
      const line = netBiosScanLines[i];
      log("...netBiosScanLine[" + i + "]: " + line, "nscn", "info");
      const parts = line.split(":");
      let ipAddress = parts[0];
      let netBiosName = parts[1];
      const device = this.deviceByIpAddress.get(ipAddress);
      if (device) {
        await this.setDeviceStatus(device, true);
        device.netBiosName = netBiosName;
        await this.addUpdateDevice(device);
      }
    }

    log("<<<netBiosScan", "nscn", "info");
  }

  replaceEscapes(str) {
    let ret = str;
    while (true) {
      const l = ret.indexOf("\\");
      if (l === -1) break;
      const escaped = ret.substring(l, l + 4);
      const cnum = parseInt(escaped.substring(1, 4));
      let char = "";
      if (cnum < 128) char = String.fromCharCode(cnum);
      ret = ret.replace(escaped, char);
    }
    return ret;
  }

  async parseAvahiLine(line, fixupDisplayName) {
    let serviceName = "";
    let serviceInfo = "";
    let name = "";
    let id = "";
    let ipAddress = "";
    let serviceText = "";
    const parts = line.split(";");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      //log("...part[" + i + "]: " + part, "bonj");
      switch (i) {
        case 0:
          if (part !== "=") return;
        case 1:
          break;
        case 2:
          //if (part !== "IPv4") return;
          break;
        case 3:
          name = this.replaceEscapes(part);
          break;
        case 4:
          serviceName = this.replaceEscapes(part);
          serviceInfo = bonjourServiceNameToProtocolInfo(part);
          break;
        case 5:
          break;
        case 6:
          id = part;
          break;
        case 7:
          ipAddress = this.replaceEscapes(part);
          break;
        case 8:
          break;
        case 9:
          serviceText = this.replaceEscapes(part);
          break;
        default:
          break;
      }
    }
    if (ipAddress) {
      // log(
      //   "...name = " + name + ", ipAddress = " + ipAddress + ", id = " + id,
      //   "bonj"
      // );
      // log(
      //   "...ipAddress = " + ipAddress + ", name = " + name + ", id = " + id,
      //   "bonj"
      // );

      const device = this.deviceByIpAddress.get(ipAddress);
      if (device) {
        await this.setDeviceStatus(device, true);
        let services = device.services;
        if (services) {
          let serviceIndex = -1;
          for (let i = 0; i < services.length; i++) {
            if (services[i].serviceName === serviceName) {
              serviceIndex = i;
              break;
            }
          }
          if (serviceIndex === -1) {
            // first seen
            services.push({
              serviceName,
              serviceInfo,
              name,
              id,
              ipAddress,
              serviceText
            });
          } else {
            // replace
            services[serviceIndex] = {
              serviceName,
              serviceInfo,
              name,
              id,
              ipAddress,
              serviceText
            };
          }
        } else {
          services = [];
          services.push({ serviceName, name, id, ipAddress, serviceText });
        }

        device.services = services;
        if (fixupDisplayName) this.fixupDeviceDisplayName(device);
        await this.addUpdateDevice(device);
        log(
          "dev: " +
            JSON.stringify(this.deviceByIpAddress.get(ipAddress), null, 2),
          "bonj"
        );
      }
    }
  }

  bonjourScanImpl(callback) {
    log("NetworkScan.bonjourScanImpl", "bonj");

    this.execAvahiScan = spawn("avahi-browse", [
      "-a",
      "-l",
      "-r",
      "-p",
      "-k",
      "-t"
    ]);

    // give this 5 mins to complete.
    this.avahiScanTimeout = setTimeout(() => {
      if (this.execAvahiScan) {
        log("(Error) killing bonjourScan", "bonj");
        this.execAvahiScan.kill(9);
      }
    }, 5 * 60 * 1000);

    this.execAvahiScan.stdout.on("data", async data => {
      //const str = data.toString().replace(/\r?\n|\r/g, " ");
      const str = data.toString();
      //log("stdout: " + str, "bonj", "verbose");
      this.accumulatedAvahiStr += str;
      //log("-----accum: " + this.accumulatedAvahiStr, "bonj", "verbose");
      if (str[str.length - 1] !== "\n") {
        //log("-----no line termination", "bonj");
        return;
      }
      const lines = this.accumulatedAvahiStr.split("\n");
      // skip last line because it is bogus; the line ends in /n/n.
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        //log("...line[" + i + "]: " + line, "bonj");
        await this.parseAvahiLine(line, false);
      }
      this.accumulatedAvahiStr = "";
    });

    this.execAvahiScan.stderr.on("data", data => {
      const str = data.toString();
      log("stderr: " + str, "bonj", "info");
    });

    this.execAvahiScan.on("exit", code => {
      log(`avahi-browse exited with code ${code}`, "bonj", "info");
      this.execAvahiScan = null;
      clearTimeout(this.avahiScanTimeout);
      this.avahiScanTimeout = null;
      callback();
    });
  }

  bonjourScanHelper() {
    return new Promise((resolve, reject) => {
      this.bonjourScanImpl(() => {
        resolve();
      });
    });
  }

  async bonjourScan() {
    log(">>>bonjourScan", "bonj");
    await this.bonjourScanHelper();
    log("<<<bonjourScan", "bonj");
  }

  watchBonjour() {
    log("NetworkScan.watchBonjour", "bonj");

    this.execAvahiWatchWatch = spawn("avahi-browse", [
      "-a",
      "-l",
      "-r",
      "-p",
      "-k"
    ]);

    this.execAvahiWatchWatch.stdout.on("data", async data => {
      //const str = data.toString().replace(/\r?\n|\r/g, " ");
      const str = data.toString();
      //log("stdout: " + str, "bonj", "verbose");
      this.accumulatedAvahiStr += str;
      //log("-----accum: " + this.accumulatedAvahiStr, "bonj", "verbose");
      if (str[str.length - 1] !== "\n") {
        //log("-----no line termination", "bonj");
        return;
      }
      const lines = this.accumulatedAvahiStr.split("\n");
      // skip last line because it is bogus; the line ends in /n/n.
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        //log("...line[" + i + "]: " + line, "bonj");
        await this.parseAvahiLine(line, true);
      }
      this.accumulatedAvahiStr = "";
    });

    this.execAvahiWatchWatch.stderr.on("data", data => {
      const str = data.toString();
      log("stderr: " + str, "bonj", "info");
    });

    this.execAvahiWatchWatch.on("exit", code => {
      log(`avahi-browse exited with code ${code}`, "bonj", "info");
      this.execAvahiWatchWatch = null;
    });
  }

  watchDevices() {
    log("watchDevices", "nscn", "info");
    this.ipAddresses = [...this.deviceByIpAddress.keys()];
    setInterval(() => {
      this.tryPing(this.ipAddresses[this.nextIpAddressesIndex]);
      this.nextIpAddressesIndex++;
      if (this.nextIpAddressesIndex === this.ipAddresses.length)
        this.nextIpAddressesIndex = 0;
    }, 1500);
  }

  tryPing(ipAddress) {
    // ping -c 1 -W 1 192.168.1.101
    log("tryPing: " + ipAddress, "nscn");

    const exec = spawn("ping", ["-c", "1", "-W", "1", ipAddress]);

    exec.stdout.on("data", data => {
      //const str = data.toString().replace(/\r?\n|\r/g, " ");
      const str = data.toString();
      log("tryPing: " + ipAddress + " stdout: " + str, "nscn", "verbose");
    });

    exec.stderr.on("data", data => {
      const str = data.toString();
      log("tryPing: " + ipAddress + " stderr: " + str, "nscn", "info");
    });

    exec.on("exit", async code => {
      log(
        `tryPing: ${ipAddress} ping exited with code ${code}`,
        "nscn",
        "info"
      );
      const device = this.deviceByIpAddress.get(ipAddress);
      if (device) {
        const prevPingSucceeded = device.pingSucceeded;
        device.pingSucceeded = code === 0;
        if (device.pingSucceeded) {
          device.alive = true;
          device.latestGoodPing = now_local();
        }

        if (prevPingSucceeded !== device.pingSucceeded) {
          if (device.pingSucceeded) {
            // on line and was previously off line.
            if (!device.macAddress) {
              const netListDevice = await this.getDeviceInfoHelper(
                device.ipAddress
              );
              log("tryPing: " + JSON.stringify(netListDevice, null, 2), "nscn");
              device.macAddress = netListDevice.mac;
              device.vendor = netListDevice.vendor;
            }

            if (device.watch) {
              // send alert now.
              await this.sendDeviceStatusAlert(device);
            }
          } else {
            // make sure this isn't a false negative.
            setTimeout(() => {
              this.tryPingAgain(device);
            }, 5 * 1000);
          }
        }

        await this.addUpdateDevice(device);

        if (
          prevPingSucceeded === device.pingSucceeded &&
          !device.pingSucceeded
        ) {
          // offline and was previously offline.
          if (device.latestGoodPing) {
            const latestGoodPingEpoch = Date.parse(device.latestGoodPing);
            log(
              "tryPing: latestGoodPing = " +
                device.latestGoodPing +
                ", epoch = " +
                latestGoodPingEpoch,
              "nscn",
              "verbose"
            );
            if (Date.now() > latestGoodPingEpoch + 30 * 24 * 60 * 60 * 1000) {
              // not seen for 30 days.
              // send alert.
              await this.sendDevicePresenceAlert(device, false);
              // remove from map.
              this.deleteDevice(device);
              // write file.
              await this.writeDevicesToFile();
            }
          }
        }

        this.ipcSend.send(Defs.ipcDeviceUpdated, { device: device });
      }
    });
  }

  async tryPingAgain(device) {
    const ipAddress = device.ipAddress;

    log("tryPingAgain: " + ipAddress, "nscn", "info");

    if (!device.alive || device.pingSucceeded) return;

    let exec = null;
    try {
      exec = spawn("ping", ["-c", "3", "-i", ".5", "-W", "2", ipAddress]);
    } catch (ex) {
      log("(Exception) tryPingAgain: " + ex, "nscn", "error");
      return;
    }

    exec.stdout.on("data", data => {
      //const str = data.toString().replace(/\r?\n|\r/g, " ");
      const str = data.toString();
      log("tryPingAgain: " + ipAddress + " stdout: " + str, "nscn", "verbose");
    });

    exec.stderr.on("data", data => {
      const str = data.toString();
      log("tryPingAgain: " + ipAddress + " stderr: " + str, "nscn", "info");
    });

    exec.on("exit", async code => {
      log(
        `tryPingAgain: ${ipAddress} ping exited with code ${code}`,
        "nscn",
        "info"
      );

      device.pingSucceeded = code === 0;
      if (device.pingSucceeded) {
        device.alive = true;
        device.latestGoodPing = now_local();
      }

      log(
        "tryPingAgain: " + ipAddress + " watch = " + device.watch,
        "nscn",
        "info"
      );
      if (device.watch) {
        if (!device.pingSucceeded) {
          // send alert now.
          await this.sendDeviceStatusAlert(device);
        } else {
          // on line and was previously off line.
          if (!device.macAddress) {
            const netListDevice = await this.getDeviceInfoHelper(
              device.ipAddress
            );
            log(
              "....setDeviceStatus: " + JSON.stringify(netListDevice, null, 2),
              "nscn",
              "verbose"
            );
            device.macAddress = netListDevice.mac;
            device.vendor = netListDevice.vendor;
          }
        }
      }

      await this.addUpdateDevice(device);

      this.ipcSend.send(Defs.ipcDeviceUpdated, { device: device });
    });
  }

  getDeviceInfoHelper(ipAddress) {
    return new Promise((resolve, reject) => {
      netList.getDeviceInfo(ipAddress, (err, arr) => {
        if (err) {
          log("...getDeviceInfoHelper err = " + err, "nscn", "info");
          resolve([]);
        } else resolve(arr);
      });
    });
  }

  async setDeviceStatus(device, onLine) {
    log(
      "setDeviceStatus: " + device.ipAddress + ", online = " + onLine,
      "nscn",
      "info"
    );
    const prevPingSucceeded = device.pingSucceeded;
    if (onLine) device.alive = true;
    device.pingSucceeded = onLine;
    if (onLine) device.latestGoodPing = now_local();

    if (prevPingSucceeded !== onLine) {
      if (onLine && !device.macAddress) {
        const netListDevice = await this.getDeviceInfoHelper(device.ipAddress);
        log(
          "....setDeviceStatus: " + JSON.stringify(netListDevice, null, 2),
          "nscn",
          "verbose"
        );
        device.macAddress = netListDevice.mac;
        device.vendor = netListDevice.vendor;
      }
      //?? 2019-12-14 await this.addUpdateDevice(device);

      if (device.watch) {
        // send alert now.
        await this.sendDeviceStatusAlert(device);
      }
    }
    if (this.allowClientUpdates)
      this.ipcSend.send(Defs.ipcDeviceUpdated, { device: device });
  }

  async sendDeviceIpAddressChangeAlert(device, oldIpAddress) {
    log(
      "sendDeviceIpAddressChangeAlert: " +
        device.ipAddress +
        ", old ipAddress = " +
        oldIpAddress,
      "nscn",
      "info"
    );

    const message =
      "Device " +
      device.displayName +
      ", IP Address changed from " +
      oldIpAddress +
      " to " +
      device.ipAddress;
    const alert = {
      subEventClass: Defs.eventClass_networkDeviceIPAddressChanged,
      subObjectType: Defs.objectType_networkDevice,
      subObjectId: device.ipAddress,
      eventActive: Defs.eventActive_activeAutoInactive,
      message: message
    };
    await this.sendAlert(this.http, alert);
  }

  async sendDevicePresenceAlert(device, added) {
    log("sendDevicePresenceAlert: " + device.ipAddress, "nscn", "info");

    let message = "Device " + device.displayName + " ";
    if (added) message += "added";
    else message += "removed";
    const alert = {
      subEventClass: added
        ? Defs.eventClass_networkDeviceAdded
        : Defs.eventClass_networkDeviceDeleted,
      subObjectType: Defs.objectType_networkDevice,
      subObjectId: device.ipAddress,
      eventActive: Defs.eventActive_activeAutoInactive,
      message: message
    };
    await this.sendAlert(this.http, alert);
  }

  async sendDeviceStatusAlert(device) {
    log("sendDeviceStatusAlert: " + device.ipAddress, "nscn", "info");

    let message = "Device " + device.displayName + " ";
    if (device.pingSucceeded) message += "came online";
    else message += "went offline";
    const alert = {
      subEventClass: Defs.eventClass_networkDeviceStatus,
      subObjectType: Defs.objectType_networkDevice,
      subObjectId: device.ipAddress,
      eventActive: device.pingSucceeded
        ? Defs.eventActive_inactive
        : Defs.eventActive_active,
      message: message
    };
    await this.sendAlert(this.http, alert);
  }

  trySnmp(ipAddress) {
    log(">>>trySnmp: " + ipAddress, "snmp", "info");

    try {
      const options = {
        port: 161,
        retries: 1,
        timeout: 5000,
        transport: "udp4",
        trapPort: 162,
        version: snmp.Version2c,
        idBitsSize: 16
      };
      const session = snmp.createSession(ipAddress, "public", options);

      const oids = ["1.3.6.1.2.1.1.5.0", "1.3.6.1.2.1.1.6.0"];

      session.get(oids, function(error, varbinds) {
        if (error) {
          log(
            "(Error) trySnmp [" + ipAddress + "]  session.get: " + error,
            "snmp",
            "error"
          );
          //console.error(error);
        } else {
          for (var i = 0; i < varbinds.length; i++)
            if (snmp.isVarbindError(varbinds[i])) {
              log(
                "(Error) trySnmp [" +
                  ipAddress +
                  "] session.get - isVarbindError: " +
                  snmp.varbindError(varbinds[i]),
                "snmp",
                "error"
              );
              //console.error(snmp.varbindError(varbinds[i]));
            } else {
              log(
                "trySnmp [" +
                  ipAddress +
                  "] : " +
                  varbinds[i].oid +
                  " = " +
                  varbinds[i].value,
                "snmp",
                "info"
              );
              //console.log(varbinds[i].oid + " = " + varbinds[i].value);
            }
        }

        // If done, close the session
        session.close();
      });
      session.on("error", function(error) {
        console.log("trySnmp on error");
        console.log(error.toString());
        session.close();
      });
    } catch (ex) {
      log("(Exception) trySnmp: " + ex, "snmp", "error");
    }
    log("<<<trySnmp", "snmp", "info");
  }

  periodicWriteDevicesToFile() {
    setInterval(async () => {
      log(">>>periodicWriteDevicesToFile", "nscn", "info");
      await this.writeDevicesToFile();
      log("<<<periodicWriteDevicesToFile", "nscn", "info");
    }, 5 * 60 * 1000);
  }

  dumpDeviceTable() {
    log(">>>dumpDeviceTable", "nscn", "info");
    for (const [ipAddress, device] of this.deviceByIpAddress.entries()) {
      log("dev: " + JSON.stringify(device, null, 2), "nscn", "info");
    }
    log("<<<dumpDeviceTable", "nscn", "info");
  }

  getDeviceTable(aliveOnly) {
    let devices = [];
    for (const [ipAddress, device] of this.deviceByIpAddress.entries()) {
      if (!aliveOnly || device.alive) devices.push(device);
    }
    return { devices: devices };
  }

  async putDeviceTable(deviceChanges) {
    log(
      "putDeviceTable: deviceChanges = " +
        JSON.stringify(deviceChanges, null, 2),
      "nscn",
      "info"
    );
    try {
      const device = this.deviceByIpAddress.get(deviceChanges.ipAddress);
      if (device) {
        if (deviceChanges.comment) device.comment = deviceChanges.comment;
        if (deviceChanges.watch !== undefined)
          device.watch = deviceChanges.watch;
        await this.addUpdateDevice(device);
        await this.writeDevicesToFile();
        return { device: device };
      }
    } catch (ex) {
      log("(Exception) putDeviceTable: " + ex, "nscn", "info");
      return handleError(
        Defs.objectType_networkDevice,
        "unknown",
        Defs.statusException,
        ex.message
      );
    }
  }

  async deleteLocalNetworkDevicesFile() {
    while (this.writing) await sleep(250);
    this.writing = true;
    try {
      await fileDeleteAsync(this.localNetworkDevicesPath, true);
    } catch (ex) {
      log("(Exception) deleteLocalNetworkDevicesFile: " + ex, "nscn", "info");
    }
    this.writing = false;
  }

  enableLocalNetworkDevicesFileWrite(enable) {
    this.writeEnabled = enable;
  }
}

async function deleteLocalNetworkDevicesFile() {
  await networkScan.deleteLocalNetworkDevicesFile();
}

function enableLocalNetworkDevicesFileWrite(enable) {
  networkScan.enableLocalNetworkDevicesFileWrite(enable);
}

module.exports = {
  NetworkScan,
  deleteLocalNetworkDevicesFile,
  enableLocalNetworkDevicesFileWrite
};
