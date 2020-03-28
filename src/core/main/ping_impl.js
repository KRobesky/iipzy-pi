const { spawn } = require("child_process");

const { log } = require("iipzy-shared/src/utils/logFile");

let doSimulateDroppedPackets = false;

class Ping {
  constructor(title, dataFunc, doneFunc, target, durationSeconds, intervalSeconds) {
    log(
      "ping.constructor: title = " +
        title +
        ", target = " +
        target +
        ", duration = " +
        durationSeconds +
        ", interval " +
        intervalSeconds,
      "ping",
      "info"
    );
    this.dataFunc = dataFunc;
    this.doneFunc = doneFunc;
    this.target = target;
    this.title = title;
    this.durationSeconds = durationSeconds ? durationSeconds : 0;
    this.intervalSeconds = intervalSeconds ? intervalSeconds : 1;
    this.exec = null;
    this.cancelled = false;
    this.totalSamples = 0;
    this.totalTimeMillis = 0;
    this.totalDroppedPackets = 0;

    this.interval = null;
    this.timeout = null;
    this.inSendPingSample = false;
    this.currentSample = {};
    this.latestPingTime = 0;
    this.dropCheckEnabled = false;

    this.stdoutLine = "";
  }

  // NB:  Had a case where ping did not respond for a number of minutes.  This caused the
  //      previous packet to be resent with a new timestamp.
  //      We should be indicating dropped packets in this case.
  //      Solution:
  //        1.  Need a timestamp of the latest response from ping.
  //        2.  If too old, send packets as dropped.
  //            - Too old is probably 5 seconds - 5 missed pings

  startSendPingSample() {
    this.latestPingTime = 0;
    this.dropCheckEnabled = false;
    this.interval = setInterval(() => {
      if (!this.inSendPingSample) {
        this.inSendPingSample = true;
        try {
          const now = Date.now();
          log(
            "ping.sendPingSample: now = " + now + ", latest = " + this.latestPingTime,
            "ping",
            "info"
          );
          if (this.currentSample.timeMillis !== undefined) {
            this.currentSample.timeStamp = new Date().toISOString();
            if (this.dropCheckEnabled && now > this.latestPingTime + 10 * 1000) {
              log("ping.sendPingSample: no new ping sample for 10 seconds", "ping", "info");
              this.currentSample.timeMillis = "0";
              this.currentSample.dropped = true;
            }
          }
          this.dataFunc(JSON.stringify(this.currentSample));
        } catch (ex) {
          log("(Exception) ping.sendPingSample: " + ex, "ping", "error");
        }
        this.inSendPingSample = false;
      }
    }, this.intervalSeconds * 1000);
    // wait 30 seconds before checking missed ping responses.
    this.timeout = setTimeout(() => {
      this.dropCheckEnabled = true;
    }, 30 * 1000);
  }

  stopSendPingSample() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  parsePingLineWin(str) {
    // log("...parsePingLineWin: " + str, "ping", "info");
    // Reply from 216.218.227.10: bytes=32 time=28ms TTL=57
    if (str.startsWith("Reply from")) {
      let left = str.indexOf("time=");
      if (left != -1) {
        left += 5;
        const right = str.indexOf("ms", left);
        const time = str.substring(left, right);
        this.totalSamples++;
        this.totalTimeMillis += Number(time);
        // return (
        //   '{"timeMillis":' +
        //   time +
        //   ',"dropped":false, "timeStamp": "' +
        //   new Date().toISOString() +
        //   '"}'
        // );
        return { timeMillis: time, dropped: false };
      }
    } else if (str.startsWith("Request timed out")) {
      log("dropped:" + str, "ping", "info");
      this.totalDroppedPackets++;
      // return (
      //   '{"timeMillis":' +
      //   0 +
      //   ',"dropped":true, "timeStamp": "' +
      //   new Date().toISOString() +
      //   '"}'
      // );
      return { timeMillis: "0", dropped: true };
    }
    return {};
  }

