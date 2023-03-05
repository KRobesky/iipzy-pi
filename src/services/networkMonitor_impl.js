const { spawn } = require("child_process");

const { log } = require("iipzy-shared/src/utils/logFile");
const { spawnAsync } = require("iipzy-shared/src/utils/spawnAsync");
const { sleep } = require("iipzy-shared/src/utils/utils");

const {
  NetworkScan,
  deleteLocalNetworkDevicesFile,
  enableLocalNetworkDevicesFileWrite
} = require("./networkScan");

const { getGatewayIp, getPrivateIp, getPublicIp } = require("../utils/networkInfo");

let networkMonitor = null;

class NetworkMonitor {
  constructor(context) {
    log("NetworkMonitor.constructor", "nmon", "info");

    this.gatewayIPAddress = context._gatewayIPAddress;
    this.http = context._http;
    this.localIPAddress = context._localIPAddress;
    this.publicIPAddress = context._publicIPAddress;

    this.consecutiveGatewayPingFailures = 0;

    networkMonitor = this;

    this.dnsRequestMap = new Map();

    this.execDns = null;
    this.execDhcp = null;

    this.networkScan = new NetworkScan(context);

    // check local address once a minute.
    setInterval(async () => {
      await this.checkIPAddresses();
    }, 60 * 1000);
  }

  async checkIPAddresses() {
    log(">>>NetworkMonitor.checkIPAddresses", "nmon", "info");

    const publicIPAddress = await getPublicIp(this.http);
    if (publicIPAddress !== this.publicIPAddress) {
      // changed.  Restart sentinel.
      log(
        "NetworkMonitor.checkIPAddresses - publicIPAddress changed: old = " +
          this.publicIPAddress +
          ", new = " +
          publicIPAddress,
        "nmon",
        "info"
      );
      log("Rebooting appliance in 5 seconds", "nmon", "info");
      setTimeout(() => {
        //process.exit(99);
        spawn("sudo", ["reboot"]);
      }, 5 * 1000);
    }

    const ok = await this.tryPing(this.gatewayIPAddress);
    if (!ok) {
      this.consecutiveGatewayPingFailures++;
      if (this.consecutiveGatewayPingFailures > 5) {
        // five minutes without success.
        log(
          "(Error) NetworkMonitor.checkIPAddresses.  Can't ping gateway.  Rebooting appliance in 5 seconds",
          "nmon",
          "error"
        );
        setTimeout(() => {
          //process.exit(99);
          spawn("sudo", ["reboot"]);
        }, 5 * 1000);
      }
    } else this.consecutiveGatewayPingFailures = 0;

    const localIPAddress = await getPrivateIp();
    log("NetworkMonitor.checkIPAddresses: localIPAddress = " + localIPAddress, "nmon", "info");
    if (localIPAddress !== "0.0.0.0") {
      if (localIPAddress !== this.localIPAddress) {
        // changed.  Restart sentinel.
        log(
          "NetworkMonitor.checkIPAddresses - localIPAddress changed: old = " +
            this.localIPAddress +
            ", new = " +
            localIPAddress,
          "nmon",
          "info"
        );
        log("NetworkMonitor.checkIPAddresses: restarting in 5 seconds", "nmon", "info");
        setTimeout(() => {
          process.exit(95);
        }, 5 * 1000);
      }
    }
    log("<<<NetworkMonitor.checkIPAddresses", "nmon", "info");
  }

