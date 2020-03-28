const schedule = require("node-schedule");

const { log } = require("iipzy-shared/src/utils/logFile");
const throughputTest = require("./throughputTest");

const isWindows = process.platform === "win32";

function scheduleDailyWork() {
  const rule = new schedule.RecurrenceRule();
  rule.dayOfWeek = [new schedule.Range(0, 6)];
  rule.hour = 1;
  //rule.hour = [16, 17];
  rule.minute = 12;
  //rule.minute = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const j = schedule.scheduleJob(rule, function() {
    log("possibly running throughput test", "schd", "info");
    throughputTest.testWindowStart(true);
  });
}

function init(context) {
  log("...scheduler.init", "schd", "info");

  const { _standAlone } = context;

  if (!_standAlone) return;

  scheduleDailyWork();
}

function final() {}

module.exports = { init, final };
