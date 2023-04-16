const Defs = require("iipzy-shared/src/defs");
const Iperf3 = require("iipzy-shared/src/utils/iperf3");
const { log } = require("iipzy-shared/src/utils/logFile");
const Ping = require("iipzy-shared/src/utils/ping");
const { sleep } = require("iipzy-shared/src/utils/utils");

const RoundRobinDB = require("./utils/roundRobinDB");
const Tick = require("./tick");
const {
  cancelIperf3Run,
  getIperf3Server,
  getPingTarget,
  setAuthTokenHeader
} = require("./services/iperf3Service");

let configFile = null;
let http = null;
let ipcSend = null;
let platformInfo = null;

let ipcSendEnabled = true;

let loggedIn = false;

let pingTarget = Defs.pingTarget;

let testState = false;
let hideButton = false;
const default_nominalLatencyTestDurationSeconds = 10;
const default_downloadThroughputTestDurationSeconds = 10;
const default_uploadThroughputTestDurationSeconds = 10;
let nominalLatencyTestDurationSeconds = default_nominalLatencyTestDurationSeconds;
let downloadThroughputTestDurationSeconds = default_downloadThroughputTestDurationSeconds;
let uploadThroughputTestDurationSeconds = default_uploadThroughputTestDurationSeconds;
const watchdogSlopSeconds = 30;
let watchdogTimer = null;
let retryCount = 0;

let tick = null;
let ping = null;

let iperf3Server = null;
let iperf3Token = null;
let iperf3CancelToken = null;
let iperf3 = null;

let roundRobinDB = null;
const rrdbDataSize = 500;
let dbMaxEntries = 0;
let dbNumEntries = 0;
let dbHighestId = 0;
let dbId = 0;
let dbLinkId = 0; // NB: backward link for dropped packets.
let dbLinkIdLatest = 0;
let dbScrollPos = 1;
const _30daysAt1HourIntervals = 30 * 24;
const createNumEntries = _30daysAt1HourIntervals;

let timeOfTest = null;

let nominalLatencyMillis = 0;
let downloadThroughputMBits = 0;
let downloadBloatMillis = 0;
let uploadThroughputMBits = 0;
let uploadBloatMillis = 0;

let numTicksNominalLatency = 0;
let tickNumNominalLatency = 0;
let numTicksIperf3Down = 0;
let tickNumIperf3Down = 0;
let numTicksIperf3Up = 0;
let tickNumIperf3Up = 0;

async function init(context) {
  log("ThroughputTest.init", "tput", "info");
  log("ThroughputTest.init - process id = " + process.pid, "tput", "info");

  const {
    _configFile,
    _platformInfo,
    _standAlone,
    _ipcRecv,
    _ipcSend,
    _http,
    _userDataPath
  } = context;
  configFile = _configFile;
  http = _http;
  platformInfo = _platformInfo;
  ipcSend = _ipcSend;

  _ipcRecv.registerReceiver(Defs.ipcThroughputTestWindowCancel, testWindowCancelIpc);

  _ipcRecv.registerReceiver(Defs.ipcThroughputTestWindowStart, testWindowStartIpc);

  _ipcRecv.registerReceiver(Defs.ipcThroughputTestWindowMount, testWindowMount);

  _ipcRecv.registerReceiver(Defs.ipcLoginStatus, handleLoginStatus);

  _ipcRecv.registerReceiver(
    Defs.ipcThroughputTestWindowButtonLeft,
    handleThroughputTestWindowButtonLeft
  );
  _ipcRecv.registerReceiver(
    Defs.ipcThroughputTestWindowButtonOldest,
    handleThroughputTestWindowButtonOldest
  );
  _ipcRecv.registerReceiver(
    Defs.ipcThroughputTestWindowButtonNewest,
    handleThroughputTestWindowButtonNewest
  );
  _ipcRecv.registerReceiver(
    Defs.ipcThroughputTestWindowButtonRight,
    handleThroughputTestWindowButtonRight
  );

  if (!_standAlone) return;

  log("...ThroughputTest.init - before new RoundRobinDB", "tput", "info");
  roundRobinDB = new RoundRobinDB(_userDataPath, "throughput", rrdbDataSize, createNumEntries);
  const { maxEntries, numEntries, linkId } = await roundRobinDB.init();
  dbMaxEntries = maxEntries;
  dbNumEntries = numEntries;
  dbLinkId = dbLinkIdLatest = linkId;

  const joData = await roundRobinDB.read(1, 1);
  try {
    const ja = jo.entries;
    if (ja.length > 0) {
      const jrow = ja[0];
      if (jrow) {
        const status = jrow.data;
        log("throughputTest.init: status = " + JSON.stringify(status, null, 2), "tput", "info");
        timeOfTest = status.timeOfTest;
        numTicksNominalLatency = status.nominalLatency.numTicks;
        tickNumNominalLatency = status.nominalLatency.tickNum;
        nominalLatencyMillis = status.nominalLatencyMillis;
        numTicksIperf3Down = status.tickStatusIperf3Down.numTicks;
        tickNumIperf3Down = status.tickStatusIperf3Down.tickNum;
        downloadThroughputMBits = status.downloadThroughputMBits;
        downloadBloatMillis = status.downloadBloatMillis;
        numTicksIperf3Up = status.tickStatusIperf3Up.tickNum;
        tickNumIperf3Up = status.tickStatusIperf3Up.tickNum;
        uploadThroughputMBits = status.uploadThroughputMBits;
        uploadBloatMillis = status.uploadBloatMillis;
      }
    }
  } catch (err) {
    log("(Exception) ThroughputTest.init: " + err, "tput", "error");
  }
  log("...ThroughputTest.init - AFTER new RoundRobinDB", "tput", "info");
}