  async tryPing(ipAddress) {
    // ping -c 1 -W 1 192.168.1.101
    const { code } = await spawnAsync("ping", ["-c", "1", "-W", "1", ipAddress]);
    log("NetworkMonitor.tryPing: " + ipAddress + ", code = " + code, "nmon");

    return code === 0;
  }
  /*
  see:https://nil.uniza.sk/using-tcpdump-diagnostics-dns-debian/

  info  [nmon] -----
  info  [nmon] IP 192.168.1.189.57116 > 192.168.1.1.53: 5049+ A? xxx.xxx.xxx. (34)

					src > dst: id op? flags qtype qclass name (len)
  info  [nmon] [0] IP
  info  [nmon] [1] 192.168.1.189.57116	src
  info  [nmon] [2] >
  info  [nmon] [3] 192.168.1.1.53:		dst
  info  [nmon] [4] 5049+					id
  info  [nmon] [5] A?					qtype
  info  [nmon] [6] xxx.xxx.xxx.		name
  info  [nmon] [7] (34)
  info  [nmon] -----
  info  [nmon] IP 192.168.1.1.53 > 192.168.1.189.57116: 5049 1/13/0 A 123.456.789.123 (271)

					src > dst:  id op rcode flags a/n/au type class data (len)
												  a = the number of answer records
												    n = the number of server records
													  au = the number of additional records
  info  [nmon] [0] IP
  info  [nmon] [1] 192.168.1.1.53		src
  info  [nmon] [2] >
  info  [nmon] [3] 192.168.1.189.57116:	dst
  info  [nmon] [4] 5049					id
  info  [nmon] [5] 1/13/0				a/n/au
  info  [nmon] [6] A						type
  info  [nmon] [7] 123.456.789.123
  info  [nmon] [8] (271)
  info  [nmon] -----
  info  [nmon] IP 192.168.1.111.52419 > 192.168.1.1.53: 25152+ A? bose2.vtuner.com. (34)
  info  [nmon] [0] IP
  info  [nmon] [1] 192.168.1.111.52419
  info  [nmon] [2] >
  info  [nmon] [3] 192.168.1.1.53:
  info  [nmon] [4] 25152+
  info  [nmon] [5] A?
  info  [nmon] [6] bose2.vtuner.com.
  info  [nmon] [7] (34)
  info  [nmon] -----
  */

  handleRequest(timestamp, requestId, reqName) {
    //log(timestamp + " req: " + requestId + ", name = " + reqName, "nmon", "info");

    this.dnsRequestMap.set(requestId, { startTimestamp: timestamp, reqName });
  }

  ipAddressFromRequestId(requestId) {
    // 192.168.1.189.57266:53388
    const r = requestId.lastIndexOf(".");
    if (r !== -1) return requestId.substring(0, r);
    return null;
  }

  handleResponse(timestamp, requestId, rspAddr) {
    //log(timestamp + " rsp: " + requestId + ", addr = " + rspAddr, "nmon", "info");

    const data = this.dnsRequestMap.get(requestId);
    if (data) {
      const { startTimestamp, reqName } = data;
      let displayName = "?";
      const ipAddress = this.ipAddressFromRequestId(requestId);
      if (ipAddress) displayName = this.networkScan.getDisplayName(ipAddress);
      log(
        "dns: from = " + displayName + ", id = " + requestId + ", " + reqName + " => " + rspAddr,
        "nmon",
        "info"
      );
      this.dnsRequestMap.delete(requestId);
    }
  }

  decodeDNSPacket(packet) {
    const fields = packet.split(" ");
    let f = 0;

    let timestamp = null;
    let src = null;
    let dst = null;
    let id = null;
    let isRequest = false;
    let requestId = null;
    let reqName = null;
    let rspAddr = null;

    for (let i = 0; i < fields.length; i++) {
      //log("[" + i + ", " + f + "] fld " + fields[i], "nmon", "info");
      switch (f) {
        case 0: {
          //log("[" + i + ", " + f + "] tim " + fields[i], "nmon", "info");
          timestamp = fields[i];
          break;
        }
        case 2: {
          //log("[" + i + ", " + f + "] src " + fields[i], "nmon", "info");
          src = fields[i];
          break;
        }
        case 4: {
          //log("[" + i + ", " + f + "] dst " + fields[i], "nmon", "info");
          const n = fields[i].indexOf(":");
          dst = fields[i].substring(0, n);
          break;
        }
        case 5: {
          //log("[" + i + ", " + f + "] id  " + fields[i], "nmon", "info");
          const n = fields[i].indexOf("+");
          if (n !== -1) {
            isRequest = true;
            id = fields[i].substring(0, n);
            requestId = src + ":" + id;
          } else {
            isRequest = false;
            id = fields[i];
            requestId = dst + ":" + id;
          }
          //log("req = " + isRequest + ", requestId = " + requestId, "nmon", "info");
          break;
        }
        case 7: {
          if (isRequest) {
            //log("req name = " + fields[i], "nmon", "info");
            reqName = fields[i];
          } else {
            if (fields[i] === "A") {
              //log("rsp addr = " + fields[i + 1], "nmon", "info");
              let addr = fields[i + 1];
              const n = addr.indexOf(",");
              if (n !== -1) addr = addr.substring(0, n);
              if (rspAddr === null) rspAddr = addr;
              else rspAddr += "," + addr;
            }
          }
          break;
        }
        default: {
          if (!isRequest && fields[i] === "A") {
            //log("rsp addr = " + fields[i + 1], "nmon", "info");
            let addr = fields[i + 1];
            const n = addr.indexOf(",");
            if (n !== -1) addr = addr.substring(0, n);
            if (rspAddr === null) rspAddr = addr;
            else rspAddr += "," + addr;
          }
          break;
        }
      }
      //if (i > 0 && fields[i].indexOf("IP") !== -1) {
      if (fields[i].indexOf("(") !== -1 && fields[i].indexOf(")") !== -1) {
        f = 0;
        if (isRequest) this.handleRequest(timestamp, requestId, reqName);
        else this.handleResponse(timestamp, requestId, rspAddr);
        //
        timestamp = null;
        src = null;
        dst = null;
        id = null;
        isRequest = false;
        requestId = null;
        reqName = null;
        rspAddr = null;
      } else {
        f++;
      }
    }
    if (requestId != null) {
      if (isRequest) this.handleRequest(timestamp, requestId, reqName);
      else this.handleResponse(timestamp, requestId, rspAddr);
    }
  }

