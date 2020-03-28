const { spawn } = require("child_process");

const { log } = require("iipzy-shared/src/utils/logFile");

const http = require("iipzy-shared/src/services/httpService");

class RemoteJobExecutor {
  constructor(jobDoneFunc, jobUuid, jobParams) {
    log(
      "RemoteJobExecutor: uuid = " + jobUuid + ", params = " + jobParams,
      "rjex",
      "info"
    );

    this.jobDoneFunc = jobDoneFunc;
    this.jobUuid = jobUuid;
    this.jobParams = jobParams;
    this.exec = null;
    this.sendErrorCount = 0;
  }

  async run() {
    log("RemoteJobExecutor.run", "rjex", "info");

    try {
      this.exec = spawn("tail", ["-F", "/var/log/iipzy/iipzy-pi.log"]);
    } catch (ex) {
      log("(Exception) RemoteJobExecutor.run: ex = " + ex, "rjex", "error");
      return;
    }

    this.exec.stdout.on("data", data => {
      const str = data.toString();
      //log("stdout: " + str, "rjex", "info");
      this.send(str, false);
    });

    this.exec.stderr.on("data", data => {
      const str = data.toString();
      //log("stderr: " + str, "rjex", "info");
      this.send(str, false);
    });

    this.exec.on("exit", code => {
      //log(`exited with code ${code}`, "rjex", "info");
      this.send("", true);
    });
  }

  async send(str, done) {
    this.sendErrorCount = 0;
    //log("RemoteJobExecutor.recv: done = " + done, "rjex", "info");
    const req = { jobUuid: this.jobUuid, str: str, done: done };
    // send uuid + str
    let cancel = false;
    while (true) {
      try {
        const { data, status } = await http.put("/jobWait/job", req);
        cancel = data.cancel;
        if (cancel) this.cancel();
        break;
      } catch (ex) {
        log("(Exception) send: ex = " + ex, "rjex", "info");
        this.sendErrorCount++;
        if (this.sendErrorCount > 5) {
          log("send: too many errors, cancelling", "rjex", "info");
          cancel = true;
          this.cancel();
          break;
        }
      }
    }
    if (done || cancel) this.jobDoneFunc(this.jobUuid);
  }

  cancel() {
    log("RemoteJobExecutor.cancel", "rjex", "info");
    if (this.exec) {
      this.exec.kill(9);
      this.exec = null;
    }
  }
}

module.exports = RemoteJobExecutor;