function cancel() {
  if (tick) {
    tick.cancel();
    tick = null;
  }
  if (ping) {
    ping.cancel();
    ping = null;
  }
  if (iperf3) {
    iperf3.cancel();
    iperf3 = null;
    if (iperf3CancelToken) {
      cancelIperf3Run(http, iperf3Server, iperf3Token, iperf3CancelToken);
      iperf3Server = iperf3Token = iperf3CancelToken = null;
    }
  }
}

function ipcSendIfEnabled(event, data) {
  if (ipcSendEnabled) ipcSend.send(event, data);
}

function enableDisableIpcSend() {
  ipcSendEnabled = dbScrollPos === 1;
  log(
    "throughputTest: enableDisableIpcSend: ipcSendEnabled = " +
      ipcSendEnabled +
      ", dbScrollPos = " +
      dbScrollPos,
    "tput",
    "info"
  );
}

function startWatchdogTimer() {
  const timeoutSeconds =
    nominalLatencyTestDurationSeconds +
    downloadThroughputTestDurationSeconds +
    uploadThroughputTestDurationSeconds +
    watchdogSlopSeconds;
  log("ThroughputTest.startWatchdogTimer: timeoutSeconds = " + timeoutSeconds, "tput", "info");
  watchdogTimer = setTimeout(() => {
    log("ThroughputTest.watchdog", "tput", "info");
    testState = hideButton = false;
    cancel();
    resetStatistics();
    ipcSendIfEnabled(Defs.ipcClearDials, {});

    ipcSendIfEnabled(Defs.ipcTestingState, { testState });

    watchdogTimer = null;
  }, timeoutSeconds * 1000);
}

