const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");
const { getInterfaceName } = require("iipzy-shared/src/utils/networkInfo");
//const { sleep } = require("iipzy-shared/src/utils/utils");

const piLocalEvents = require("./utils/piLocalEvents");

let ipcMain = null;

let clientToken = "";
let clientName = "";
let clientType = "";
let configFile = null;
let http = null;
let ipcSend = null;
let localIPAddress = "";
let publicIPAddress = "";
let serialNumber = "";

let clientMode = Defs.clientMode_null;

let sentClientLoginNeeded = 0;

let isLoggedIn = false;
let isExiting = false;
let interval = null;
let doSimulateOffline = false;

let actionCB = null;
let actionAcks = [];

let periodicCB = null;

let inHeartbeat = 0;

async function init(context, _actionCB, _periodicCB) {
  log(">>>heartbeat.init", "htbt", "info");

  const {
    _clientName,
    _clientType,
    _configFile,
    _http,
    _ipcSend,
    _localIPAddress,
    _publicIPAddress,
    _serialNumber,
    _standAlone
  } = context;
  clientName = _clientName;
  clientType = _clientType;
  configFile = _configFile;
  http = _http;
  ipcSend = _ipcSend;
  localIPAddress = _localIPAddress;
  publicIPAddress = _publicIPAddress;
  serialNumber = _serialNumber;

  clientMode =
    _standAlone && clientType === "pc" ? Defs.clientMode_pcOnly : Defs.clientMode_sentinel;

  actionCB = _actionCB;
  periodicCB = _periodicCB;

  if (clientType === "pc") {
    ipcMain = require("electron").ipcMain;
    ipcMain.on(Defs.ipcLoginStatus, handleLoginStatus);
    ipcMain.on(Defs.ipcExiting, handleExiting);
  }

  interval = setInterval(async () => {
    if (!inHeartbeat) {
      inHeartbeat++;
      try {
        await heartbeat();
      } catch (ex) {
        log("(Exception) heartbeat.init: " + ex, "htbt", "error");
      }
      inHeartbeat--;
    }
  }, 20 * 1000);

  await heartbeat();

  log("<<<heartbeat.init", "htbt", "info");
}

function final() {}

async function createUpdateClient() {
  clientToken = configFile.get("clientToken");
  log("heartbeat.init: clientToke n=" + clientToken, "htbt", "info");
  if (clientToken) {
    http.setClientTokenHeader(clientToken);
  }

  const newClientToken = serialNumber;
  log("heartbeat.createUpdateClient: newClientToken = " + newClientToken, "htbt", "info");
  if (!clientName) clientName = "sentinel@" + localIPAddress;
  const interfaceName = await getInterfaceName();
  const { status: status2, data } = await http.post("/client/clientbyserialnumber", {
    localIPAddress,
    clientType,
    clientToken: newClientToken,
    clientName,
    interfaceName
  });
  if (status2 === Defs.httpStatusOk) {
    clientToken = newClientToken;
    log("heartbeat.createUpdateClient: clientToken = " + clientToken, "htbt", "info");
    // save in config.
    await configFile.set("clientToken", clientToken);
    // set in http header.
    http.setClientTokenHeader(clientToken);
  } else {
    log("(Error) heartbeat.createUpdateClient failed: " + JSON.stringify(data), "htbt", "error");
    clientToken = null;
    // save in config.
    await configFile.set("clientToken", clientToken);
    // set in http header.
    http.setClientTokenHeader(clientToken);
  }
}

