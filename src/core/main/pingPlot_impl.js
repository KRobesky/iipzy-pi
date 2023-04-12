const { constants } = require("os");
const path = require("path");

const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");
const Ping = require("iipzy-shared/src/utils/ping");
const { sleep } = require("iipzy-shared/src/utils/utils");

const { getPingTarget } = require("./services/iperf3Service");

const RoundRobinDB = require("./utils/roundRobinDB");

const isWindows = process.platform === "win32";

let configFile = null;
let http = null;
let ipcSend = null;
let userDataPath = null;
let sendAlert = null;
let ping = null;
let roundRobinDB = null;
const rrdbDataSize = 260;

let pingTarget = Defs.pingTarget;

// don't send to pingPlotWindow if not displaying latest data.
let sendLatestToWindow = false;

let leftPos = 0;
let leftId = 0;
let centerPos = 0;
let centerId = 0;

//let prevDroppedPacketId = 0;

let dbMaxEntries = 0;
let dbNumEntries = 0;
let dbHighestId = 0;
let dbLinkId = 0; // NB: backward link for dropped packets.

let consecutiveDroppedPacketCount = 0;
let firstDroppedPacketTimestamp = 0;
let lastDroppedPacketTimestamp = 0;
let alerting = false;

const _30daysAt5SecondIntervals = (30 * 24 * 60 * 60) / 5;
// const _1HourAt5SecondIntervals = (1 * 60 * 60) / 5;
// const _2HoursAt5SecondIntervals = (2 * 60 * 60) / 5;
// const _10MinutesAt5SecondIntervals = (10 * 60) / 5;
// const _5MinutesAt5SecondIntervals = (5 * 60) / 5;

const createNumEntries = _30daysAt5SecondIntervals;

let inCheckPingTarget = false;

async function init(context) {
  log("...pingPlot.init", "plot", "info");

  const {
    _configFile,
    _http,
    _standAlone,
    _ipcRecv,
    _ipcSend,
    _userDataPath,
    _sendAlert
  } = context;
  configFile = _configFile;
  http = _http;

  ipcSend = _ipcSend;
  userDataPath = _userDataPath;

  sendAlert = _sendAlert;

  _ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonHome, pingPlotWindowButtonHome);

  _ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonLeft, pingPlotWindowButtonLeft);

  _ipcRecv.registerReceiver(
    Defs.ipcPingPlotWindowButtonLeftDropped,
    pingPlotWindowButtonLeftDropped
  );

  _ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonRight, pingPlotWindowButtonRight);

  _ipcRecv.registerReceiver(
    Defs.ipcPingPlotWindowButtonRightDropped,
    pingPlotWindowButtonRightDropped
  );

  _ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonZoomChange, pingPlotWindowButtonZoomChange);

  _ipcRecv.registerReceiver(Defs.ipcPingPlotWindowMount, pingPlotWindowMount);

  _ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonHomeEx, pingPlotWindowButtonHomeEx);

  _ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonLeftEx, pingPlotWindowButtonLeftEx);

  _ipcRecv.registerReceiver(
    Defs.ipcPingPlotWindowButtonLeftDroppedEx,
    pingPlotWindowButtonLeftDroppedEx
  );

  _ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonRightEx, pingPlotWindowButtonRightEx);

  _ipcRecv.registerReceiver(
    Defs.ipcPingPlotWindowButtonRightDroppedEx,
    pingPlotWindowButtonRightDroppedEx
  );

  _ipcRecv.registerReceiver(
    Defs.ipcPingPlotWindowButtonZoomChangeEx,
    pingPlotWindowButtonZoomChangeEx
  );

  _ipcRecv.registerReceiver(Defs.ipcPingPlotWindowMountEx, pingPlotWindowMountEx);

  if (!_standAlone) return;

  roundRobinDB = new RoundRobinDB(_userDataPath, "pingPlot", rrdbDataSize, createNumEntries);

  const pingPlotZip = path.resolve(__dirname, "../../../extraResources/pingPlot.rrdb.gz");

  /*
  // for generating empty db.
  await roundRobinDB.init(null);
  return;
  */

  const { entryIndex, linkId, maxEntries, numEntries } = await roundRobinDB.init(pingPlotZip);
  dbMaxEntries = maxEntries;
  dbNumEntries = numEntries;
  dbLinkId = linkId;

  log(
    "...after new RoundRobinDB.init, maxEntries = " +
      dbMaxEntries +
      ", numEntries = " +
      dbNumEntries +
      ", linkId = " +
      dbLinkId,
    "plot"
  );

  await buildDroppedArray(linkId);
  currentClumpId = latestClumpId;

  const pingTarget_ = configFile.get("pingTarget");
  if (pingTarget_) pingTarget = pingTarget_;
  const ptcMode = configFile.get("tcMode");

  ping = new Ping("pingPlot", pingDataFunc, doneFuncDontCare, pingTarget, 0, 5, true, tcMode);
  ping.run();

  setInterval(async () => {
    if (!inCheckPingTarget) {
      inCheckPingTarget = true;
      try {
        await checkPingTarget();
      } catch (ex) {
        log("Exception) checkPingTarget: " + ex, "plot", "error");
      }
      inCheckPingTarget = false;
    }
  }, 60 * 1000);
}