  parsePingLineMac(str) {
    // log("...parsePingLineMac = " + str, "ping", " info");
    // 64 bytes from 172,217,2,238: icmp_seq=0 ttl=50 time=42.453 ms
    if (str.startsWith("64 bytes from")) {
      let left = str.indexOf("time=");
      if (left != -1) {
        left += 5;
        const right = str.indexOf(" ms", left);
        const time = str.substring(left, right);
        this.totalSamples++;
        this.totalTimeMillis += Number(time);
        return { timeMillis: time, dropped: false };
        // return (
        //   '{"timeMillis":' +
        //   time +
        //   ',"dropped":false, "timeStamp": "' +
        //   new Date().toISOString() +
        //   '"}'
        // );
      }
    } else if (
      str.startsWith("Request timed out") ||
      str.indexOf("Destination Host Unreachable") !== -1
    ) {
      this.totalDroppedPackets++;
      return { timeMillis: "0", dropped: true };
      // return (
      //   '{"timeMillis":' +
      //   0 +
      //   ',"dropped":true, "timeStamp": "' +
      //   new Date().toISOString() +
      //   '"}'
      // );
    }
    return {};
  }

  run() {
    this.totalSamples = 0;
    this.totalTimeMillis = 0;
    this.totalDroppedPackets = 0;
    this.inSendPingSample = false;
    this.currentSample = {};
    this.stdoutLine = "";

    switch (process.platform) {
      case "darwin": {
        if (this.intervalSeconds === 0) this.exec = spawn("ping", [this.target]);
        else this.exec = spawn("ping", [this.target]);
        break;
      }
      case "linux": {
        this.exec = spawn("ping", [this.target]);
        break;
      }
      case "win32": {
        this.exec = spawn("ping", [this.target, "-t", "-w", "750"]);
        break;
      }
    }

    if (this.durationSeconds !== 0)
      setTimeout(() => {
        this.exec.kill(9);
      }, this.durationSeconds * 1000);

    this.startSendPingSample();

    this.exec.stdout.on("data", data => {
      const str = data.toString();
      if (str[str.length - 1] != "\n") {
        this.stdoutLine += str;
        return;
      } else this.stdoutLine += str;

      this.latestPingTime = Date.now();
      //
      log("ping - stdout(" + this.latestPingTime + "): " + this.stdoutLine, "ping", "info");
      //log("ping - platform: " + process.platform, "ping", "info");
      if (!doSimulateDroppedPackets) {
        let newSample = this.currentSample;
        switch (process.platform) {
          case "darwin": {
            newSample = this.parsePingLineMac(this.stdoutLine);
            break;
          }
          case "linux": {
            newSample = this.parsePingLineMac(this.stdoutLine);
            break;
          }
          case "win32": {
            newSample = this.parsePingLineWin(this.stdoutLine);
            break;
          }
        }
        if (newSample.timeMillis !== undefined) this.currentSample = newSample;
      } else {
        this.totalDroppedPackets++;
        this.currentSample = { timeMillis: "0", dropped: true };
        // '{"timeMillis":' +
        // 0 +
        // ',"dropped":true, "timeStamp": "' +
        // new Date().toISOString() +
        // '"}';
      }

      this.stdoutLine = "";
    });

    this.exec.stderr.on("data", data => {
      log("stderr: " + data.toString(), "ping", "info");
    });

    this.exec.on("exit", code => {
      log(`Ping exited with code ${code}`, "ping", "info");

      this.stopSendPingSample();

      if (code !== 0 && this.durationSeconds === 0 && !this.cancelled) {
        // restart.
        log("Ping restarting in 10 seconds", "ping", "info");
        setTimeout(() => {
          this.run();
        }, 10 * 1000);
        return;
      }

      const avgMillis = this.totalSamples === 0 ? 0 : this.totalTimeMillis / this.totalSamples;
      if (this.doneFunc) {
        const json =
          '{"avgMillis":' +
          avgMillis +
          ', "droppedPackets":' +
          this.totalDroppedPackets +
          ',"timeStamp": "' +
          Date.now() +
          '"}';
        this.doneFunc(code, json);
      }
    });
  }

  cancel() {
    if (this.exec) {
      this.cancelled = true;
      this.exec.kill(9);
    }
  }

  getSimulateDroppedPackets() {
    log("Ping getSimulateDroppedPackets: state = " + doSimulateDroppedPackets, "ping", "info");
    return doSimulateDroppedPackets;
  }

  setSimulateDroppedPackets(state) {
    doSimulateDroppedPackets = state;
    log("Ping setSimulateDroppedPackets: state = " + doSimulateDroppedPackets, "ping", "info");
    return doSimulateDroppedPackets;
  }
}

module.exports = Ping;
