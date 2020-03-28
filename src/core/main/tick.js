const { log } = require("iipzy-shared/src/utils/logFile");

class Tick {
  constructor(dataFunc, doneFunc, intervalMilliseconds, durationSeconds) {
    log(
      "Tick.constructor: intervalMilliseconds = " +
        intervalMilliseconds +
        ", durationSeconds = " +
        durationSeconds,
      "tick",
      "verbose"
    );
    this.dataFunc = dataFunc;
    this.doneFunc = doneFunc;
    this.intervalMilliseconds = intervalMilliseconds;
    this.durationSeconds = durationSeconds;
    this.done = false;
    this.numTicks =
      (Number(durationSeconds) * 1000) / Number(intervalMilliseconds);
    this.tickNum = 0;

    this.timeout = null;
    this.interval = null;
  }

  doIt() {
    log(
      "Tick.doIt: done = " +
        this.done +
        ", tickNum = " +
        this.tickNum +
        ", numTicks = " +
        this.numTicks,
      "tick",
      "verbose"
    );
    if (!this.done && this.tickNum < this.numTicks) {
      this.tickNum++;
      const json =
        '{"numTicks":' +
        this.numTicks +
        ',"tickNum":' +
        this.tickNum +
        ',"timeStamp":' +
        Date.now() +
        "}";

      this.dataFunc(json);
    }
  }

  finished() {
    log("Tick.finished", "tick", "verbose");
    this.done = true;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.doneFunc) this.doneFunc(0, 0);
  }

  run() {
    if (this.durationSeconds)
      this.timeout = setTimeout(() => {
        this.finished();
      }, this.durationSeconds * 1000 + this.intervalMilliseconds);

    this.interval = setInterval(() => {
      this.doIt();
    }, this.intervalMilliseconds);
  }

  cancel() {
    log("Tick.cancel", "tick", "verbose");
    this.finished();
  }
}

module.exports = Tick;
