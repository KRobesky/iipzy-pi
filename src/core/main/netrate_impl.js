const { spawn } = require("child_process");

const { log } = require("iipzy-shared/src/utils/logFile");

class NetRate {
  constructor(title, dataFunc, doneFunc, maxSamples, intervalSeconds) {
    log(
      "NetRate.constructor: title = " +
      title +
      ", has dataFunc = " +
      (dataFunc != null) +
      ", has doneFunc = " +
      (doneFunc != null) +
      ", maxSamples = " +
      maxSamples +
      ", interval " +
      intervalSeconds,
      "rate",
      "info"
    );
    this.dataFunc = dataFunc;
    this.doneFunc = doneFunc;
    this.title = title;
    this.maxSamples = maxSamples;
    this.intervalSeconds = intervalSeconds ? intervalSeconds : 5;

    this.prev_sample = {};
    this.cancelled;
    this.interval;
    this.numSamples;
    this.inSendNetRateSample;
    this.initRun();
  }

  initSample(sample) {
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

  initRun() {
    this.initSample(this.prev_sample);
    this.cancelled = false;
    this.interval = null;
    this.numSamples = 0;
    this.inSendNetRateSample = false;
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

      let cur_sample = {};
      this.initSample(cur_sample);
      cur_sample.sample_time = Date.now();
      
      let i = 0;
      for (var line in lines) {
        if (line == 3) {
          const fields = lines[3].replace(/\s\s+/g, ' ').split(' ');
          cur_sample.rx_bytes = parseInt(fields[1], 10);
          cur_sample.rx_errors = parseInt(fields[3], 10);
          cur_sample.rx_dropped = parseInt(fields[4], 10);
        } if (line == 5) {
          const fields = lines[5].replace(/\s\s+/g, ' ').split(' ');
          cur_sample.tx_bytes = parseInt(fields[1], 10);
          cur_sample.tx_errors = parseInt(fields[3], 10);
          cur_sample.tx_dropped = parseInt(fields[4], 10);
        }
        i++;
      } 

      /*
      log("NetRate: rx_bytes = " + cur_sample.rx_bytes + ", rx_errors = " + cur_sample.rx_errors + ", rx_dropped = " + cur_sample.rx_dropped, "rate", "info");
      log("NetRate: tx_bytes = " + cur_sample.tx_bytes + ", tx_errors = " + cur_sample.tx_errors + ", tx_dropped = " + cur_sample.tx_dropped, "rate", "info");
      */

      if (this.prev_sample.sample_time) {
      
        let ret = {
          sample_time : cur_sample.sample_time,
          rx_rate_mbits : parseInt(0),
          rx_new_errors : parseInt(0),
          rx_new_dropped : parseInt(0),
          tx_rate_mbits : parseInt(0),
          tx_new_errors : parseInt(0),
          tx_new_dropped : parseInt(0)
        }
        
        // receive (down)

        if (this.prev_sample.rx_bytes != 0 && cur_sample.rx_bytes > this.prev_sample.rx_bytes) {
          ret.rx_rate_mbits = Math.round(((cur_sample.rx_bytes - this.prev_sample.rx_bytes) * 8) / ((cur_sample.sample_time - this.prev_sample.sample_time) / 1000));
        }

        if (cur_sample.rx_errors > this.prev_sample.rx_errors) {
          ret.rx_new_errors = cur_sample.rx_errors - this.prev_sample.rx_errors;
        }

        if (cur_sample.rx_dropped > this.prev_rx_dropped) {
          ret.rx_new_dropped = cur_sample.rx_dropped - this.prev_sample.rx_dropped;
        }

        // transmit (up)
         
        if (this.prev_sample.tx_bytes != 0 && cur_sample.tx_bytes > this.prev_sample.tx_bytes) {
          ret.tx_rate_mbits = Math.round(((cur_sample.tx_bytes - this.prev_sample.tx_bytes) * 8) / ((cur_sample.sample_time - this.prev_sample.sample_time) / 1000));
        }
      
        if (cur_sample.tx_errors > this.prev_sample.tx_errors) {
          ret.tx_new_errors = cur_sample.tx_errors - this.prev_sample.tx_errors;
        }

        if (cur_sample.tx_dropped > this.prev_sample.tx_dropped) {
          ret.tx_new_dropped = cur_sample.tx_dropped - this.prev_sample.tx_dropped;
        }
       
        //log("NetRate: result = " + JSON.stringify(ret, null, 2), "rate", "info");
        this.numSamples++;
        if ((this.dataFunc != null) && !this.inSendNetRateSample) {
          this.inSendNetRateSample = true;
          try {
            this.dataFunc(JSON.stringify(ret));
          } catch (ex) {
            log("(Exception) NetRate.getRxTxRate: " + ex, "rate", "error");
          }
          this.inSendNetRateSample = false;
        }
      }

      this.prev_sample = cur_sample;
    });

    exec.stderr.on("data", data => {
      log("NetRate stderr: " + data.toString(), "rate", "info");
    });

    exec.on("exit", code => {
      //log(`NetRate exited with code ${code}`, "rate", "info");
      if (this.maxSamples > 0) {   
        if (this.numSamples >= this.maxSamples) {
          this.cancel();
        }
      }
    });  
  }

  async run() {
    this.initRun();

    this.interval = setInterval(() => {
      this.getRxTxData(); 
    }, this.intervalSeconds * 1000);  
  }

  cancel() {
    log("NetRate.cancel", "rate", "info");
    this.cancelled = true;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      if (this.doneFunc != null) {
        this.doneFunc();
      }
    }
  }
}

module.exports = NetRate;
