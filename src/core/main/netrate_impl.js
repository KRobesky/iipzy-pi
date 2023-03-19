const schedule = require("node-schedule");
const { spawn } = require("child_process");

const { log } = require("iipzy-shared/src/utils/logFile");
const { sleep } = require("iipzy-shared/src/utils/utils");


class NetRate {
  constructor(title, dataFunc, doneFunc, durationSeconds, intervalSeconds) {
    log(
      "netrate.constructor: title = " +
      title +
      ", duration = " +
      durationSeconds +
      ", interval " +
      intervalSeconds,
      "rate",
      "info"
    );
    this.dataFunc = dataFunc;
    this.doneFunc = doneFunc;
    this.title = title;
    this.durationSeconds = durationSeconds ? durationSeconds : 0;
    this.intervalSeconds = intervalSeconds ? intervalSeconds : 5;
    this.exec = null;
    this.cancelled = false;
    this.totalSamples = 0;
    this.totalTimeMillis = 0;

    this.prev_sample_time = null;
    this.prev_rx_bytes = parseInt(0);
    this.prev_rx_errors = parseInt(0);
    this.prev_rx_dropped = parseInt(0);
    this.prev_tx_bytes = parseInt(0);
    this.prev_tx_errors = parseInt(0);
    this.prev_tx_dropped = parseInt(0);

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

  /*
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
            "rate",
            "info"
          );
          if (this.currentSample.timeMillis !== undefined) {
            this.currentSample.timeStamp = new Date().toISOString();
            if (this.dropCheckEnabled && now > this.latestPingTime + 10 * 1000) {
              log("ping.sendPingSample: no new ping sample for 10 seconds", "rate", "info");
              this.currentSample.timeMillis = "0";
              this.currentSample.dropped = true;
            }
          }
          this.dataFunc(JSON.stringify(this.currentSample));
        } catch (ex) {
          log("(Exception) ping.sendPingSample: " + ex, "rate", "error");
        }
        this.inSendPingSample = false;
      }
    }, this.intervalSeconds * 1000);
    // wait 30 seconds before checking missed ping responses.
    this.timeout = setTimeout(() => {
      this.dropCheckEnabled = true;
    }, 30 * 1000);
  }
*/
/*
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
*/

  getRxTxData() {
    log("NetRate.getRxTxRate", "rate", "info");

    this.exec = spawn("sudo", ["ip", "-s", "link", "show", "eth0"]);

    /*
      returns:
        2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq master br-lan state UP mode DEFAULT group default qlen 1000
            link/ether 68:27:19:ac:a8:fd brd ff:ff:ff:ff:ff:ff
            RX:  bytes  packets errors dropped  missed   mcast
            8632770553 13374010      4       0       0       0
            TX:  bytes  packets errors dropped carrier collsns
            6468249098  8463484      0       0       0       0
    */

    /*
    if (this.durationSeconds !== 0)
      setTimeout(() => {
        this.exec.kill(9);
      }, this.durationSeconds * 1000);

    //this.startSendPingSample();
    */

  
    this.exec.stdout.on("data", data => {
      const lines = data.toString().split('\n');
      let sample_time = Date.now();
      let rx_bytes = parseInt(0);
      let rx_errors = parseInt(0);
      let rx_dropped = parseInt(0);
      let tx_bytes = parseInt(0);
      let tx_errors = parseInt(0);
      let tx_dropped = parseInt(0);
      
      let i = 0;
      for (var line in lines) {
        //log("NetRate: line typeof " + line + ": " + typeof lines[line], "rate", "info")
        if (line == 3) {
          const fields = lines[3].replace(/\s\s+/g, ' ').split(' ');
          rx_bytes = parseInt(fields[1], 10);
          rx_errors = parseInt(fields[3], 10);
          rx_dropped = parseInt(fields[4], 10);
        } if (line == 5) {
          const fields = lines[5].replace(/\s\s+/g, ' ').split(' ');
          tx_bytes = parseInt(fields[1], 10);
          tx_errors = parseInt(fields[3], 10);
          tx_dropped = parseInt(fields[4], 10);
        }
        i++;
      } 

      /*
      log("NetRate: rx_bytes = " + rx_bytes + ", rx_errors = " + rx_errors + ", rx_dropped = " + rx_dropped, "rate", "info");
      log("NetRate: tx_bytes = " + tx_bytes + ", tx_errors = " + tx_errors + ", tx_dropped = " + tx_dropped, "rate", "info");
      log("NetRate: rx_rate = " + (rx_bytes - this.prev_rx_bytes), "rate", "info");
      log("NetRate: tx_rate = " + (tx_bytes - this.prev_tx_bytes), "rate", "info");
      log("NetRate: interval from dates = " + ((sample_time - this.prev_sample_time) / 1000), "rate", "info");
      */

      if (this.prev_sample_time) {
        let rx_rate_mbits = parseInt(0);
        let new_rx_errors = parseInt(0);
        let new_rx_dropped = parseInt(0);
        let tx_rate_mbits = parseInt(0);
        let new_tx_errors = parseInt(0);
        let new_tx_dropped = parseInt(0);
        
        // receive (down)

        if (this.prev_rx_bytes != 0 && rx_bytes > this.prev_rx_bytes) {
          rx_rate_mbits = Math.round(((rx_bytes - this.prev_rx_bytes) * 8) / ((sample_time - this.prev_sample_time) / 1000));
          //log("NetRate: rx_rate_mbits = " + rx_rate_mbits, "rate", "info");
        }

        if (rx_errors > this.prev_rx_errors) {
          new_rx_errors = rx_errors - this.prev_rx_errors;
        }

        if (rx_dropped > this.prev_rx_dropped) {
          new_rx_dropped = rx_dropped - this.prev_rx_dropped;
        }

        // transmit (up)
         
        if (this.prev_tx_bytes != 0 && tx_bytes > this.prev_tx_bytes) {
          tx_rate_mbits = Math.round(((tx_bytes - this.prev_tx_bytes) * 8) / ((sample_time - this.prev_sample_time) / 1000));
          //log("NetRate: tx_rate_mbits = " + tx_rate_mbits, "rate", "info");
        }

        
        if (tx_errors > this.prev_tx_errors) {
          new_tx_errors = tx_errors - this.prev_tx_errors;
        }

        if (tx_dropped > this.prev_tx_dropped) {
          new_tx_dropped = tx_dropped - this.prev_tx_dropped;
        }

        let sample = {
          "sample_time" : sample_time,
          "rx_rate_mbits" : rx_rate_mbits,
          "rx_errors" : new_rx_errors,
          "rx_dropped" : new_rx_dropped,
          "tx_rate_mbits" : tx_rate_mbits,
          "tx_errors" : new_tx_errors,
          "tx_dropped" : new_tx_dropped   
        }
       
        log("NetRate: sample = " + JSON.stringify(sample, null, 2), "rate", "info");
      }

      this.prev_sample_time = sample_time;
      this.prev_rx_bytes = rx_bytes;
      this.prev_rx_errors = rx_errors;
      this.prev_rx_dropped = rx_dropped;
      this.prev_tx_bytes = tx_bytes;
      this.prev_tx_errors = tx_errors;
      this.prev_tx_dropped = tx_dropped;
    });

    this.exec.stderr.on("data", data => {
      log("NetRate stderr: " + data.toString(), "rate", "info");
    });

    this.exec.on("exit", code => {
      //log(`NetRate exited with code ${code}`, "rate", "info");
      /*
      this.stopSendPingSample();

      if (code !== 0 && this.durationSeconds === 0 && !this.cancelled) {
        // restart.
        log("NetRate restarting in 10 seconds", "rate", "info");
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
          this.totalDroppedPackets
          ',"timeStamp": "' +
          Date.now() +
          '"}';
        this.doneFunc(code, json);
      }
      */
    });  
  }

  run() {
    this.totalSamples = 0;
    this.totalTimeMillis = 0;
    this.inSendPingSample = false;
    this.currentSample = {};
    this.stdoutLine = "";

    this.interval = setInterval(() => {
      this.getRxTxData();
    }, this.intervalSeconds * 1000);
   
  }

  cancel() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

module.exports = NetRate;