  async start(device, filter) {
    log("NetworkMonitor.start: device = " + device + ", filter = " + filter, "nmon", "info");

    await this.networkScan.scan();

    this.watchDns();

    this.watchDhcp();
  }

  watchDns() {
    log("NetworkScan.watchDns", "nmon");
    this.execDns = spawn("sudo", [
      "tcpdump",
      "udp",
      "port",
      "53",
      "-i",
      "eth1",
      "-n",
      "-l",
      "-v",
      "--immediate-mode"
    ]);

    this.execDns.stdout.on("data", data => {
      const str = data.toString().replace(/\r?\n|\r/g, " ");
      log("watchDns.stdout: " + str, "nmon", "info");
      //log("-----", "nmon", "info");
      //log(str, "nmon", "info");
      this.decodeDNSPacket(str);
      // const strs = str.split(" ");
      // for (let i = 0; i < strs.length; i++)
      //   log("[" + i + "] " + strs[i], "nmon", "info");
    });

    this.execDns.stderr.on("data", data => {
      const str = data.toString();
      log("watchDns.stderr: " + str, "nmon", "info");
    });

    this.execDns.on("exit", code => {
      log(`watchDns tcpdump exited with code ${code}`, "nmon", "info");
      this.execDns = null;
    });
  }

  stop() {
    if (this.execDns) this.execDns.kill(9);
    if (this.execDhcp) this.execDhcp.kill(9);
  }

  watchDhcp() {
    log("NetworkScan.watchDhcp", "nmon");
    this.execDhcp = spawn("sudo", [
      "tcpdump", 
      "udp", 
      "port", 
      "67", 
      "-i",
      "eth1",
      "-v",
      "--immediate-mode"
    ]);

    this.execDhcp.stdout.on("data", data => {
      //const str = data.toString().replace(/\r?\n|\r/g, " ");
      const str = data.toString();
      //str = str = str.replace(/\r?\n|\r/g, "");
      log("watchDhcp.stdout: " + str, "nmon", "verbose");
      //log("-----", "dhcp");
      //log(str, "dhcp");
      //this.decodeDNSPacket(str);
      // const strs = str.split(" ");
      // for (let i = 0; i < strs.length; i++)
      //   log("[" + i + "] " + strs[i], "dhcp");
    });

    this.execDhcp.stderr.on("data", data => {
      const str = data.toString();
      log("watchDhcp.stderr: " + str, "nmon", "info");
    });

    this.execDhcp.on("exit", code => {
      log(`watchDhcp tcpdump exited with code ${code}`, "nmon", "info");
      this.execDhcp = null;
    });
  }

  dumpDeviceTable() {
    this.networkScan.dumpDeviceTable();
  }

  getDeviceTable(aliveOnly) {
    return this.networkScan.getDeviceTable(aliveOnly);
  }

  putDeviceTable(deviceChanges) {
    return this.networkScan.putDeviceTable(deviceChanges);
  }
}

function getDeviceTable(aliveOnly) {
  return networkMonitor.getDeviceTable(aliveOnly);
}

async function putDeviceTable(deviceChanges) {
  return await networkMonitor.putDeviceTable(deviceChanges);
}

module.exports = {
  NetworkMonitor,
  deleteLocalNetworkDevicesFile,
  enableLocalNetworkDevicesFileWrite,
  getDeviceTable,
  putDeviceTable
};
