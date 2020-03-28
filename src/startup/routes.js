const express = require("express");

const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");

const credentials = require("../routes/credentials");
const devices = require("../routes/devices");
const discovery = require("../routes/discovery");
const eventWait = require("../routes/eventWait");
const testRoute = require("../routes/testRoute");
const requestDispatcher = require("../routes/requestDispatcher");
const settings = require("../routes/settings");
const error = require("../middleware/error");

/*
  httpCustomHeader_XAuthToken: "x-auth-token",
  httpCustomHeader_XClientToken: "x-client-token",
  httpCustomHeader_XConnToken: "x-conn-token",
  httpCustomHeader_XTimestamp: "x-timestamp",
*/

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Methods",
      "PUT, GET, POST, DELETE, OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, " +
        Defs.httpCustomHeader_XAuthToken +
        ", " +
        Defs.httpCustomHeader_XConnToken +
        ", " +
        Defs.httpCustomHeader_XTimestamp +
        ", " +
        Defs.httpCustomHeader_XWebClient
    );
    res.header("Content-Type", "application/x-www-form-urlencoded");
    next();
  });
  app.use(express.json());
  app.use("/api/credentials", credentials);
  app.use("/api/devices", devices);
  app.use("/api/discovery", discovery);
  app.use("/api/eventWait", eventWait);
  app.use("/api/request", requestDispatcher);
  app.use("/api/settings", settings);
  app.use("/express_backend", testRoute);
  app.use(error);
};
