const express = require("express");
const fileUpload = require("express-fileupload");
const router = express.Router();
const { spawn } = require("child_process");
const fs = require("fs");
const mime = require("mime");
const path = require("path");

const { configFileGet, configFileSet } = require("iipzy-shared/src/utils/configFile");
const Defs = require("iipzy-shared/src/defs");
const { log, timestampToString } = require("iipzy-shared/src/utils/logFile");
const http = require("iipzy-shared/src/services/httpService");
const {
  fileDeleteAsync,
  fileExistsAsync,
  fileRenameAsync
} = require("iipzy-shared/src/utils/fileIO");
const { spawnAsync } = require("iipzy-shared/src/utils/spawnAsync");

const heartbeat = require("../core/main/heartbeat");
const Ping = require("../core/main/ping");

const WifiService = require("../services/wifiService");

const { sendLogFiles } = require("../utils/sendLogFiles");

const { isValidClient, isValidConnection } = require("./validateConnection");

const { pingPlotEnableWrites, validatePingPlotRrdb } = require("../core/main/pingPlot");
const {
  throughputTestEnableWrites,
  validateThroughputTestRrdb
} = require("../core/main/throughputTest");

const wifiService = new WifiService();

// for simulateDroppedPackets
const ping = new Ping("settings: simulate dropped packets", null, "", 0, 0);

router.use(
  fileUpload()
  //fileUpload({ debug: true, limits: { fileSize: 50 * 1024 * 1024 } })
);

const uploadPath = "/etc/iipzy/uploads/";
const restorePath = "/etc/iipzy/";

async function fileDownload_helper(res, file) {
  if (!(await fileExistsAsync(file))) {
    return res.status(Defs.httpStatusUnprocessableEntity).send();
  }

  const filename = path.basename(file);
  // NB .rrdb is a json file.
  const mimetype = mime.lookup("/etc/iipzy/iipzy.json");

  log("fileDownload_helper: filename = " + filename + ", mimetype = " + mimetype, "sets", "info");

  res.setHeader("Content-disposition", "attachment; filename=" + filename);
  res.setHeader("Content-type", mimetype);

  log("fileDownload_helper: before createReadStream", "sets", "info");

  var filestream = fs.createReadStream(file);
  log("fileDownload_helper: AFTER  createReadStream", "sets", "info");
  filestream.pipe(res);
  log("fileDownload_helper: AFTER  pipe", "sets", "info");
}

async function filePresence_helper(tgtFilename) {
  const tgtFilePath = uploadPath + tgtFilename;
  log("settings.filePresence_helper: tgtFilePath = " + tgtFilePath, "sets", "info");
  return await fileExistsAsync(tgtFilePath);
}

async function fileRestore_helper(srcFilename, validator, rrdbEnableWrites) {
  try {
    const srcFilePath = uploadPath + srcFilename;
    if (!(await fileExistsAsync(srcFilePath))) {
      //?? TODO use __hadError__
      return {
        status: Defs.httpStatusUnprocessableEntity,
        data: {
          message: "File is missing"
        }
      };
    }

    if (!(await validator(uploadPath, srcFilename))) {
      await fileDeleteAsync(srcFilePath);
      //?? TODO use __hadError__
      return {
        status: Defs.httpStatusUnprocessableEntity,
        data: {
          message: "File is invalid"
        }
      };
    }

    rrdbEnableWrites(false);

    const tgtFilePath = restorePath + srcFilename;
    if (!(await fileRenameAsync(srcFilePath, tgtFilePath))) {
      rrdbEnableWrites(true);
      return {
        status: Defs.httpStatusUnprocessableEntity,
        data: {
          message: "restore failed"
        }
      };
    }

    log("settings.fileRestore_helper: stopping in 5 seconds", "sets", "info");

    setTimeout(() => {
      process.exit(96);
    }, 5 * 1000);

    return {
      status: Defs.httpStatusOk,
      data: {
        message: "restore completed"
      }
    };
  } catch (ex) {
    log("(Exception) settings.fileRestore_helper: " + ex, "sets", "error");
    return {
      status: Defs.httpStatusUnprocessableEntity,
      data: {
        message: ex.message
      }
    };
  }
}

