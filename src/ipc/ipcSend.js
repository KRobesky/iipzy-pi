const Defs = require("iipzy-shared/src/defs");

const { log } = require("iipzy-shared/src/utils/logFile");

const { addEvent } = require("./eventWaiter");

class IpcSend {
  constructor() {
    log("IpcSend.constructor", "send", "info");
  }

  send(event, data) {
    //
    //
    log("ipcSend: event = " + event + ", data = " + data, "send", "verbose");
    addEvent(event, data, false);
  }

  sendToMain(event, data) {
    log(
      "ipcSend.emit: event = " + event + ", data = " + data,
      "send",
      "verbose"
    );
    addEvent(event, data, true);
  }
}

module.exports = IpcSend;