async function heartbeat() {
  log(
    ">>>heartbeat: isLoggedIn =" +
      isLoggedIn +
      ", simOffline = " +
      doSimulateOffline +
      ", isExiting = " +
      isExiting,
    "htbt",
    "info"
  );

  if (!clientToken) {
    await createUpdateClient();
    if (!clientToken) {
      log("<<<heartbeat: no clientToken", "htbt", "info");
      return;
    }
  }

  //??
  // if (!sentLogFiles) {
  //   await sendLogFiles("appliance", "iipzy-pi");
  //   sentLogFiles = true;
  // }

  if (isExiting) {
    log("<<<heartbeat: exiting", "htbt", "info");
    return;
  }

  if (doSimulateOffline) {
    log("<<<heartbeat: simulate offline", "htbt", "info");
    return;
  }

  // log(
  //   "heartbeat: before post - actionAcks = " + JSON.stringify(actionAcks),
  //   "htbt",
  //   "verbose"
  // );

  const periodicData = periodicCB ? periodicCB() : null;

  // log(
  //   "heartbeat: before post - periodicData = " + JSON.stringify(periodicData),
  //   "htbt",
  //   "verbose"
  // );

  const reqData = {
    clientType,
    clientName,
    clientMode,
    localIPAddress,
    actionAcks,
    periodicData
  };

  log("heartbeat: before post - reqData = " + JSON.stringify(reqData, null, 2), "htbt", "info");

  const { data, status } = await http.post("/client/heartbeat", reqData);
  actionAcks = [];

  log("heartbeat: status = " + status, "htbt", "verbose");

  if (status !== Defs.httpStatusOk) {
    if (status === Defs.httpStatusUnauthorized) {
      await configFile.set("clientToken", null);
      clientToken = null;
    }
  }

  if (data) {
    log("heartbeat: data = " + JSON.stringify(data, null, 2), "htbt", "verbose");

    // const clientToken = data.clientToken;
    isLoggedIn = data.isLoggedIn;

    // if (clientToken) {
    //   // first connection by this client
    //   log("heartbeat: clientToken = " + clientToken, "htbt", "info");
    //   await configFile.set("clientToken", clientToken);
    //   // set in http header.
    //   http.setClientTokenHeader(clientToken);
    // }

    if (!isLoggedIn) {
      if (sentClientLoginNeeded === 0) {
        log("heartbeat: login needed", "htbt", "info");
        // for client.  NB: In appliance mode, client might not be running
        ipcSend.sendToMain(Defs.ipcClientLoginNeeded, true);
        // for pi.  Ignored if not is appliance mode.
        piLocalEvents.emit(Defs.pevLoginNeeded, true);
        // retry after 5 hearbeats of not logged in.
        sentClientLoginNeeded = 5;
      } else {
        sentClientLoginNeeded--;
      }
    } else sentClientLoginNeeded = 0;

    if (actionCB && data.actions) {
      await actionCB(data.actions, actionCompletion);
    }
  }

  log("<<<heartbeat", "htbt", "info");
}

async function actionCompletion(actionAck) {
  log("heartbeat: actionCompletion = " + JSON.stringify(actionAck), "htbt", "info");
  actionAcks.push(actionAck);
  inHeartbeat++;
  try {
    await heartbeat();
  } catch (ex) {
    log("Exception) heartbeat: " + ex, "htbt", "error");
  }
  inHeartbeat--;
}

async function handleClientName(data) {
  log("heartbeat handleClientName: clientName = " + data.clientName, "htbt", "info");
  if (data.clientName !== clientName) {
    clientName = data.clientName;
    await configFile.set("clientName", clientName);
  }
}

piLocalEvents.on(Defs.ipcClientName, handleClientName);

function handleLoginStatus(event, data) {
  log("heartbeat handleLoginStatus: status = " + data.loginStatus, "htbt", "info");
  isLoggedIn = data.loginStatus === Defs.loginStatusLoggedIn;
  http.setAuthTokenHeader(data.authToken);
}

function handleSentinelLoginStatus(data) {
  log("heartbeat handleSentinelLoginStatus: status = " + data.loginStatus, "htbt", "info");
  isLoggedIn = data.loginStatus === Defs.loginStatusLoggedIn;
}

piLocalEvents.on(Defs.pevLoginStatus, handleSentinelLoginStatus);

function handleExiting(event, data) {
  log("heartbeat handleExiting", "htbt", "info");
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  isExiting = true;
}

function simulateOffline(state) {
  doSimulateOffline = state;
}

function getSimulateOffline() {
  log("heartbeat getSimulateOffline: state = " + doSimulateOffline, "htbt", "info");
  return doSimulateOffline;
}

function setSimulateOffline(state) {
  doSimulateOffline = state;
  log("heartbeat setSimulateOffline: state = " + doSimulateOffline, "htbt", "info");
  return doSimulateOffline;
}

module.exports = {
  init,
  final,
  getSimulateOffline,
  setSimulateOffline,
  simulateOffline
};
