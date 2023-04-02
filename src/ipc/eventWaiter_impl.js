const express = require("express");
const WaitQueue = require("wait-queue");

const Defs = require("iipzy-shared/src/defs");

const { log } = require("iipzy-shared/src/utils/logFile");

const piLocalEvents = require("../core/main/utils/piLocalEvents");

const { clearConnectionUuid } = require("./connection");

const eventQueue = new WaitQueue();

let latestEventTimestamp = Date.now();
// let clearedConnectionUuid = false;

// check that queue is being emptied.
setInterval(() => {
  const curTimestamp = Date.now();
  //
  log(
    "...check queue, curts = " +
      curTimestamp +
      ", eventts = " +
      latestEventTimestamp,
    "ewtr",
    "info"
  );

  if (curTimestamp - latestEventTimestamp > 5 * 1000) {
    // stick a noop event into the queue in case the request is taking too long
    addEvent(Defs.ipcNoop, {}, false);
  }

  if (curTimestamp - latestEventTimestamp > 30 * 1000) {
    // event not taken for 30 seconds.
    if (eventQueue.length > 0) {
      log(
        "eventWaiter: emptying queue, numEntries = " + eventQueue.length,
        "ewtr",
        "info"
      );
      eventQueue.empty();
    }
    // if (!clearedConnectionUuid) {
    //   clearedConnectionUuid = clearConnectionUuid();
    //}
    clearConnectionUuid();
  }
}, 2 * 1000);

function addEvent(event, data, forMain) {
  //
  //log("eventWaiter.addEvent: event =  " + event + ", data = " + JSON.stringify(data), "ewtr", "info");
  log("eventWaiter.addEvent: event =  " + event, "ewtr", "info");

  eventQueue.push({ timestamp: Date.now(), event, data, forMain });
}

let loginStatus = Defs.loginStatusLoggedIn;

async function eventWaiter() {
  const { timestamp, event, data, forMain } = await eventQueue.shift();
  //
  //log("eventWaiter.eventWaiter: event =  " + event + ", data = " + JSON.stringify(data), "ewtr", "info");
  log("eventWaiter.eventWaiter: event =  " + event, "ewtr", "info");

  latestEventTimestamp = timestamp;
  // clearedConnectionUuid = false;

  return { event, data, forMain, loginStatus };
}

function setIpcRecv(ipcRecv) {
  log("eventWaiter: setIpcRecv", "ewtr", "info");
  ipcRecv.registerReceiver(Defs.ipcClientShutdown, (event, data) => {
    // log("eventWaiter handleClientShutdown", "ewtr", "info");
    // if (!clearedConnectionUuid) {
    //   clearedConnectionUuid = clearConnectionUuid();
    // }
    clearConnectionUuid();
  });
}

async function handleLoginStatus(data) {
  loginStatus = data.loginStatus;
  log(
    "eventWaiter.handleLoginStatus: loginStatus = " + loginStatus,
    "ewtr",
    "info"
  );
}

piLocalEvents.on(Defs.pevLoginStatus, handleLoginStatus);

module.exports = { addEvent, eventWaiter, setIpcRecv };
