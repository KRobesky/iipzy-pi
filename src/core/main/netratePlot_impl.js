const { constants } = require("os");
const path = require("path");

const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");
const { sleep } = require("iipzy-shared/src/utils/utils");

const { getPingTarget } = require("./services/iperf3Service");

const RoundRobinDB = require("./utils/roundRobinDB");
const Ping = require("./ping");

const rrdbDataSize = 80;
const _30daysAt5SecondIntervals = (30 * 24 * 60 * 60) / 5;
// const _1HourAt5SecondIntervals = (1 * 60 * 60) / 5;
// const _2HoursAt5SecondIntervals = (2 * 60 * 60) / 5;
// const _10MinutesAt5SecondIntervals = (10 * 60) / 5;
// const _5MinutesAt5SecondIntervals = (5 * 60) / 5;
const createNumEntries = _30daysAt5SecondIntervals;

const DROPPED_SCROLL_DIRECTION_NONE = 0;
const DROPPED_SCROLL_DIRECTION_LEFT = 1;
const DROPPED_SCROLL_DIRECTION_RIGHT = 2;

const roundToTwo = num => {
  return +(Math.round(num + "e+1") + "e-1");
};

class NetRatePlot {
  constructor(title, context) {
    log(
      "NetRatePlot.constructor: title = " +
      title,
      "rate",
      "info"
    );

    /*
    const context = {
      _clientName: clientName,
      _clientType: "appliance",
      _configFile: configFile,
      _gatewayIPAddress: gatewayIPAddress,
      _http: http,
      _ipcRecv: ipcRecv,
      _ipcSend: ipcSend,
      _localIPAddress: localIPAddress,
      _platformInfo: platformInfo_,
      _publicIPAddress: publicIPAddress,
      _sendAlert: sendAlert,
      _serialNumber: serialNumber,
      _standAlone: true,
      _userDataPath: userDataPath
    };
  */

    this.configFile = context._configFile;
    this.ipcRecv = context._ipcRecv;
    this.ipcSend = context._ipcSend;
    this.userDataPath = context._userDataPath;
    this.standAlone = context._standAlone;

    this.netRate = null;
    this.roundRobinDB = null;

  // don't send to netratePlotWindow if not displaying latest data.
    this.sendLatestToWindow = false;

    this.leftPos = 0;
    this.leftId = 0;
    this.centerPos = 0;
    this.centerId = 0;

    this.dbMaxEntries = 0;
    this.dbNumEntries = 0;
    this.dbHighestId = 0;
    this.dbLinkId = 0; // NB: backward link for dropped packets.

    /*
    // keep track of clumps of dropped pings.
    // Why?  So we can scroll directly to dropped packets.
    this.consecutiveDroppedPacketCount = 0;
    this.firstDroppedPacketTimestamp = 0;
    this.lastDroppedPacketTimestamp = 0;

    this.droppedArray = [];
    this.currentClumpId = 0;
    this.latestClumpId = 0;

    this.droppedScrollDirection = DROPPED_SCROLL_DIRECTION_NONE;

    this.udaClumping = false;
    this.udaClump = {};
    */
  }


  async start() {
    log("NetRatePlot.start", "ratp", "info");

    this.ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonHome, pingPlotWindowButtonHome);

