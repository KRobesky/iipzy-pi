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
    //log("ipcSend.send: event = " + event + ", data = " + JSON.stringify(data), "send", "verbose");
    log("ipcSend.send: event = " + event, "send", "verbose");
    addEvent(event, data, false);
  }

  sendToMain(event, data) {
    //log("ipcSend.sendToMain: event = " + event + ", data = " + JSON.stringify(data), "send", "verbose");
    log("ipcSend.sendToMain: event = " + event, "send", "verbose");
    addEvent(event, data, true);
  }
}

module.exports = IpcSend;