// keep track of clumps of dropped pings.
// Why?  So we can scroll directly to dropped packets.
let droppedArray = [];
let currentClumpId = 0;
let latestClumpId = 0;
const DROPPED_SCROLL_DIRECTION_NONE = 0;
const DROPPED_SCROLL_DIRECTION_LEFT = 1;
const DROPPED_SCROLL_DIRECTION_RIGHT = 2;
let droppedScrollDirection = DROPPED_SCROLL_DIRECTION_NONE;

async function buildDroppedArray(linkIdHead) {
  log(">>>buildDroppedArray: linkIdHead = " + linkIdHead, "plot", "info");
  try {
    if (linkIdHead) {
      const json = await roundRobinDB.read(dbNumEntries, dbNumEntries);
      if (json != null) {
        const jo = JSON.parse(json);
        const ja = jo.entries;
        const baseId = ja[0].id;
        log("-----baseId = " + baseId, "plot", "info");
        let linkRow = linkIdHead - baseId;
        log("-----linkRow = " + linkRow, "plot", "info");
        let prevId = ja[ja.length - 1].id;
        let clumping = false;
        let prevLinkId = linkIdHead;
        let clump = {};
        // let count = 0;
        // while (linkRow > 0 && count < 50) {
        while (linkRow > 0) {
          //count++;
          console.log("-------------linkRow = " + linkRow);
          const { id, linkId } = ja[linkRow];
          // NB: bob fix for corrupted file.
          if (linkId >= id) {
            linkRow--;
            continue;
          }
          if (!clumping) {
            // start new clump.
            log(
              "-----start new clump: row = " +
                linkRow +
                ", id = " +
                id +
                ", prevId = " +
                prevId +
                ", linkId = " +
                linkId +
                ", prevLinkId = " +
                prevLinkId
            );
            clump = {};
            clump.id = id;
            clumping = true;
          }
          if (clumping && prevLinkId !== linkId + 1) {
            // end of clump.
            log(
              "-----end clump: row = " +
                linkRow +
                ", id = " +
                id +
                ", prevId = " +
                prevId +
                ", linkId = " +
                linkId +
                ", prevLinkId = " +
                prevLinkId
            );
            const clumpRightId = clump.id;
            clump.id = id;
            clump.rightId = clumpRightId;
            clump.length = clump.rightId - clump.id + 1;
            // add to front of array.
            log("-----clump: " + JSON.stringify(clump, null, 2));
            droppedArray.unshift(clump);
            clumping = false;
          }
          prevId = id;
          prevLinkId = linkId;
          linkRow = linkId - baseId;
          if (linkRow <= 0) {
            if (clumping) {
              // last clump.
              log(
                "-----last clump: row = " +
                  linkRow +
                  ", id = " +
                  id +
                  ", prevId = " +
                  prevId +
                  ", linkId = " +
                  linkId +
                  ", prevLinkId = " +
                  prevLinkId
              );
              const clumpRightId = clump.id;
              clump.id = prevId;
              clump.rightId = clumpRightId;
              clump.length = clump.rightId - clump.id + 1;
              // add to array.
              log("-----last clump: " + JSON.stringify(clump, null, 2));
              droppedArray.unshift(clump);
            }
            break;
          }
        }
      }
    }

    droppedArray.unshift({ id: 0, rightId: 0, length: 0 }); // dummy oldest entry uses droppedArray[0].

    currentClumpId = latestClumpId = droppedArray.length - 1;

    log("droppedArray = " + JSON.stringify(droppedArray, null, 2), "plot", "info");
  } catch (ex) {
    log("(Exception) buildDroppedArray: " + ex, "plot", "info");
    droppedArray = [];
  }

  log("<<<buildDroppedArray", "plot", "info");
}