    this.ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonLeft, pingPlotWindowButtonLeft);

    this.ipcRecv.registerReceiver(
      Defs.ipcPingPlotWindowButtonLeftDropped,
      pingPlotWindowButtonLeftDropped
    );

    this.ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonRight, pingPlotWindowButtonRight);

    this.ipcRecv.registerReceiver(
      Defs.ipcPingPlotWindowButtonRightDropped,
      pingPlotWindowButtonRightDropped
    );

    this.ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonZoomChange, pingPlotWindowButtonZoomChange);

    this.ipcRecv.registerReceiver(Defs.ipcPingPlotWindowMount, pingPlotWindowMount);

    this.ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonHomeEx, pingPlotWindowButtonHomeEx);

    this.ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonLeftEx, pingPlotWindowButtonLeftEx);

    this.ipcRecv.registerReceiver(
      Defs.ipcPingPlotWindowButtonLeftDroppedEx,
      pingPlotWindowButtonLeftDroppedEx
    );

    this.ipcRecv.registerReceiver(Defs.ipcPingPlotWindowButtonRightEx, pingPlotWindowButtonRightEx);

    this.ipcRecv.registerReceiver(
      Defs.ipcPingPlotWindowButtonRightDroppedEx,
      pingPlotWindowButtonRightDroppedEx
    );

    this.ipcRecv.registerReceiver(
      Defs.ipcPingPlotWindowButtonZoomChangeEx,
      pingPlotWindowButtonZoomChangeEx
    );

    this.ipcRecv.registerReceiver(Defs.ipcPingPlotWindowMountEx, pingPlotWindowMountEx);

    if (!this.standAlone) return;

    this.roundRobinDB = new RoundRobinDB(this.userDataPath, "netratePlot", rrdbDataSize, createNumEntries);
    let netratePlotZip = path.resolve(__dirname, "../../../extraResources/pingPlot.rrdb.gz");
    const { entryIndex, linkId, maxEntries, numEntries } = await roundRobinDB.init(netratePlotZip);
    this.dbMaxEntries = maxEntries;
    this.dbNumEntries = numEntries;
    this.dbLinkId = linkId;

    log(
      "NetRatePlot.start: after new RoundRobinDB.init, maxEntries = " +
        this.dbMaxEntries +
        ", numEntries = " +
        this.dbNumEntries +
        ", linkId = " +
        this.dbLinkId,
      "ratp"
    );

    /*
    await buildDroppedArray(linkId);
    currentClumpId = latestClumpId;
    */

    this.netRate = new PNetRate("netratePlot", netrateDataFunc, doneFuncDontCare, 0, 5);
    netrate.run();
  }

  /*

  // Dropped packet handling
  async  buildDroppedArray(linkIdHead) {
    log(">>>buildDroppedArray: linkIdHead = " + linkIdHead, "ratp", "info");
    try {
      if (linkIdHead) {
        const json = await roundRobinDB.read(dbNumEntries, dbNumEntries);
        if (json != null) {
          const jo = JSON.parse(json);
          const ja = jo.entries;
          const baseId = ja[0].id;
          log("-----baseId = " + baseId, "ratp", "info");
          let linkRow = linkIdHead - baseId;
          log("-----linkRow = " + linkRow, "ratp", "info");
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

      log("droppedArray = " + JSON.stringify(droppedArray, null, 2), "ratp", "info");
    } catch (ex) {
      log("(Exception) buildDroppedArray: " + ex, "ratp", "info");
      droppedArray = [];
    }

    log("<<<buildDroppedArray", "ratp", "info");
  }

  updateDroppedArray(id, dropped) {
    if (dropped) {
      if (!udaClumping) {
        // start new clump.
        log("-----start new clump: id = " + id);
        this.udaClump = {};
        this.udaClump.id = id;
        udaClumping = true;
      }
    } else {
      if (udaClumping) {
        // end clump
        log("-----end clump: id = " + id);
        this.udaClump.rightId = id - 1;
        this.udaClump.length = this.udaClump.rightId - this.udaClump.id + 1;
        // add to array.
        log("...final clump= " + JSON.stringify(this.udaClump));
        droppedArray.push(this.udaClump);

        latestClumpId = droppedArray.length - 1;

        udaClumping = false;

        log("droppedArray = " + JSON.stringify(droppedArray, null, 2), "ratp", "info");
      }
    }

    const oldestId = id - createNumEntries;
    if (droppedArray.length > 1 && oldestId > 0) {
      // see if oldest clump has been dropped.
      const oldestClump = droppedArray[1];
      if (oldestClump.id <= oldestId) {
        log("---dropping clump for id = " + oldestClump.id, "ratp", "info");
        log("droppedArray - before drop = " + JSON.stringify(droppedArray, null, 2), "ratp", "info");
        droppedArray.splice(1, 1);
        latestClumpId = droppedArray.length - 1;
        log("droppedArray after drop = " + JSON.stringify(droppedArray, null, 2), "ratp", "info");
      }
    }
  }

  fundCurrentClumpLinear(centerId) {
    log(">>>fundCurrentClumpLinear: centerId = " + centerId, "ratp", "info");
    let clumpId = 0;
    for (let i = droppedArray.length - 1; i > 1; i--) {
      const { id } = droppedArray[i];
      if (id < centerId) {
        clumpId = i;
        break;
      }
    }
    log("<<<fundCurrentClumpLinear: clumpId = " + clumpId, "ratp", "info");
    return clumpId;
  }

  // NB: Modified binary search. See: https://en.wikipedia.org/wiki/Binary_search_algorithm
  //   bias added because we are not looking for an exact match.
  //   Instead, we are looking for an entry where id < centerId && id > centerId - 1;
  fundCurrentClumpBinary(centerId) {
    log(">>>fundCurrentClumpBinary: centerId = " + centerId, "ratp", "info");
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
    log("<<<fundCurrentClumpBinary: clumpId = " + middle, "ratp", "info");
    return middle;
  }

  doneFuncDontCare(code, val) {
    log("doneFuncDontCare: code = " + code + ", val = " + val, "ratp", "info");
  }
*/

  computePositionInfo(jo) {
    log(
      ">>>NetRatePlot.computePositionInfo: dbHighestId = " +
        this.dbHighestId +
        ", leftPos = " +
        this.leftPos +
        ", centerPos = " +
        this.centerPos +
        ", leftId = " +
        this.leftId +
        ", centerId = " +
        this.centerId +
        ", currentClumpId = " +
        this.currentClumpId,
      "ratp",
      "info"
    );
    this.dbHighestId = jo.highestId;
    const ja = jo.entries;
    const center = Math.round(ja.length / 2);
    if (ja.length > 0) {
      this.newestleftId = ja[0].id;
      this.leftPos = this.dbHighestId - this.leftId;
      this.centerId = this.leftId + center;
      this.centerPos = this.leftPos - center;
    }

    /*
    //currentClumpId = fundCurrentClumpLinear(centerId);
    this.currentClumpId = fundCurrentClumpBinary(centerId);
    */

    log(
      "<<<NetRatePlot.computePositionInfo: dbHighestId = " +
        this.dbHighestId +
        ", leftPos = " +
        this.leftPos +
        ", centerPos = " +
        this.centerPos +
        ", leftId = " +
        this.leftId +
        ", centerId = " +
        this.centerId  /*+
        ", currentClumpId = " +
        this.currentClumpId */,
      "ratp",
      "info"
    );
  }

  async netRateDataFunc(json) {
    log(
      "...>>>NetRatePlot.dataFunc: json = " + json + ", sendLatestToWindow = " + sendLatestToWindow,
      "ratp",
      "info"
    );

    if (json === "{}") return;

    const { numEntries, id, linkId } = this.roundRobinDB.write(json, this.dbLinkId);
    this.dbNumEntries = numEntries;
    this.dbLinkId = linkId;

    const joData = JSON.parse(json);
    /*
    if (joData.dropped) this.dbLinkId = id;
    log("NetRatePlot.dataFunc: dbLinkId = " + this.dbLinkId, "ratp", "info");

    this.updateDroppedArray(id, joData.dropped);
    */

    // log(
    //   "NetRatePlot.dataFunc, numEntries = " +
    //     this.dbNumEntries +
    //     " @" +
    //     new Date().toISOString(), "ratp", "info"
    // );

    /*
    await checkNetRateSuccess(joData);
    */

    if (this.sendLatestToWindow) {
      ////
      let jsonWithStats =
        '{"maxEntries":' + this.dbMaxEntries +
        ', "numEntries":' + this.dbNumEntries +
        ', "oldest":false' +
        ', "newest":true' + /*
        ', "droppedLeft":' +
        (this.latestClumpId > 0) +
        ', "droppedRight":false' + 
        ', "entries":[{"id":' +
        id +
        ', "linkId":' +
        dbLinkId + */
        ', "data":';
      jsonWithStats += json;
      jsonWithStats += "}]}";

      //
      log("...jsonWithStats=" + jsonWithStats, "ratp", "info");

      ipcSend.send(Defs.ipcPingPlotData, JSON.parse(jsonWithStats));
    }
    log("...<<<NetRatePlot.dataFunc = " + json, "ratp", "info");
}

  async filter(jo, numSamples) {
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
          const { timeMillis, dropped, timeStamp } = data.timeMillis !== undefined ? data : dataPrev;
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
                timeStamp: sampleTimeStamp
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

      log("...filter: leftPos = " + leftPos, "ratp", "info");
    } catch (err) {
      log("(Exception) filter: " + err, "ratp", "error");
    }

    return joRet;
  }

  async pingPlotWindowMountEx(event, data) {
    log(
      "pingPlotWindowMount: data = " + JSON.stringify(data) + ", leftPos = " + leftPos,
      "ratp",
      "info"
    );

    const { numPoints, numSamples, numScrollUnitSamples } = data;
    const numPointsSamples = numPoints * numSamples;

    //const atHome = leftPos === 0;
    const atHome = this.leftPos <= numPointsSamples;

    leftPos = atHome ? numPointsSamples : this.leftPos;

    const json = await roundRobinDB.read(this.leftPos, numPointsSamples);

    try {
      const jo = JSON.parse(json);
      computePositionInfo(jo);

      /*
      jo.droppedLeft = latestClumpId !== 0 && currentClumpId > 0;
      jo.droppedRight = latestClumpId !== 0 && currentClumpId < latestClumpId;
      */

      log("...pingPlotWindowMount: leftPos = " + this.leftPos, "ratp", "info");

      this.ipcSend.send(Defs.ipcPingPlotData, await filter(jo, numSamples));
    } catch (err) {
      log("(Exception) failed to parse json: " + err, "ratp", "error");
    }

    sendLatestToWindow = atHome;
  }

  async pingPlotWindowButtonHomeEx(event, data) {
    log("pingPlotWindowButtonHome: data = " + JSON.stringify(data), "ratp", "info");

    const { numPoints, numSamples, numScrollUnitSamples } = data;
    const numPointsSamples = numPoints * numSamples;

    this.leftPos = 0;

    /*
    this.currentClumpId = latestClumpId;
    this.droppedScrollDirection = DROPPED_SCROLL_DIRECTION_NONE;
    */

    const json = await this.roundRobinDB.read(numPointsSamples, numPointsSamples);
    try {
      const jo = JSON.parse(json);
      this.computePositionInfo(jo);

      jo.droppedLeft = latestClumpId !== 0 && currentClumpId > 0;
      jo.droppedRight = false;

      log(
        "...pingPlotWindowButtonHome: leftPos = " + this.leftPos + ", centerPos = " + this.centerPos,
        "ratp",
        "info"
      );

      this.ipcSend.send(Defs.ipcPingPlotData, await filter(jo, numSamples));
    } catch (err) {
      log("(Exception) failed to parse json: " + err, "ratp", "error");
    }

    this.sendLatestToWindow = true;
  }

  async pingPlotWindowButtonLeftEx(event, data) {
    log(
      "pingPlotWindowButtonLeft: data = " + JSON.stringify(data) + ", leftPos = " + leftPos,
      "ratp",
      "info"
    );

    const { numPoints, numSamples, numScrollUnitSamples } = data;
    const numPointsSamples = numPoints * numSamples;

    this.leftPos =
      this.leftPos === 0 ? numPointsSamples + numScrollUnitSamples : this.leftPos + numScrollUnitSamples;

    const json = await this.roundRobinDB.read(this.leftPos, numPointsSamples);
    try {
      const jo = JSON.parse(json);
      this.computePositionInfo(jo);

      jo.droppedLeft = latestClumpId !== 0 && currentClumpId > 0;
      jo.droppedRight = latestClumpId !== 0 && currentClumpId < latestClumpId;

      log("...pingPlotWindowButtonLeft: leftPos = " + this.leftPos, "ratp", "info");

      this.ipcSend.send(Defs.ipcPingPlotData, await this.filter(jo, numSamples));
    } catch (err) {
      log("Exception) pingPlotWindowButtonLeft: " + err, "ratp", "info");
    }

    this.sendLatestToWindow = false;
  }

  /*
  async pingPlotWindowButtonLeftDroppedEx(event, data) {
    log("pingPlotWindowButtonLeftDropped", "ratp", "info");

    const { numPoints, numSamples, numScrollUnitSamples } = data;
    const numPointsSamples = numPoints * numSamples;

    try {
      if (this.latestClumpId === 0) return;

      if (this.droppedScrollDirection !== DROPPED_SCROLL_DIRECTION_NONE)
        this.currentClumpId = Math.max(this.currentClumpId - 1, 1);
      this.droppedScrollDirection = DROPPED_SCROLL_DIRECTION_LEFT;

      const clump = droppedArray[this.currentClumpId];
      const droppedId = clump.id + Math.floor(clump.length / 2);
      const center = (numPointsSamples / 2) | 0;

      const json = await roundRobinDB.readId(droppedId + center, numPointsSamples, false);
      if (json != null) {
        const jo = JSON.parse(json);
        this.computePositionInfo(jo);

        jo.droppedLeft = this.latestClumpId !== 0 && this.currentClumpId > 1;
        jo.droppedRight = this.latestClumpId !== 0 && this.currentClumpId < this.latestClumpId;

        this.ipcSend.send(Defs.ipcPingPlotData, await filter(jo, numSamples));
        this.sendLatestToWindow = false;
      }
    } catch (err) {
      log("(Exception) pingPlotWindowButtonLeftDropped: " + err, "ratp", "error");
    }
  }
  */

  async pingPlotWindowButtonRightEx(event, data) {
    log(
      "pingPlotWindowButtonRight: data = " + JSON.stringify(data) + ", leftPos = " + leftPos,
      "ratp",
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

      const json = await this.roundRobinDB.read(leftPos, numPointsSamples);
      try {
        const jo = JSON.parse(json);
        this.computePositionInfo(jo);

        jo.droppedLeft = this.latestClumpId !== 0 && this.currentClumpId > 0;
        jo.droppedRight = this.latestClumpId !== 0 && this.currentClumpId < this.latestClumpId;

        log("...pingPlotWindowButtonRight: leftPos = " + this.leftPos, "ratp", "info");

        this.ipcSend.send(Defs.ipcPingPlotData, await this.filter(jo, numSamples));
      } catch (err) {
        log("(Exception) pingPlotWindowButtonRight: " + err, "ratp", "error");
      }
    }

    if (atHome) this.sendLatestToWindow = true;
  }

  /*
  async pingPlotWindowButtonRightDroppedEx(event, data) {
    log("pingPlotWindowButtonRightDropped", "ratp", "info");

    const { numPoints, numSamples, numScrollUnitSamples } = data;
    const numPointsSamples = numPoints * numSamples;

    try {
      if (this.latestClumpId === 0) return;

      if (this.currentClumpId === this.latestClumpId) return;

      if (this.currentClumpId === 0) this.currentClumpId++;
      this.currentClumpId = Math.min(this.currentClumpId + 1, latestClumpId);
      this.droppedScrollDirection = DROPPED_SCROLL_DIRECTION_RIGHT;

      const clump = droppedArray[currentClumpId];
      const droppedId = clump.id + Math.floor(clump.length / 2);
      const center = (numPointsSamples / 2) | 0;

      const json = await this.roundRobinDB.readId(droppedId + center, numPointsSamples, false);
      if (json != null) {
        const jo = JSON.parse(json);
        this.computePositionInfo(jo);

        jo.droppedLeft = this.latestClumpId !== 0 && this.currentClumpId > 0;
        jo.droppedRight = this.latestClumpId !== 0 && this.currentClumpId < this.latestClumpId;

        this.ipcSend.send(Defs.ipcPingPlotData, await this.filter(jo, numSamples));
        this.sendLatestToWindow = false;
      }
    } catch (err) {
      log("(Exception) pingPlotWindowButtonRightDropped: " + err, "ratp", "error");
    }
  }
  */

  async pingPlotWindowButtonZoomChangeEx(event, data) {
    log("pingPlotWindowButtonZoomChangeEx: data = " + JSON.stringify(data), "ratp", "info");

    const { numPoints, numSamples, numScrollUnitSamples } = data.zoom;
    // NB: > 0, move right. < 0 move left.
    const { moveOffset } = data;

    const numPointsSamples = numPoints * numSamples;
    const numPointsSamplesHalf = Math.round(numPointsSamples / 2);

    log(
      "pingPlotWindowButtonZoomChangeEx: leftPos= " +
        this.leftPos +
        ", centerPos=" +
        this.centerPos +
        ", numPointsSamples = " +
        numPointsSamples +
        ", numPointsSamplesHalf = " +
        numPointsSamplesHalf +
        ", moveOffset = " +
        moveOffset,
      "ratp",
      "info"
    );

    if (this.leftPos === 0) this.leftPos = numPointsSamples;

    let newLeftPos = this.centerPos + numPointsSamplesHalf - moveOffset;
    leftPos = Math.max(newLeftPos, numPointsSamples);

    const json = await this.roundRobinDB.read(leftPos, numPointsSamples);
    try {
      //log("---before parse", "ratp", "info");
      // // NB: allow other stuff to run.
      // if (numPointsSamples >= 20000) await sleep(500);
      const jo = JSON.parse(json);
      // NB: allow other stuff to run.
      if (numPointsSamples >= 20000) await sleep(250);
      //log("---after parse", "ratp", "info");
      this.computePositionInfo(jo);

      /*
      jo.droppedLeft = this.latestClumpId !== 0 && this.currentClumpId > 0;
      jo.droppedRight = this.latestClumpId !== 0 && this.currentClumpId < this.latestClumpId;
      */

      this.ipcSend.send(Defs.ipcPingPlotData, await this.filter(jo, numSamples));
    } catch (ex) {
      log("(Exception) pingPlotWindowButtonZoomChangeEx: " + ex);
    }

    log("...pingPlotWindowButtonZoomChange: leftPos = " + leftPos, "ratp", "info");

    if (numSamples !== 1) this.sendLatestToWindow = false;
    else this.sendLatestToWindow = this.leftPos <= numPointsSamples;
  }

  async pingPlotWindowButtonHome(event, numPoints) {
    return pingPlotWindowButtonHomeEx(event, {
      numPoints,
      numSamples: 1,
      numScrollUnitSamples: _5minutesAt5SecondIntervals
    });
  }

  async pingPlotWindowButtonLeft(event, numPoints) {
    return pingPlotWindowButtonLeftEx(event, {
      numPoints,
      numSamples: 1,
      numScrollUnitSamples: _5minutesAt5SecondIntervals
    });
  }

  async pingPlotWindowButtonLeftDropped(event, numPoints) {
    return pingPlotWindowButtonLeftDroppedEx(event, {
      numPoints,
      numSamples: 1,
      numScrollUnitSamples: _5minutesAt5SecondIntervals
    });
  }

  async pingPlotWindowButtonRight(event, numPoints) {
    return pingPlotWindowButtonRightEx(event, {
      numPoints,
      numSamples: 1,
      numScrollUnitSamples: _5minutesAt5SecondIntervals
    });
  }

  async pingPlotWindowButtonRightDropped(event, numPoints) {
    return pingPlotWindowButtonRightDroppedEx(event, {
      numPoints,
      numSamples: 1,
      numScrollUnitSamples: _5minutesAt5SecondIntervals
    });
  }

  async pingPlotWindowButtonZoomChange(event, numPoints) {
    return pingPlotWindowButtonZoomChangeEx(event, {
      params: {
        numPoints,
        numSamples: 1,
        numScrollUnitSamples: _5minutesAt5SecondIntervals
      },
      moveOffset: 0
    });
  }
  
  async pingPlotWindowMount(event, numPoints) {
    return pingPlotWindowMountEx(event, {
      params: {
        numPoints,
        numSamples: 1,
        numScrollUnitSamples: _5minutesAt5SecondIntervals
      }
    });
  }

  pingPlotEnableWrites(state) {
    this.roundRobinDB.enableWrites(state);
  }

  async validatePingPlotRrdb(userDataPath, filename) {
    const roundRobinDB = new RoundRobinDB(userDataPath, filename, rrdbDataSize, createNumEntries);
    return await this.roundRobinDB.validate();
  }
}

module.exports = NetRatePlot;
