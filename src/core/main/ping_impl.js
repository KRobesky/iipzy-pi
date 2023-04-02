const { spawn } = require("child_process");

const { log } = require("iipzy-shared/src/utils/logFile");
const { spawnAsync } = require("iipzy-shared/src/utils/spawnAsync");

let doSimulateDroppedPackets = false;

class Ping {
  constructor(title, dataFunc, doneFunc, target, durationSeconds, intervalSeconds, wantNetRate) {
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
    this.title = title;
    this.dataFunc = dataFunc;
    this.doneFunc = doneFunc;
    this.target = target;
    this.durationSeconds = durationSeconds ? durationSeconds : 0;
    this.intervalSeconds = intervalSeconds ? intervalSeconds : 1;
    this.wantNetRate = wantNetRate ? wantNetRate : false;
    
    this.cancelled = false;

    // ping
    this.exec = null;
    this.totalSamples = 0;
    this.totalTimeMillis = 0;
    this.totalDroppedPackets = 0;
    this.ping_interval = null;
    this.timeout = null;
    this.inSendPingSample = false;
    this.cur_ping_sample = {};
    this.latestPingTime = 0;
    this.dropCheckEnabled = false;

    // netrate
    this.netrate_interval = null
    this.cur_netrate_sample = {};
    this.cur_netrate_value = {};
    this.initNetRateSample(this.cur_netrate_sample);
 
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
    this.ping_interval = setInterval(() => {
      if (!this.inSendPingSample) {
        this.inSendPingSample = true;
        try {
          const now = Date.now();
          log(
            "ping.sendPingSample: now = " + now + ", latest = " + this.latestPingTime,
            "ping",
            "info"
          );
          if (this.cur_ping_sample.timeMillis !== undefined) {
            this.cur_ping_sample.timeStamp = new Date().toISOString();
            if (this.dropCheckEnabled && now > this.latestPingTime + 10 * 1000) {
              log("ping.sendPingSample: no new ping sample for 10 seconds", "ping", "info");
              this.cur_ping_sample.timeMillis = "0";
              this.cur_ping_sample.dropped = true;
            }
          }
          //log("ping.sendPingSample: cur_netrate_value = " + JSON.stringify(this.cur_netrate_value));
          /*
          rx_rate_bits : parseInt(0),
          rx_new_errors : parseInt(0),
          rx_new_dropped : parseInt(0),
          tx_rate_bits : parseInt(0),
          tx_new_errors : parseInt(0),
          tx_new_dropped : parseInt(0)
          */
          if (this.wantNetRate) {
            // consolidate ping and netrate
            let consolidatedSample = this.cur_ping_sample;        
            consolidatedSample.rx_rate_bits = this.cur_netrate_value.rx_rate_bits;
            consolidatedSample.tx_rate_bits = this.cur_netrate_value.tx_rate_bits;
            //log("ping.sendPingSample: consolidatedSample" + JSON.stringify(consolidatedSample), "ping", "error");
            this.dataFunc(JSON.stringify(consolidatedSample));
          } else {
            //log("ping.sendPingSample: consolidatedSample" + JSON.stringify(consolidatedSample), "ping", "error");
            this.dataFunc(JSON.stringify(this.cur_ping_sample));
          }
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
    if (this.ping_interval) {
      clearInterval(this.ping_interval);
      this.ping_interval = null;
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  /*
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
  */

  parsePingLineLinux(str) {
    // log("...parsePingLineLinux = " + str, "ping", " info");
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
    this.cur_ping_sample = {};
    this.stdoutLine = "";

    this.exec = spawn("ping", [this.target]);

    if (this.durationSeconds !== 0)
      setTimeout(() => {
        this.exec.kill(9);
      }, this.durationSeconds * 1000);

    this.startSendPingSample();
    this.startSendNetRateSample();

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
        let newSample = this.parsePingLineLinux(this.stdoutLine);
        if (newSample.timeMillis !== undefined) this.cur_ping_sample = newSample;
      } else {
        this.totalDroppedPackets++;
        this.cur_ping_sample = { timeMillis: "0", dropped: true };
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
      this.stopSendNetRateSample();

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

  async ping(intf, target, timeoutSecs) {
      log(
        "ping.ping(" + this.title + ") intf = " + 
          intf +
          ", target = " +
          target +
          ", timeoutSecs = " +
          timeoutSecs,
        "ping",
        "info"
      );

    try {
      //??const { stdout, stderr } = await spawnAsync("ping", [target, "-I", intf, "-c", "1", "-w", timeoutSecs]);
      const { stdout, stderr } = await spawnAsync("ping", [target, "-c", "1", "-w", timeoutSecs]);
      //log("ping.ping: " + stdout, "ping", "info");
      if (stderr) {
        log("(Error) ping.ping: " + stderr, "ping", "error");
        return null;
      }

      const lines = stdout.split('\n');
      /*
      for (let i =0; i < lines.length; i++) {
        log("...ping line=" + lines[i]);
      }
      */
  
      return this.parsePingLineLinux(lines[1]);
    } catch(ex) {
      log("(Exception) ping.ping: " + ex, "ping", "error");
      return null;
    }
  }
 
  // netrate
  
  initNetRateSample(sample) {
    sample = {
      sample_time : null,
      rx_bytes : parseInt(0),
      rx_errors : parseInt(0),
      rx_dropped : parseInt(0),
      tx_bytes : parseInt(0),
      tx_errors : parseInt(0),
      tx_dropped : parseInt(0)
    }
  }
  
  startSendNetRateSample() {
    if (this.wantNetRate) {
      this.getRxTxData();
      this.netrate_interval = setInterval(() => {
        this.getRxTxData(); 
      }, this.intervalSeconds * 1000);  
    }
  }

  stopSendNetRateSample() {
    if (this.netrate_interval) {
      clearInterval(this.netrate_interval);
      this.netrate_interval = null;
    }
  }

  getRxTxData() {
    log("NetRate.getRxTxRate", "rate", "info");

    if (this.cancelled) return;

    const exec = spawn("sudo", ["ip", "-s", "link", "show", "eth0"]);

    exec.stdout.on("data", data => {
      /*
        returns:
          2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq master br-lan state UP mode DEFAULT group default qlen 1000
              link/ether 68:27:19:ac:a8:fd brd ff:ff:ff:ff:ff:ff
              RX:  bytes  packets errors dropped  missed   mcast
              8632770553 13374010      4       0       0       0
              TX:  bytes  packets errors dropped carrier collsns
              6468249098  8463484      0       0       0       0
      */

      const lines = data.toString().split('\n');

      let new_sample = {};
      this.initNetRateSample(new_sample);
      new_sample.sample_time = Date.now();
      
      let i = 0;
      for (var line in lines) {
        if (line == 3) {
          const fields = lines[3].replace(/\s\s+/g, ' ').split(' ');
          new_sample.rx_bytes = parseInt(fields[1], 10);
          new_sample.rx_errors = parseInt(fields[3], 10);
          new_sample.rx_dropped = parseInt(fields[4], 10);
        } if (line == 5) {
          const fields = lines[5].replace(/\s\s+/g, ' ').split(' ');
          new_sample.tx_bytes = parseInt(fields[1], 10);
          new_sample.tx_errors = parseInt(fields[3], 10);
          new_sample.tx_dropped = parseInt(fields[4], 10);
        }
        i++;
      } 

      /*
      log("NetRate: rx_bytes = " + new_sample.rx_bytes + ", rx_errors = " + new_sample.rx_errors + ", rx_dropped = " + new_sample.rx_dropped, "rate", "info");
      log("NetRate: tx_bytes = " + new_sample.tx_bytes + ", tx_errors = " + new_sample.tx_errors + ", tx_dropped = " + new_sample.tx_dropped, "rate", "info");
      */

      if (this.cur_netrate_sample.sample_time) {
      
        let ret = {
          sample_time : new_sample.sample_time,
          rx_rate_bits : parseInt(0),
          rx_new_errors : parseInt(0),
          rx_new_dropped : parseInt(0),
          tx_rate_bits : parseInt(0),
          tx_new_errors : parseInt(0),
          tx_new_dropped : parseInt(0)
        }
        
        // receive (down)

        if (this.cur_netrate_sample.rx_bytes != 0 && new_sample.rx_bytes > this.cur_netrate_sample.rx_bytes) {
          ret.rx_rate_bits = Math.round(((new_sample.rx_bytes - this.cur_netrate_sample.rx_bytes) * 8) / ((new_sample.sample_time - this.cur_netrate_sample.sample_time) / 1000));
        }

        if (new_sample.rx_errors > this.cur_netrate_sample.rx_errors) {
          ret.rx_new_errors = new_sample.rx_errors - this.cur_netrate_sample.rx_errors;
        }

        if (new_sample.rx_dropped > this.prev_rx_dropped) {
          ret.rx_new_dropped = new_sample.rx_dropped - this.cur_netrate_sample.rx_dropped;
        }

        // transmit (up)
         
        if (this.cur_netrate_sample.tx_bytes != 0 && new_sample.tx_bytes > this.cur_netrate_sample.tx_bytes) {
          ret.tx_rate_bits = Math.round(((new_sample.tx_bytes - this.cur_netrate_sample.tx_bytes) * 8) / ((new_sample.sample_time - this.cur_netrate_sample.sample_time) / 1000));
        }
      
        if (new_sample.tx_errors > this.cur_netrate_sample.tx_errors) {
          ret.tx_new_errors = new_sample.tx_errors - this.cur_netrate_sample.tx_errors;
        }

        if (new_sample.tx_dropped > this.cur_netrate_sample.tx_dropped) {
          ret.tx_new_dropped = new_sample.tx_dropped - this.cur_netrate_sample.tx_dropped;
        }
       
        //log("NetRate: result = " + JSON.stringify(ret, null, 2), "rate", "info");
        this.cur_netrate_value = ret;
      }

      this.cur_netrate_sample = new_sample;
    });

    exec.stderr.on("data", data => {
      log("NetRate stderr: " + data.toString(), "rate", "info");
    });

    exec.on("exit", code => {
      //log(`NetRate exited with code ${code}`, "rate", "info");
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