let udaClumping = false;
let udaClump = {};

function updateDroppedArray(id, dropped) {
  if (dropped) {
    if (!udaClumping) {
      // start new clump.
      log("-----start new clump: id = " + id);
      udaClump = {};
      udaClump.id = id;
      udaClumping = true;
    }
  } else {
    if (udaClumping) {
      // end clump
      log("-----end clump: id = " + id);
      udaClump.rightId = id - 1;
      udaClump.length = udaClump.rightId - udaClump.id + 1;
      // add to array.
      log("...final clump= " + JSON.stringify(udaClump));
      droppedArray.push(udaClump);

      latestClumpId = droppedArray.length - 1;

      udaClumping = false;

      log("droppedArray = " + JSON.stringify(droppedArray, null, 2), "plot", "info");
    }
  }

  const oldestId = id - createNumEntries;
  if (droppedArray.length > 1 && oldestId > 0) {
    // see if oldest clump has been dropped.
    const oldestClump = droppedArray[1];
    if (oldestClump.id <= oldestId) {
      log("---dropping clump for id = " + oldestClump.id, "plot", "info");
      log("droppedArray - before drop = " + JSON.stringify(droppedArray, null, 2), "plot", "info");
      droppedArray.splice(1, 1);
      latestClumpId = droppedArray.length - 1;
      log("droppedArray after drop = " + JSON.stringify(droppedArray, null, 2), "plot", "info");
    }
  }
}

function fundCurrentClumpLinear(centerId) {
  log(">>>fundCurrentClumpLinear: centerId = " + centerId, "plot", "info");
  let clumpId = 0;
  for (let i = droppedArray.length - 1; i > 1; i--) {
    const { id } = droppedArray[i];
    if (id < centerId) {
      clumpId = i;
      break;
    }
  }
  log("<<<fundCurrentClumpLinear: clumpId = " + clumpId, "plot", "info");
  return clumpId;
}

// NB: Modified binary search. See: https://en.wikipedia.org/wiki/Binary_search_algorithm
//   bias added because we are not looking for an exact match.
//   Instead, we are looking for an entry where id < centerId && id > centerId - 1;
function fundCurrentClumpBinary(centerId) {
  log(">>>fundCurrentClumpBinary: centerId = " + centerId, "plot", "info");
  let left = 0;
  let middle = 0;
  let right = droppedArray.length - 1;
  let bias = 0;
  while (left <= right) {
    middle = Math.floor((left + right) / 2);
    let middleId = droppedArray[middle].id;
    if (middleId < centerId) {
      left = middle + 1;
      bias = 0;
    } else if (middleId > centerId) {
      right = middle - 1;
      bias = -1;
    } else break;
  }
  middle += bias;
  log("<<<fundCurrentClumpBinary: clumpId = " + middle, "plot", "info");
  return middle;
}

const roundToTwo = num => {
  return +(Math.round(num + "e+1") + "e-1");
};

async function checkPingTarget() {
  log("checkPingTarget", "plot", "info");
  const { pingTarget: pingTarget_ } = await getPingTarget(http);
  if (pingTarget_ && pingTarget_ !== pingTarget) {
    log("checkPingTarget: old target = " + pingTarget + ", new target = " + pingTarget_, "plot");
    pingTarget = pingTarget_;
    await configFile.set("pingTarget", pingTarget);
    if (ping) {
      ping.cancel();
      ping = new Ping("pingPlot", pingDataFunc, doneFuncDontCare, pingTarget, 0, 5, true);
      ping.run();
    }
  }
}

