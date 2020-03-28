const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");

const http = require("iipzy-shared/src/services/httpService");
const { sleep } = require("iipzy-shared/src/utils/utils");

const RemoteJobExecutor = require("./remoteJobExecutor");

const jobMap = new Map();

function init(context) {
  log("remoteJobManager.init", "rjmg", "info");

  run();
}

async function run() {
  log("RemoteJobManager.run", "rjmg", "info");

  while (true) {
    log("RemoteJobManager.run - before GET", "rjmg", "info");
    const { data, status } = await http.get("/jobWait", { timeout: 10000 });
    if (status !== Defs.httpStatusOk) {
      log(
        "(Error) RemoteJobManager.run: AFTER calling jobWait: status = " +
          status +
          ", error = " +
          data
      );
      switch (status) {
        case Defs.httpStatusConnRefused:
        case Defs.httpStatusConnAborted: {
          await sleep(1000);
          break;
        }
      }
      // continue.
      continue;
    }

    if (!data) continue;
    const { jobUuid, jobParams } = data;
    if (!jobUuid) continue;

    if (jobMap.get(jobUuid)) continue;

    const remoteJobExecutor = new RemoteJobExecutor(
      jobDoneFunc,
      jobUuid,
      jobParams
    );
    jobMap.set(jobUuid, remoteJobExecutor);
    remoteJobExecutor.run();
  }
}

function jobDoneFunc(jobUuid) {
  log("RemoteJobManager.jobDoneFunc: jobUuid = " + jobUuid);
  jobMap.delete(jobUuid);
}

module.exports = { init };
