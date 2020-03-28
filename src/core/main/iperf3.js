const { spawn } = require("child_process");
const path = require("path");
const electron = require("electron");

const { log } = require("iipzy-shared/src/utils/logFile");
const { fileChmodAsync } = require("iipzy-shared/src/utils/fileIO");

let iperf3Path = null;
let needChmod = true;

function getIsDev() {
  const app = electron.app;
  const isEnvSet = "ELECTRON_IS_DEV" in process.env;
  const getFromEnv = parseInt(process.env.ELECTRON_IS_DEV, 10) === 1;

  return isEnvSet ? getFromEnv : !app || !app.isPackaged;
}

const isDev = getIsDev();

class Iperf3 {
  constructor(platformInfo, dataFunc, doneFunc, server, port, durationSeconds, down) {
    log("...iperf3 constructor, server = " + server, "iprf", "info");
    this.platformInfo = platformInfo;
    this.dataFunc = dataFunc;
    this.doneFunc = doneFunc;
    this.server = server;
    this.port = port;
    this.durationSeconds = durationSeconds;
    this.down = down;

    this.exec = null;
    this.avgThoughputMBits = 0;

    this.stdoutLine = "";

    switch (this.platformInfo.platform) {
      case "darwin": {
        if (isDev) {
          iperf3Path = path.resolve(__dirname, "../../extraResources/mac/iperf3");
          needChmod = false;
        } else {
          iperf3Path = path.join(process.resourcesPath, "iperf3");
        }
        break;
      }
      case "linux": {
        iperf3Path = "iperf3";
        needChmod = false;
        break;
      }
      case "win32": {
        if (isDev) iperf3Path = path.resolve(__dirname, "../../extraResources/win/iperf3.exe");
        else iperf3Path = path.join(process.resourcesPath, "iperf3.exe");
        needChmod = false;
        break;
      }
    }
    log("iperf3 constructor: iperf3Path = " + iperf3Path + ", isDev = " + isDev, "iprf", "info");
  }

  parseString(str) {
    let nonBlankParts = [];
    let sparts = str.split(" ");
    for (let i = 0; i < sparts.length; i++) {
      if (sparts[i] != "") {
        nonBlankParts.push(sparts[i]);
      }
    }

    return nonBlankParts;
  }

  handleIperf3ThroughputBlob(stdout) {
    //log("...handleIperf3ThroughputBlob: stdout = '" + stdout + "'", "iprf", "info");
    const strs = stdout.split("\n");
    for (let s = 0; s < strs.length; s++) {
      const str = strs[s];
      if (str.startsWith("[SUM]") && (!str.endsWith("sender") || str.endsWith("sender\n"))) {
        let mbitsPerSec = 0;
        let isTotal = false;
        let sparts = this.parseString(str);
        for (let i = 0; i < sparts.length; i++) {
          let spart = sparts[i];
          //??
          //log("...handleIperf3ThroughputBlob: part[" + i + '] = "' + spart + '"', "iprf", "info");
          if (i == 5) {
            if (sparts[6] === "Gbits/sec") {
              mbitsPerSec = Number(spart) * 1000;
            } else if (sparts[6] === "Kbits/sec") {
              mbitsPerSec = Number(spart) / 1000;
            } else mbitsPerSec = Number(spart);
          }
        }
        if (str.endsWith("receiver") || str.endsWith("receiver\n")) {
          isTotal = true;
          this.avgThoughputMBits = mbitsPerSec;
        }
        let json = '{"down":' + this.down;
        json += ',"mbitsPerSec":' + mbitsPerSec;
        json += ',"isTotal":' + isTotal;
        json += "}";
        //log('...handleIperf3ThroughputBlob: json = "' + json + '"', "iprf", "info");
        this.dataFunc(json);
      }
    }
  }

  async run() {
    log("...iperf3 run, server = " + this.server, "iprf", "info");

    if (needChmod) {
      await fileChmodAsync(iperf3Path, 0o755);
      needChmod = false;
    }

    const reverseParam = this.down ? "-R" : "";
    const args = [
      "-c",
      this.server,
      "-p",
      this.port,
      "-t",
      this.durationSeconds,
      "-P",
      "10",
      reverseParam,
      "--connect-timeout",
      "5000",
      "--forceflush"
    ];

    log("iperf3 args: " + args, "iprf", "info");

    this.exec = spawn(iperf3Path, args);

    this.exec.stdout.on("data", data => {
      const str = data.toString();

      //log("stdout-str: '" + str + "'", "iprf", "info");

      if (str[str.length - 1] != "\n") {
        this.stdoutLine += str;
        return;
      } else this.stdoutLine += str;

      //log("stdout: '" + this.stdoutLine + "'", "iprf", "info");
      this.handleIperf3ThroughputBlob(this.stdoutLine);
      this.stdoutLine = "";
    });

    this.exec.stderr.on("data", data => {
      log("stderr: " + data.toString(), "iprf", "info");
    });

    this.exec.on("exit", code => {
      log(`Iperf3 exited with code ${code}`, "iprf", "info");
      // return code so that retry can be done in caller.
      if (this.doneFunc) this.doneFunc(code, this.avgThoughputMBits);
    });
  }

  cancel() {
    if (this.exec) this.exec.kill(9);
  }
}

module.exports = Iperf3;