function doneFuncDontCare(code, val) {
  log("doneFuncDontCare: code = " + code + ", val = " + val, "plot", "info");
}

async function alert(numDropped, timestampFirst, timestampLast) {
  log("pingPlot.alert", "plot", "info");
  const alert = {
    subEventClass: Defs.eventClass_pingFail,
    subObjectType: Defs.objectType_clientInstance,
    subObjectId: configFile.get("clientToken"),
    eventActive: Defs.eventActive_activeAutoInactive,
    message: "Ping failure: " + numDropped + " consecutive ping failures",
    info: { numDropped, timestampFirst, timestampLast }
  };

  // NB: don't wait.
  if (sendAlert) sendAlert(http, alert);
}

async function checkPingSuccess(joData) {
  // alert on any dropped.

  log(
    ">>>pingPlot.checkPingSuccess: dropped = " +
      joData.dropped +
      ", consecutive = " +
      consecutiveDroppedPacketCount,
    "plot",
    "info"
  );

  if (joData.dropped) {
    consecutiveDroppedPacketCount++;
    if (consecutiveDroppedPacketCount === 1) firstDroppedPacketTimestamp = Date.now();
    lastDroppedPacketTimestamp = Date.now();
  } else {
    if (consecutiveDroppedPacketCount > 0) {
      // NB: alert after first no drop.
      await alert(
        consecutiveDroppedPacketCount,
        firstDroppedPacketTimestamp,
        lastDroppedPacketTimestamp
      );

      consecutiveDroppedPacketCount = 0;
    }
  }
  log("<<<pingPlot.checkPingSuccess", "plot", "info");
}

function computePositionInfo(jo) {
  log(
    ">>>pingPlot.computePositionInfo: dbHighestId = " +
      dbHighestId +
      ", leftPos = " +
      leftPos +
      ", centerPos = " +
      centerPos +
      ", leftId = " +
      leftId +
      ", centerId = " +
      centerId +
      ", currentClumpId = " +
      currentClumpId,
    "plot",
    "info"
  );
  dbHighestId = jo.highestId;
  const ja = jo.entries;
  const center = Math.round(ja.length / 2);
  if (ja.length > 0) {
    leftId = ja[0].id;
    leftPos = dbHighestId - leftId;
    centerId = leftId + center;
    centerPos = leftPos - center;
  }
  //currentClumpId = fundCurrentClumpLinear(centerId);
  currentClumpId = fundCurrentClumpBinary(centerId);

  log(
    "<<<pingPlot.computePositionInfo: dbHighestId = " +
      dbHighestId +
      ", leftPos = " +
      leftPos +
      ", centerPos = " +
      centerPos +
      ", leftId = " +
      leftId +
      ", centerId = " +
      centerId +
      ", currentClumpId = " +
      currentClumpId,
    "plot",
    "info"
  );
}

async function pingDataFunc(json) {
  log(
    "...>>>pingPlot.dataFunc: json = " + json + ", sendLatestToWindow = " + sendLatestToWindow,
    "plot",
    "info"
  );

  if (json === "{}") return;

  const { numEntries, id, linkId } = roundRobinDB.write(json, dbLinkId);
  dbNumEntries = numEntries;
  dbLinkId = linkId;

  const joData = JSON.parse(json);
  if (joData.dropped) dbLinkId = id;
  log("...pingDataFunc: dbLinkId = " + dbLinkId, "plot", "info");

  updateDroppedArray(id, joData.dropped);

  // log(
  //   "...pingDataFunc, numEntries = " +
  //     dbNumEntries +
  //     " @" +
  //     new Date().toISOString(), "plot", "info"
  // );

  await checkPingSuccess(joData);

  if (sendLatestToWindow) {
    ////
    let jsonWithStats =
      '{"maxEntries":' +
      dbMaxEntries +
      ', "numEntries":' +
      dbNumEntries +
      ', "oldest":false' +
      ', "newest":true' +
      ', "droppedLeft":' +
      (latestClumpId > 0) +
      ', "droppedRight":false' +
      ', "entries":[{"id":' +
      id +
      ', "linkId":' +
      dbLinkId +
      ', "data":';
    jsonWithStats += json;
    jsonWithStats += "}]}";

    //
    log("...jsonWithStats=" + jsonWithStats, "plot", "info");

    ipcSend.send(Defs.ipcPingPlotData, JSON.parse(jsonWithStats));
  }
  log("...<<<pingPlot.dataFunc = " + json, "plot", "info");
}

