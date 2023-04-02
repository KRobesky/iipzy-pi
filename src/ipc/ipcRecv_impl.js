const WaitQueue = require("wait-queue");

const Defs = require("iipzy-shared/src/defs");

const { log } = require("iipzy-shared/src/utils/logFile");

class Receiver {
  constructor(ipcName, recvFunc) {
    log("Receiver.constructor: ipcName = " + ipcName, "recv", "info");
    this.ipcName = ipcName;
    this.recvFunc = recvFunc;
    this.eventQueue = new WaitQueue();
  }

  getIpcName() {
    return this.ipcName;
  }

  async recv() {
    while (true) {
      //
      log("...>>>recvFunc: " + this.ipcName, "recv", "info");
      const { event, data } = await this.eventQueue.shift();
      this.recvFunc(event, data);
    }
    // ipcMain.on(this.ipcName, (event, data) => {
    //   //log("recv: " + this.ipcName + ", event= " + event, "recv", "info");
    //   this.recvFunc(event, data);
    // });
  }

  queueEvent(event, data) {
    this.eventQueue.push({ event, data });
  }
}

let ipcRecv = null;

class IpcRecv {
  constructor() {
    log("IpcRecv.constructor", "recv", "info");
    // fool garbage collection.
    this.receivers = [];
    this.eventQueue = new WaitQueue();
    ipcRecv = this;

    this.run();
  }

  registerReceiver(ipcName, recvFunc) {
    const receiver = new Receiver(ipcName, recvFunc);
    this.receivers.push(receiver);
    receiver.recv();
  }

  async run() {
    log("ipcRecv: run", "recv", "info");
    while (true) {
      const { event, data } = await this.eventQueue.shift();

      //log("...recvEvent: from queue - event = " + event + ", data = " + JSON.stringify(data), "recv", "info");
      log("IpcRecv.run: from queue - event = " + event + ", data = " + JSON.stringify(data), "recv", "info");

      for (let i = 0; i < this.receivers.length; i++) {
        const receiver = this.receivers[i];
        if (receiver.getIpcName() === event) receiver.queueEvent(event, data);
      }
    }
  }

  queueEvent(event, data) {
    //log("...queueEvent: event = " + event + ", data = " + data, "recv", "info");
    this.eventQueue.push({ event, data });
  }
}

function recvEvent(event, data) {
  //log("...recvEvent: event = " + event + ", data = " + data, "recv", "info");
  ipcRecv.queueEvent(event, data);
}

module.exports = { IpcRecv, recvEvent };