async function fileUpload_helper(req, tgtFilename, validator) {
  try {
    if (!req.files) {
      log("(Error) settings.fileUpload_helper: no file to upload", "sets", "error");
      //?? TODO use __hadError__
      return {
        status: Defs.httpStatusUnprocessableEntity,
        data: {
          message: "No file to upload"
        }
      };
    } else {
      log(
        "settings.fileUpload_helper: file = " +
          req.files.file.name +
          ", size = " +
          req.files.file.size,
        "sets",
        "info"
      );

      await spawnAsync("mkdir", [uploadPath]);

      const file_ = req.files.file;
      const tgtFilePath = uploadPath + tgtFilename;

      await file_.mv(tgtFilePath);

      const ok = await validator(uploadPath, tgtFilename);
      if (ok) {
        return {
          status: Defs.httpStatusOk,
          data: {
            message: "File is uploaded",
            data: {
              name: file_.name,
              mimetype: file_.mimetype,
              size: file_.size
            }
          }
        };
      } else {
        await fileDeleteAsync(tgtFilePath);
        //?? TODO use __hadError__
        return {
          status: Defs.httpStatusUnprocessableEntity,
          data: {
            message: "File is invalid"
          }
        };
      }
    }
  } catch (ex) {
    log("(Exception) settings.fileUpload_helper: " + ex, "sets", "error");
    return {
      status: Defs.httpStatusUnprocessableEntity,
      data: {
        message: ex.message
      }
    };
  }
}

async function getClientName() {
  const { data, status } = await http.get("/client/clientname");
  if (status === Defs.httpStatusOk) await configFileSet("clientName", data.clientName);
  return configFileGet("clientName");
}

async function setClientName(clientName) {
  const clientNameConfig = configFileGet("clientName");

  if (clientName !== clientNameConfig) {
    // send to service.
    const { status } = await http.post("/client/clientname", {
      clientName
    });
    if (status === Defs.httpStatusOk) await configFileSet("clientName", clientName);
  }
  //??TODO return error.
}

async function setRebootAppliance() {
  log("rebooting appliance in 5 seconds", "sets", "info");
  setTimeout(() => {
    spawn("sudo", ["reboot"]);
  }, 5 * 1000);
}

async function setServiceAddress(serviceAddress) {
  const serviceAddressConfig = configFileGet("serverAddress");

  if (serviceAddress !== serviceAddressConfig) {
    await configFileSet("serverAddress", serviceAddress);

    log(
      "POST settings/serviceaddres: serviceAddress changed from " +
        serviceAddressConfig +
        " to " +
        serviceAddress,
      "sets",
      "info"
    );
    log("POST settings/serviceaddress: stopping in 5 seconds", "sets", "info");

    setTimeout(() => {
      process.exit(96);
    }, 5 * 1000);
  }
}

router.get("/", async (req, res) => {
  log("GET settings: timestamp = " + timestampToString(req.header("x-timestamp")), "sets");

  if (!isValidConnection(res, req.header("x-conn-token"))) return;

  const settings = {
    clientName: await getClientName(),
    logLevel: configFileGet("logLevel"),
    pingChartDataRestore: await filePresence_helper("pingPlot.rrdb"),
    rebootAppliance: true,
    sendLogs: true,
    serviceAddress: configFileGet("serverAddress"),
    simulateDroppedPackets: ping.getSimulateDroppedPackets(),
    simulateOffLine: heartbeat.getSimulateOffline(),
    speedTestDataRestore: await filePresence_helper("throughput.rrdb"),
    wifiJoin: "",
    wifiNetworks: await wifiService.getWifiNetworks(),
    wifiStatus: await wifiService.getWifiStatus()
  };
  res.send({ settings });
});