async function filter(jo, numSamples) {
  let joRet = {};

  // log("--------------------filter--------------------");
  // log("maxEntries = " + jo.maxEntries);
  // log("numEntries = " + jo.numEntries);
  // log("oldest = " + jo.oldest);
  // log("newest = " + jo.newest);

  try {
    if (numSamples > 1) {
      // filter.
      /*
        this.maxEntries = jo["maxEntries"];
        this.numEntries = jo["numEntries"];
        this.oldest = jo["oldest"];
        const ja = jo["entries"];
      */
      let jaRet = [];
      const ja = jo.entries;

      /*
      { id: 182852,
        linkId: 117310,
        data:
        { timeMillis: 6,
          dropped: false,
          timeStamp: '2019-10-15T18:55:05.044Z' 
        } 
      }
      */
      // debugging
      let center = Math.round(numSamples / 2);

      let sampleId = 0;
      let sampleLinkId = 0;
      let samplesNotDroppedCount = 0;
      let sampleMillisTotal = 0;
      let sampleDropped = false;
      let sampleTimeStamp = null;
      let dataPrev = null;
      let s = 1;
      for (let i = 0; i < ja.length; i++) {
        // NB: allow other stuff to run.
        if (s % 20000 === 0) {
          //log("...filter - sleeping(" + s + ")");
          await sleep(250);
        }
        s++;
        const { id, linkId, data } = ja[i];
        //if (i === center) log("-----center = " + JSON.stringify(ja[i]));
        // NB: handle empty rows.
        const { timeMillis, dropped, timeStamp, rx_rate_bits, tx_rate_bits } = data.timeMillis !== undefined ? data : dataPrev;
        if (data.timeMillis !== undefined) {
          //log("---filter---saving prev");
          dataPrev = data;
        }
        if (timeMillis === undefined) {
          //log("---filter---skipping");
          continue;
        }

        if (dropped) sampleDropped = true;
        if (!dropped) {
          sampleMillisTotal += parseFloat(timeMillis);
          samplesNotDroppedCount++;
        }
        if (sampleId === 0) {
          sampleId = id;
          sampleLinkId = linkId;
          sampleTimeStamp = timeStamp;
        }
        if ((i + 1) % numSamples === 0) {
          const timeMillisAvg = roundToTwo(sampleMillisTotal / samplesNotDroppedCount);
          const row = {
            id: sampleId,
            linkId: sampleLinkId,
            data: {
              timeMillis: timeMillisAvg,
              dropped: sampleDropped,
              timeStamp: sampleTimeStamp,
              rx_rate_bits: rx_rate_bits,
              tx_rate_bits: tx_rate_bits,
            }
          };
          jaRet.push(row);
          sampleId = 0;
          sampleLinkId = 0;
          samplesNotDroppedCount = 0;
          sampleMillisTotal = 0;
          sampleDropped = false;
          sampleTimeStamp = null;
        }
      }
      joRet.maxEntries = jo.maxEntries;
      joRet.numEntries = jo.numEntries;
      joRet.oldest = jo.oldest;
      joRet.newest = jo.newest;
      joRet.droppedLeft = jo.droppedLeft;
      joRet.droppedRight = jo.droppedRight;
      joRet.prevDBLinkId = jo.prevDBLinkId;
      joRet.nextDBLinkId = jo.nextDBLinkId;
      joRet.entries = jaRet;
      log("-------filtered- num entries = " + jaRet.length);
    } else {
      joRet = jo;
    }

    log("...filter: leftPos = " + leftPos, "plot", "info");
  } catch (err) {
    log("(Exception) filter: " + err, "plot", "error");
  }

  return joRet;
}

