const { log, timestampToString } = require("iipzy-shared/src/utils/logFile");

function getRandomMillis() {
  let randomMillis = Math.floor(Math.random() * Math.floor(10 * 1000));
  if (randomMillis < 1000) randomMillis = 1000;
  log("getRandomMillis = " + randomMillis, "util", "info");
  return randomMillis;
}

function sendDelayedResults(res, status, results, millis_) {
  log("sendDelayedResults: status = " + status, "util", "info");
  const millis = millis_ && millis_ !== 0 ? millis_ : getRandomMillis();

  setTimeout(() => {
    log("sendDelayedResults - send", "util", "info");
    res.status(status).send(results);
  }, millis);
}

module.exports = { sendDelayedResults };