router.post("/", async (req, res) => {
  log("POST settings: timestamp = " + timestampToString(req.header("x-timestamp")), "sets", "info");

  if (!isValidConnection(res, req.header("x-conn-token"))) return;

  let data = {};
  let status = Defs.httpStatusOk;

  try {
    const { settings } = req.body;
    log("POST settings: " + JSON.stringify(settings, null, 2), "sets", "info");

    if (settings.hasOwnProperty("clientName")) {
      await setClientName(settings.clientName);
    }

    if (settings.hasOwnProperty("logLevel")) {
      await configFileSet("logLevel", settings.logLevel);
    }

    if (settings.hasOwnProperty("pingChartDataRestore")) {
      const { status: status_, data: data_ } = await fileRestore_helper(
        "pingPlot.rrdb",
        validatePingPlotRrdb,
        pingPlotEnableWrites
      );
      status = status_;
      data = data_;
    }

    if (settings.hasOwnProperty("rebootAppliance")) {
      await setRebootAppliance();
    }

    if (settings.hasOwnProperty("sendLogs")) {
      await sendLogFiles("appliance", "iipzy-pi");
      await sendLogFiles("updater", "iipzy-updater");
    }

    if (settings.hasOwnProperty("serviceAddress")) {
      await setServiceAddress(settings.serviceAddress);
    }

    if (settings.hasOwnProperty("simulateDroppedPackets")) {
      ping.setSimulateDroppedPackets(settings.simulateDroppedPackets);
    }

    if (settings.hasOwnProperty("simulateOffLine")) {
      heartbeat.setSimulateOffline(settings.simulateOffLine);
    }

    if (settings.hasOwnProperty("speedTestDataRestore")) {
      const { status: status_, data: data_ } = await fileRestore_helper(
        "throughput.rrdb",
        validateThroughputTestRrdb,
        throughputTestEnableWrites
      );
      status = status_;
      data = data_;
    }

    if (settings.hasOwnProperty("wifiJoin")) {
      data = await wifiService.joinWifiNetwork(settings.wifiJoin);
    }
  } catch (ex) {
    log("(Exception) POST settings: ex = " + ex, "sets", "error");
    status = Defs.httpStatusUnprocessableEntity;
    data = { message: ex.message };
  }

  log("<<<POST settings: status = " + status + ", data = " + JSON.stringify(data), "sets", "info");

  res.status(status).send(data);
});

router.get("/downloadpingchartdata", async (req, res) => {
  log("GET settings/downloadpingchartdata", "dnld", "info");

  if (!isValidClient(req, res)) return;

  fileDownload_helper(res, "/etc/iipzy/pingPlot.rrdb");
});

router.get("/downloadspeedtestdata", async (req, res) => {
  log("GET settings/downloadspeedtestdata", "dnld", "info");

  if (!isValidClient(req, res)) return;

  fileDownload_helper(res, "/etc/iipzy/throughput.rrdb");
});

router.get("/serviceaddress", async (req, res) => {
  log(
    "GET settings/serviceaddress: timestamp = " + timestampToString(req.header("x-timestamp")),
    "sets"
  );

  if (!isValidConnection(res, req.header("x-conn-token"))) return;

  const serviceAddress = configFileGet("serverAddress");

  res.send({ serviceAddress });
});

router.post("/uploadpingpchartdata", async (req, res) => {
  log(
    "POST settings/uploadpingpchartdata: timestamp = " +
      timestampToString(req.header("x-timestamp")),
    "sets",
    "info"
  );

  if (!isValidConnection(res, req.header("x-conn-token"))) return;

  const { data, status } = await fileUpload_helper(req, "pingPlot.rrdb", validatePingPlotRrdb);

  log("<<<POST settings/uploadpingpchartdata", "sets", "info");

  res.status(status).send(data);
});

router.post("/uploadspeedtestdata", async (req, res) => {
  log(
    "POST settings/uploadspeedtestdata: timestamp = " +
      timestampToString(req.header("x-timestamp")),
    "sets",
    "info"
  );

  if (!isValidConnection(res, req.header("x-conn-token"))) return;

  const { data, status } = await fileUpload_helper(
    req,
    "throughput.rrdb",
    validateThroughputTestRrdb
  );

  log("<<<POST settings/uploadspeedtestdata", "sets", "info");

  res.status(status).send(data);
});

module.exports = router;