async function pingPlotWindowMountEx(event, data) {
  log(
    "pingPlotWindowMount: data = " + JSON.stringify(data) + ", leftPos = " + leftPos,
    "plot",
    "info"
  );

  const { numPoints, numSamples, numScrollUnitSamples } = data;
  const numPointsSamples = numPoints * numSamples;

  //const atHome = leftPos === 0;
  const atHome = leftPos <= numPointsSamples;

  leftPos = atHome ? numPointsSamples : leftPos;

  const json = await roundRobinDB.read(leftPos, numPointsSamples);

  try {
    const jo = JSON.parse(json);
    computePositionInfo(jo);

    jo.droppedLeft = latestClumpId !== 0 && currentClumpId > 0;
    jo.droppedRight = latestClumpId !== 0 && currentClumpId < latestClumpId;

    log("...pingPlotWindowMount: leftPos = " + leftPos, "plot", "info");

    ipcSend.send(Defs.ipcPingPlotData, await filter(jo, numSamples));
  } catch (err) {
    log("(Exception) failed to parse json: " + err, "plot", "error");
  }

  sendLatestToWindow = atHome;
}

async function pingPlotWindowButtonHomeEx(event, data) {
  log("pingPlotWindowButtonHome: data = " + JSON.stringify(data), "plot", "info");

  const { numPoints, numSamples, numScrollUnitSamples } = data;
  const numPointsSamples = numPoints * numSamples;

  leftPos = 0;

  currentClumpId = latestClumpId;
  droppedScrollDirection = DROPPED_SCROLL_DIRECTION_NONE;

  const json = await roundRobinDB.read(numPointsSamples, numPointsSamples);
  try {
    const jo = JSON.parse(json);
    computePositionInfo(jo);

    jo.droppedLeft = latestClumpId !== 0 && currentClumpId > 0;
    jo.droppedRight = false;

    log(
      "...pingPlotWindowButtonHome: leftPos = " + leftPos + ", centerPos = " + centerPos,
      "plot",
      "info"
    );

    ipcSend.send(Defs.ipcPingPlotData, await filter(jo, numSamples));
  } catch (err) {
    log("(Exception) failed to parse json: " + err, "plot", "error");
  }

  sendLatestToWindow = true;
}

async function pingPlotWindowButtonLeftEx(event, data) {
  log(
    "pingPlotWindowButtonLeft: data = " + JSON.stringify(data) + ", leftPos = " + leftPos,
    "plot",
    "info"
  );

  const { numPoints, numSamples, numScrollUnitSamples } = data;
  const numPointsSamples = numPoints * numSamples;

  leftPos =
    leftPos === 0 ? numPointsSamples + numScrollUnitSamples : leftPos + numScrollUnitSamples;

  const json = await roundRobinDB.read(leftPos, numPointsSamples);
  try {
    const jo = JSON.parse(json);
    computePositionInfo(jo);

    jo.droppedLeft = latestClumpId !== 0 && currentClumpId > 0;
    jo.droppedRight = latestClumpId !== 0 && currentClumpId < latestClumpId;

    log("...pingPlotWindowButtonLeft: leftPos = " + leftPos, "plot", "info");

    ipcSend.send(Defs.ipcPingPlotData, await filter(jo, numSamples));
  } catch (err) {
    log("Exception) pingPlotWindowButtonLeft: " + err, "plot", "info");
  }

  sendLatestToWindow = false;
}

