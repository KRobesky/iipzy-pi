const {
  compress,
  compressLogFiles
} = require("iipzy-shared/src/utils/compress");
const Defs = require("iipzy-shared/src/defs");
const http = require("iipzy-shared/src/services/httpService");
const { fileDeleteAsync } = require("iipzy-shared/src/utils/fileIO");
const { log } = require("iipzy-shared/src/utils/logFile");

async function sendLogFiles(name, prefix) {
  try {
    const dests = await compressLogFiles(
      "/tmp/",
      name + "-" + Date.now(),
      prefix
    );
    if (dests) {
      log(
        "sendLogFiles: dests = " + JSON.stringify(dests, null, 2),
        "slgs",
        "info"
      );
      for (let i = 0; i < dests.length; i++) {
        const dest = dests[i];
        const { data, status } = await http.fileUpload(dest);
        log("sendLogFiles: status = " + status, "slgs", "info");
        if (status === Defs.httpStatusOk) {
          log("sendLogFiles: " + JSON.stringify(data, null, 2), "slgs", "info");
        }
        await fileDeleteAsync(dest);
      }
    }
  } catch (ex) {
    log("(Exception) sendLogFiles: " + ex, "slgs", "error");
  }
  log("<<<sendLogFiless", "slgs", "info");
}

//async function compress(sourcePath, destPath, destFileName, prefix) {
// NB: returns an array of files to send.
// async function compressLogFiles(destPath, destFileName, prefix) {
//   return compress(getLogDir(), destPath, destFileName, prefix);
// }

async function sendPingPlotRrdb() {
  try {
    const dests = await compress(
      "/etc/iipzy/",
      "/tmp/",
      "pingPlot-" + Date.now(),
      "pingPlot.rrdb"
    );
    if (dests) {
      log(
        "sendPingPlotRrdb: dests = " + JSON.stringify(dests, null, 2),
        "slgs",
        "info"
      );
      for (let i = 0; i < dests.length; i++) {
        const dest = dests[i];
        const { data, status } = await http.fileUpload(dest);
        log("sendPingPlotRrdb: status = " + status, "slgs", "info");
        if (status === Defs.httpStatusOk) {
          log(
            "sendPingPlotRrdb: " + JSON.stringify(data, null, 2),
            "slgs",
            "info"
          );
        }
        await fileDeleteAsync(dest);
      }
    }
  } catch (ex) {
    log("(Exception) sendPingPlotRrdb: " + ex, "slgs", "error");
  }
  log("<<<sendPingPlotRrdb", "slgs", "info");
}

module.exports = { sendLogFiles, sendPingPlotRrdb };