function stopWatchdogTimer() {
  log("ThroughputTest.stopWatchdogTimer", "tput", "info");
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

function restartWatchdogTimer(retrying) {
  stopWatchdogTimer();
  if (retrying) {
    if (retryCount > 0) retryCount--;
  }
  if (!retrying || retryCount > 0) {
    startWatchdogTimer();
    return true;
  }
  return false;
}

const HGISR_SUCCESS = 0;
const HGISR_RETRY = 1;
const HGISR_FAILED = 2;
function handleGetIperf3ServerResults(status, data) {
  log("handleGetIperf3ServerResults: status = " + status, "tput", "info");
  if (status === Defs.httpStatusOk) return { result: HGISR_SUCCESS };

  const { __hadError__ } = data;

  if (__hadError__) {
    log(
      "(Error) handleGetIperf3ServerResults: errorMessage = " +
        __hadError__.errorMessage +
        ", statusCode = " +
        __hadError__.statusCode,
      "tput",
      "error"
    );

    if (__hadError__.statusCode === Defs.statusIperf3ServerBusy) {
      return { result: HGISR_RETRY, message: __hadError__.errorMessage };
    }

    return { result: HGISR_FAILED, message: __hadError__.errorMessage };

    //?? ipcSendIfEnabled(Defs.ipcThroughputTestFailedToGetServer, __hadError__.errorMessage);
  }

  return { result: HGISR_FAILED, message: "Could not access Speed Test Server" };

  // else {
  //   ipcSendIfEnabled(Defs.ipcThroughputTestFailedToGetServer, "Could not access Speed Test Server");
  // }
  // return HGISR_FAILED;
}

function doneFuncDontCare(code, val) {
  log("doneFuncDontCare: code = " + code + ", val = " + val, "tput", "info");
}

// determine nominal latency

function tickDataFuncDetermineNominalLatency(jo) {
  if (testState) {
    if (!jo) return;

    ipcSendIfEnabled(Defs.ipcTickStatusNominalLatency, {
      numTicks: jo.numTicks,
      tickNum: jo.tickNum
    });
  }
}

function pingDataFuncDetermineNominalLatency(jo) {
  if (testState) {
    if (!jo) return;

    ipcSendIfEnabled(Defs.ipcNominalLatencyStatus, jo.timeMillis);
  }
}

function pingDoneFuncDetermineNominalLatency(code, jo) {
  log("pingDoneFuncDetermineNominalLatency: code = " + code + ", jo = " + JSON.stringify(jo), "tput", "info");

  if (testState) {
    if (!jo) return;

    ipcSendIfEnabled(Defs.ipcNominalLatencyStatusFinal, jo.avgMillis);
  }

  determineDownloadThroughput();
}

async function determineNominalLatency() {
  log("...determineNominalLatency...", "tput", "info");

  if (!testState) return;

  const { pingTarget: pingTarget_ } = await getPingTarget(http);
  pingTarget = pingTarget_ ? pingTarget_ : Defs.pingTarget;
  await configFile.set("pingTarget", pingTarget);

  tick = new Tick(
    tickDataFuncDetermineNominalLatency,
    doneFuncDontCare,
    500,
    nominalLatencyTestDurationSeconds
  );
  tick.run();

  console.log("-------------new ping.03");
  ping = new Ping(
    "thoughPut - latency",
    pingDataFuncDetermineNominalLatency,
    pingDoneFuncDetermineNominalLatency,
    pingTarget,
    nominalLatencyTestDurationSeconds,
    false
  );
  ping.run();
}

// determine download throughput

function tickDataFuncDownloadThroughput(jo) {
  if (testState) {
    if (!jo) return;

    ipcSendIfEnabled(Defs.ipcTickStatusIperf3Down, {
      numTicks: jo.numTicks,
      tickNum: jo.tickNum
    });
  }
}

function pingDataFuncDownloadThroughput(jo) {
  if (testState) {
    if (!jo) return;

    ipcSendIfEnabled(Defs.ipcBloatLatencyStatusIperf3Down, jo.timeMillis - nominalLatencyMillis);
  }
}

function pingDoneFuncDownloadThroughput(code, jo) {
  log("pingDoneFuncDownloadThroughput: code = " + code + ", jo = " + JSON.stringify(jo), "tput", "info");

  if (testState) {
    if (!jo) return;

    ipcSendIfEnabled(Defs.ipcBloatLatencyStatusIperf3DownFinal, jo.avgMillis - nominalLatencyMillis);
  }
}

function iperf3DataFuncDownloadThroughput(jo) {
  if (testState) {
    if (!jo) return;

    ipcSendIfEnabled(Defs.ipcIperf3StatusDown, jo.mbitsPerSec);
  }
}

function iperf3DoneFuncDownloadThroughput(code, avgThoughputMBits) {
  log(
    "iperf3DoneFuncDownloadThroughput: code = " + code + ", avg = " + avgThoughputMBits,
    "tput",
    "info"
  );
  iperf3Server = iperf3Token = iperf3CancelToken = null;
  if (code === 0) {
    downloadThroughputMBits = avgThoughputMBits;
    determineUploadThroughput();
  } else {
    cancel();
    stopWatchdogTimer();
    if (testState) {
      const retrySeconds = 20;
      log("trying download again in " + retrySeconds + " seconds", "tput", "info");
      setTimeout(determineDownloadThroughput, retrySeconds * 1000);
    }
  }
}

async function determineDownloadThroughput() {
  log("...determineDownloadThroughput...", "tput", "info");

  if (!testState) return;

  let results = null;
  while (results === null) {
    results = await getIperf3Server(http);
    const { status, data } = results;
    const { result, message } = handleGetIperf3ServerResults(status, data);
    switch (result) {
      case HGISR_SUCCESS: {
        restartWatchdogTimer(false);
        break;
      }
      case HGISR_RETRY: {
        results = null;
        log("determineDownloadThroughput: retrying in 20 seconds");
        await sleep(20 * 1000);
        if (!restartWatchdogTimer(true)) {
          testState = hideButton = false;
          stopWatchdogTimer();
          resetStatistics();
          ipcSendIfEnabled(Defs.ipcClearDials, {});
          ipcSendIfEnabled(Defs.ipcTestingState, { testState, failed: true });
          ipcSendIfEnabled(Defs.ipcThroughputTestFailedToGetServer, message);
          return;
        }
        break;
      }
      case HGISR_FAILED: {
        testState = hideButton = false;
        stopWatchdogTimer();
        resetStatistics();
        ipcSendIfEnabled(Defs.ipcClearDials, {});
        ipcSendIfEnabled(Defs.ipcTestingState, { testState, failed: true });
        ipcSendIfEnabled(Defs.ipcThroughputTestFailedToGetServer, message);
        return;
      }
    }
  }

  log(
    "determineDownloadThroughput.getIperf3Server: results = " + JSON.stringify(results),
    "tput",
    "info"
  );
  const {
    server,
    port,
    iperf3Server: iperf3Server_,
    iperf3Token: iperf3Token_,
    cancelToken
  } = results;

  tick = new Tick(
    tickDataFuncDownloadThroughput,
    doneFuncDontCare,
    500,
    downloadThroughputTestDurationSeconds
  );
  tick.run();

  console.log("-------------new ping.04");
  ping = new Ping(
    "thoughPut - download bloat",
    pingDataFuncDownloadThroughput,
    pingDoneFuncDownloadThroughput,
    pingTarget,
    downloadThroughputTestDurationSeconds,
    false
  );
  ping.run();

  iperf3 = new Iperf3(
    platformInfo,
    iperf3DataFuncDownloadThroughput,
    iperf3DoneFuncDownloadThroughput,
    server,
    port,
    downloadThroughputTestDurationSeconds,
    true
  );
  iperf3Server = iperf3Server_;
  iperf3Token = iperf3Token_;
  iperf3CancelToken = cancelToken;
  iperf3.run();
}

// determine upload throughput

function tickDataFuncUploadThroughput(jo) {
  if (testState) {
    if (!jo) return;

    ipcSendIfEnabled(Defs.ipcTickStatusIperf3Up, {
      numTicks: jo.numTicks,
      tickNum: jo.tickNum
    });
  }
}

function pingDataFuncUploadThroughput(jo) {
  if (testState) {
    if (!jo) return;

    ipcSendIfEnabled(Defs.ipcBloatLatencyStatusIperf3Up, jo.timeMillis - nominalLatencyMillis);
  }
}

function pingDoneFuncUploadThroughput(code, jo) {
  log("pingDoneFuncUploadThroughput: code = " + code + ", jo = " + JSON.stringify(jo), "tput", "info");

  if (testState) {
    if (!jo) return;

    ipcSendIfEnabled(Defs.ipcBloatLatencyStatusIperf3UpFinal, jo.avgMillis - nominalLatencyMillis);
  }
}

function iperf3DataFuncUploadThroughput(jo) {
  if (testState) {
    if (!jo) return;

    ipcSendIfEnabled(Defs.ipcIperf3StatusUp, jo.mbitsPerSec);
  }
}

async function iperf3DoneFuncUploadThroughput(code, avgThoughputMBits) {
  log(
    "iperf3DoneFuncDetermineIploadThroughput: code = " + code + ", avg = " + avgThoughputMBits,
    "tput",
    "info"
  );
  iperf3Server = iperf3Token = iperf3CancelToken = null;
  if (code === 0) {
    uploadThroughputMBits = avgThoughputMBits;
    testState = hideButton = false;
    stopWatchdogTimer();
    ipcSendIfEnabled(Defs.ipcTestingState, { testState });
    timeOfTest = new Date();
    log(
      "iperf3DoneFuncDetermineIploadThroughput: timeOfTest = " + timeOfTest,
      "tput",
      "info"
    );
    ipcSendIfEnabled(Defs.ipcTimeOfTest, timeOfTest);
    // write to rrdb.
    const { numEntries, id } = await roundRobinDB.write(getTestStatusFromCurrent().status, dbLinkIdLatest);
    dbNumEntries = numEntries;
  } else {
    cancel();
    stopWatchdogTimer();
    if (testState) {
      const retrySeconds = 20;
      log("trying upload again in " + retrySeconds + " seconds", "tput", "info");
      setTimeout(determineUploadThroughput, retrySeconds * 1000);
    }
  }
}

async function determineUploadThroughput() {
  log("...determineUploadThroughput...", "tput", "info");

  if (!testState) return;

  let results = null;
  while (results === null) {
    results = await getIperf3Server(http);
    const { status, data } = results;
    const { result, message } = handleGetIperf3ServerResults(status, data);
    switch (result) {
      case HGISR_SUCCESS: {
        stopWatchdogTimer();
        break;
      }
      case HGISR_RETRY: {
        results = null;
        log("determineUploadThroughput: retrying in 20 seconds");
        await sleep(20 * 1000);
        if (!restartWatchdogTimer(true)) {
          testState = hideButton = false;
          stopWatchdogTimer();
          resetStatistics();
          ipcSendIfEnabled(Defs.ipcClearDials, {});
          ipcSendIfEnabled(Defs.ipcTestingState, { testState, failed: true });
          ipcSendIfEnabled(Defs.ipcThroughputTestFailedToGetServer, message);
          return;
        }
        break;
      }
      case HGISR_FAILED: {
        testState = hideButton = false;
        stopWatchdogTimer();
        resetStatistics();
        ipcSendIfEnabled(Defs.ipcClearDials, {});
        ipcSendIfEnabled(Defs.ipcTestingState, { testState, failed: true });
        ipcSendIfEnabled(Defs.ipcThroughputTestFailedToGetServer, message);
        return;
      }
    }
  }

  log(
    "determineUploadThroughput.getIperf3Server: results = " + JSON.stringify(results),
    "tput",
    "info"
  );
  const {
    server,
    port,
    iperf3Server: iperf3Server_,
    iperf3Token: iperf3Token_,
    cancelToken
  } = results;

  tick = new Tick(
    tickDataFuncUploadThroughput,
    doneFuncDontCare,
    500,
    uploadThroughputTestDurationSeconds
  );
  tick.run();

  console.log("-------------new ping.05");
  ping = new Ping(
    "thoughPut - upload bloat",
    pingDataFuncUploadThroughput,
    pingDoneFuncUploadThroughput,
    pingTarget,
    uploadThroughputTestDurationSeconds,
    false
  );
  ping.run();

  iperf3 = new Iperf3(
    platformInfo,
    iperf3DataFuncUploadThroughput,
    iperf3DoneFuncUploadThroughput,
    server,
    port,
    uploadThroughputTestDurationSeconds,
    false
  );
  iperf3Server = iperf3Server_;
  iperf3Token = iperf3Token_;
  iperf3CancelToken = cancelToken;
  iperf3.run();
}

// start/stop test

function resetStatistics() {
  log("...ThroughputTest.resetStatistics", "tput", "info");
  timeOfTest = null;
  nominalLatencyMillis = 0;
  downloadThroughputMBits = 0;
  downloadBloatMillis = 0;
  uploadThroughputMBits = 0;
  uploadBloatMillis = 0;
  numTicksNominalLatency = 0;
  tickNumNominalLatency = 0;
  numTicksIperf3Down = 0;
  tickNumIperf3Down = 0;
  numTicksIperf3Up = 0;
  tickNumIperf3Up = 0;
}

async function testWindowCancel(data) {
  log(
    "ThroughputTest.testWindowCancel: loggedIn = " + loggedIn + ", data = " + JSON.stringify(data),
    "tput",
    "info"
  );

  const testBusy = testState;
  testState = hideButton = false;

  cancel();
  stopWatchdogTimer();
  resetStatistics();

  ipcSendIfEnabled(Defs.ipcClearDials, {});
  ipcSendIfEnabled(Defs.ipcTestingState, { testState, hideButton, testBusy });
  await sendRecordAtPosition();
}

function testWindowStart(isBackgroundTask, data) {
  log(
    "ThroughputTest.testWindowStart: loggedIn = " +
      loggedIn +
      ", isBackgroundTask = " +
      isBackgroundTask +
      ", data = " +
      JSON.stringify(data),
    "tput",
    "info"
  );

  if (testState) {
    ipcSendIfEnabled( Defs.ipcTestingState,{ testState, hideButton, testBusy: true });
    return;
  }

  testState = true;

  if (data) {
    nominalLatencyTestDurationSeconds = data.nominalLatencyTestDurationSeconds
      ? data.nominalLatencyTestDurationSeconds
      : default_nominalLatencyTestDurationSeconds;
    downloadThroughputTestDurationSeconds = data.downloadThroughputTestDurationSeconds
      ? data.downloadThroughputTestDurationSeconds
      : default_downloadThroughputTestDurationSeconds;
    uploadThroughputTestDurationSeconds = data.uploadThroughputTestDurationSeconds
      ? data.uploadThroughputTestDurationSeconds
      : default_uploadThroughputTestDurationSeconds;
  } else {
    nominalLatencyTestDurationSeconds = default_nominalLatencyTestDurationSeconds;
    downloadThroughputTestDurationSeconds = default_downloadThroughputTestDurationSeconds;
    uploadThroughputTestDurationSeconds = default_uploadThroughputTestDurationSeconds;
  }
  resetStatistics();
  ipcSendIfEnabled(Defs.ipcClearDials, {});
  ipcSendIfEnabled(Defs.ipcTimeOfTest, timeOfTest);
  retryCount = 5;
  startWatchdogTimer();
  determineNominalLatency();

  hideButton = testState && isBackgroundTask;

  ipcSendIfEnabled(Defs.ipcTestingState, { testState, hideButton, testBusy: false } );
}

function getTestStatusFromCurrent() {
  const status = {
    timeOfTest,
    nominalLatency: {
      numTicks: numTicksNominalLatency,
      tickNum: tickNumNominalLatency
    },
    nominalLatencyMillis,
    tickStatusIperf3Down: {
      numTicks: numTicksIperf3Down,
      tickNum: tickNumIperf3Down
    },
    downloadThroughputMBits,
    downloadBloatMillis,
    tickStatusIperf3Up: {
      numTicks: numTicksIperf3Up,
      tickNum: tickNumIperf3Up
    },
    uploadThroughputMBits,
    uploadBloatMillis
  };

  log(".....getTestStatus: " + JSON.stringify(status, null, 2));

  // NB position 1 == newest, -1 == oldest,  otherwise == in between.
  return { position: 1, status };
}

async function sendRecordAtPosition() {
  try {
    const jo = await roundRobinDB.read(dbScrollPos, 1);
    const ja = jo.entries;
    if (ja.length > 0) {
      const jrow = ja[0];
      if (jrow) {
        const status = jrow.data;
        ipcSend.send(Defs.ipcThrouputTestStatus, getTestStatusFromRecord(status));
      }
    }
    enableDisableIpcSend();
  } catch (err) {
    log("(Exception) throughputTest sendRecordAtPosition: " + err, "tput", "info");
  }
}

function getTestStatusFromRecord(record) {
  const status = {
    timeOfTest: record.timeOfTest,
    nominalLatency: {
      numTicks: record.nominalLatency.numTicks,
      tickNum: record.nominalLatency.tickNum
    },
    nominalLatencyMillis: record.nominalLatencyMillis,
    tickStatusIperf3Down: {
      numTicks: record.tickStatusIperf3Down.numTicks,
      tickNum: record.tickStatusIperf3Down.tickNum
    },
    downloadThroughputMBits: record.downloadThroughputMBits,
    downloadBloatMillis: record.downloadBloatMillis,
    tickStatusIperf3Up: {
      numTicks: record.tickStatusIperf3Up.numTicks,
      tickNum: record.tickStatusIperf3Up.tickNum
    },
    uploadThroughputMBits: record.uploadThroughputMBits,
    uploadBloatMillis: record.uploadBloatMillis
  };

  // NB position 1 == newest, -1 == oldest,  otherwise == in between.
  let position = dbScrollPos;
  if (dbScrollPos === dbNumEntries) position = -1;

  log(".....getTestStatusFromRecord: " + JSON.stringify(status, null, 2));

  return { position, status };
}

function testWindowCancelIpc(event, data) {
  return testWindowCancel(data);
}

function testWindowStartIpc(event, data) {
  return testWindowStart(false, data);
}

async function testWindowMount(event, data) {
  const { position } = data;

  if (position === -1) dbScrollPos = dbNumEntries;
  else dbScrollPos = position;
  enableDisableIpcSend();

  log("testWindowMount: dbScrollPos = " + dbScrollPos, "tput", "info");

  ipcSendIfEnabled(Defs.ipcTestingState, { testState, hideButton });

  await sendRecordAtPosition();
}

function handleLoginStatus(event, data) {
  log(
    "throughputTest handleLoginStatus: status = " +
      data.loginStatus +
      ", authToken = " +
      data.authToken,
    "tput",
    "info"
  );
  loggedIn = data.loginStatus === Defs.loginStatusLoggedIn;
  setAuthTokenHeader(data.authToken);
}

async function handleThroughputTestWindowButtonLeft(event, data) {
  log("throughputTest handleThroughputTestWindowButtonLeft", "tput", "info");

  if (dbScrollPos < dbNumEntries) {
    dbScrollPos++;
    log("...handleThroughputTestWindowButtonLeft: dbScrollPos = " + dbScrollPos, "tput", "info");

    try {
      const jo = await roundRobinDB.read(dbScrollPos, 1);
      const ja = jo.entries;
      if (ja.length > 0) {
        const jrow = ja[0];
        if (jrow) {
          const status = jrow.data;
          ipcSend.send(Defs.ipcThrouputTestStatus, getTestStatusFromRecord(status));
        }
      }
      enableDisableIpcSend();
    } catch (err) {
      log("(Exception) handleThroughputTestWindowButtonLeft: " + err, "tput", "info");
    }
  }
}

async function handleThroughputTestWindowButtonOldest(event, data) {
  log("throughputTest handleThroughputTestWindowButtonOldest", "tput", "info");
  if (dbScrollPos < dbNumEntries) {
    dbScrollPos = dbNumEntries;
    log("...handleThroughputTestWindowButtonOldest: dbScrollPos = " + dbScrollPos, "tput", "info");

    try {
      const jo = await roundRobinDB.read(dbScrollPos, 1);
      const ja = jo.entries;
      if (ja.length > 0) {
        const jrow = ja[0];
        if (jrow) {
          const status = jrow.data;
          ipcSend.send(Defs.ipcThrouputTestStatus, getTestStatusFromRecord(status));
        }
      }
      enableDisableIpcSend();
    } catch (err) {
      log("(Exception) handleThroughputTestWindowButtonOldest: " + err, "tput", "info");
    }
  }
}

function handleThroughputTestWindowButtonNewest(event, data) {
  log("throughputTest handleThroughputTestWindowButtonNewest", "tput", "info");

  dbScrollPos = 1;
  ipcSend.send(Defs.ipcThrouputTestStatus, getTestStatusFromCurrent());
  enableDisableIpcSend();
}

async function handleThroughputTestWindowButtonRight(event, data) {
  log("throughputTest handleThroughputTestWindowButtonRight", "tput", "info");

  if (dbScrollPos > 1) {
    dbScrollPos--;
    log("...handleThroughputTestWindowButtonRight: dbScrollPos = " + dbScrollPos, "tput", "info");

    try {
      const jo = await roundRobinDB.read(dbScrollPos, 1);
      const ja = jo.entries;
      if (ja.length > 0) {
        const jrow = ja[0];
        if (jrow) {
          const status = jrow.data;
          ipcSend.send(Defs.ipcThrouputTestStatus, getTestStatusFromRecord(status));
        }
      }
      enableDisableIpcSend();
    } catch (err) {
      log("(Exception) handleThroughputTestWindowButtonRight: " + err, "tput", "info");
    }
  }
}

function throughputTestEnableWrites(state) {
  roundRobinDB.enableWrites(state);
}

async function validateThroughputTestRrdb(userDataPath, filename) {
  const roundRobinDB = new RoundRobinDB(userDataPath, filename, rrdbDataSize, createNumEntries);

  return await roundRobinDB.validate();
}

module.exports = {
  init,
  testWindowStart,
  throughputTestEnableWrites,
  validateThroughputTestRrdb
};