async function pingPlotWindowButtonLeftDroppedEx(event, data) {
  log("pingPlotWindowButtonLeftDropped", "plot", "info");

  const { numPoints, numSamples, numScrollUnitSamples } = data;
  const numPointsSamples = numPoints * numSamples;

  try {
    if (latestClumpId === 0) return;

    if (droppedScrollDirection !== DROPPED_SCROLL_DIRECTION_NONE)
      currentClumpId = Math.max(currentClumpId - 1, 1);
    droppedScrollDirection = DROPPED_SCROLL_DIRECTION_LEFT;

    const clump = droppedArray[currentClumpId];
    const droppedId = clump.id + Math.floor(clump.length / 2);
    const center = (numPointsSamples / 2) | 0;

    const json = await roundRobinDB.readId(droppedId + center, numPointsSamples, false);
    if (json != null) {
      const jo = JSON.parse(json);
      computePositionInfo(jo);

      jo.droppedLeft = latestClumpId !== 0 && currentClumpId > 1;
      jo.droppedRight = latestClumpId !== 0 && currentClumpId < latestClumpId;

      ipcSend.send(Defs.ipcPingPlotData, await filter(jo, numSamples));
      sendLatestToWindow = false;
    }
  } catch (err) {
    log("(Exception) pingPlotWindowButtonLeftDropped: " + err, "plot", "error");
  }
}

async function pingPlotWindowButtonRightEx(event, data) {
  log(
    "pingPlotWindowButtonRight: data = " + JSON.stringify(data) + ", leftPos = " + leftPos,
    "plot",
    "info"
  );

  const { numPoints, numSamples, numScrollUnitSamples } = data;
  const numPointsSamples = numPoints * numSamples;

  let atHome = leftPos === 0;
  if (!atHome) {
    leftPos -= numScrollUnitSamples;
    if (leftPos < 0) {
      leftPos = 0;
      atHome = true;
    }

    const json = await roundRobinDB.read(leftPos, numPointsSamples);
    try {
      const jo = JSON.parse(json);
      computePositionInfo(jo);

      jo.droppedLeft = latestClumpId !== 0 && currentClumpId > 0;
      jo.droppedRight = latestClumpId !== 0 && currentClumpId < latestClumpId;

      log("...pingPlotWindowButtonRight: leftPos = " + leftPos, "plot", "info");

      ipcSend.send(Defs.ipcPingPlotData, await filter(jo, numSamples));
    } catch (err) {
      log("(Exception) pingPlotWindowButtonRight: " + err, "plot", "error");
    }
  }

  if (atHome) sendLatestToWindow = true;
}

async function pingPlotWindowButtonRightDroppedEx(event, data) {
  log("pingPlotWindowButtonRightDropped", "plot", "info");

  const { numPoints, numSamples, numScrollUnitSamples } = data;
  const numPointsSamples = numPoints * numSamples;

  try {
    if (latestClumpId === 0) return;

    if (currentClumpId === latestClumpId) return;

    if (currentClumpId === 0) currentClumpId++;
    currentClumpId = Math.min(currentClumpId + 1, latestClumpId);
    droppedScrollDirection = DROPPED_SCROLL_DIRECTION_RIGHT;

    const clump = droppedArray[currentClumpId];
    const droppedId = clump.id + Math.floor(clump.length / 2);
    const center = (numPointsSamples / 2) | 0;

    const json = await roundRobinDB.readId(droppedId + center, numPointsSamples, false);
    if (json != null) {
      const jo = JSON.parse(json);
      computePositionInfo(jo);

      jo.droppedLeft = latestClumpId !== 0 && currentClumpId > 0;
      jo.droppedRight = latestClumpId !== 0 && currentClumpId < latestClumpId;

      ipcSend.send(Defs.ipcPingPlotData, await filter(jo, numSamples));
      sendLatestToWindow = false;
    }
  } catch (err) {
    log("(Exception) pingPlotWindowButtonRightDropped: " + err, "plot", "error");
  }
}

async function pingPlotWindowButtonZoomChangeEx(event, data) {
  log("pingPlotWindowButtonZoomChangeEx: data = " + JSON.stringify(data), "plot", "info");

  const { numPoints, numSamples, numScrollUnitSamples } = data.zoom;
  // NB: > 0, move right. < 0 move left.
  const { moveOffset } = data;

  const numPointsSamples = numPoints * numSamples;
  const numPointsSamplesHalf = Math.round(numPointsSamples / 2);

  log(
    "pingPlotWindowButtonZoomChangeEx: leftPos= " +
      leftPos +
      ", centerPos=" +
      centerPos +
      ", numPointsSamples = " +
      numPointsSamples +
      ", numPointsSamplesHalf = " +
      numPointsSamplesHalf +
      ", moveOffset = " +
      moveOffset,
    "plot",
    "info"
  );

  if (leftPos === 0) leftPos = numPointsSamples;

  let newLeftPos = centerPos + numPointsSamplesHalf - moveOffset;
  leftPos = Math.max(newLeftPos, numPointsSamples);

  const json = await roundRobinDB.read(leftPos, numPointsSamples);
  try {
    //log("---before parse", "plot", "info");
    // // NB: allow other stuff to run.
    // if (numPointsSamples >= 20000) await sleep(500);
    const jo = JSON.parse(json);
    // NB: allow other stuff to run.
    if (numPointsSamples >= 20000) await sleep(250);
    //log("---after parse", "plot", "info");
    computePositionInfo(jo);

    jo.droppedLeft = latestClumpId !== 0 && currentClumpId > 0;
    jo.droppedRight = latestClumpId !== 0 && currentClumpId < latestClumpId;

    ipcSend.send(Defs.ipcPingPlotData, await filter(jo, numSamples));
  } catch (ex) {
    log("(Exception) pingPlotWindowButtonZoomChangeEx: " + ex);
  }

  log("...pingPlotWindowButtonZoomChange: leftPos = " + leftPos, "plot", "info");

  if (numSamples !== 1) sendLatestToWindow = false;
  else sendLatestToWindow = leftPos <= numPointsSamples;
}

async function pingPlotWindowButtonHome(event, numPoints) {
  return pingPlotWindowButtonHomeEx(event, {
    numPoints,
    numSamples: 1,
    numScrollUnitSamples: _5minutesAt5SecondIntervals
  });
}
async function pingPlotWindowButtonLeft(event, numPoints) {
  return pingPlotWindowButtonLeftEx(event, {
    numPoints,
    numSamples: 1,
    numScrollUnitSamples: _5minutesAt5SecondIntervals
  });
}
async function pingPlotWindowButtonLeftDropped(event, numPoints) {
  return pingPlotWindowButtonLeftDroppedEx(event, {
    numPoints,
    numSamples: 1,
    numScrollUnitSamples: _5minutesAt5SecondIntervals
  });
}
async function pingPlotWindowButtonRight(event, numPoints) {
  return pingPlotWindowButtonRightEx(event, {
    numPoints,
    numSamples: 1,
    numScrollUnitSamples: _5minutesAt5SecondIntervals
  });
}
async function pingPlotWindowButtonRightDropped(event, numPoints) {
  return pingPlotWindowButtonRightDroppedEx(event, {
    numPoints,
    numSamples: 1,
    numScrollUnitSamples: _5minutesAt5SecondIntervals
  });
}
async function pingPlotWindowButtonZoomChange(event, numPoints) {
  return pingPlotWindowButtonZoomChangeEx(event, {
    params: {
      numPoints,
      numSamples: 1,
      numScrollUnitSamples: _5minutesAt5SecondIntervals
    },
    moveOffset: 0
  });
}
async function pingPlotWindowMount(event, numPoints) {
  return pingPlotWindowMountEx(event, {
    params: {
      numPoints,
      numSamples: 1,
      numScrollUnitSamples: _5minutesAt5SecondIntervals
    }
  });
}
function pingPlotEnableWrites(state) {
  roundRobinDB.enableWrites(state);
}

function final() {}

async function validatePingPlotRrdb(userDataPath, filename) {
  const roundRobinDB = new RoundRobinDB(userDataPath, filename, rrdbDataSize, createNumEntries);

  return await roundRobinDB.validate();
}

module.exports = {
  init,
  final,
  pingPlotEnableWrites,
  pingPlotWindowButtonHome,
  pingPlotWindowButtonLeft,
  pingPlotWindowButtonLeftDropped,
  pingPlotWindowButtonRight,
  pingPlotWindowButtonRightDropped,
  pingPlotWindowButtonZoomChange,
  pingPlotWindowMount,
  validatePingPlotRrdb
};
