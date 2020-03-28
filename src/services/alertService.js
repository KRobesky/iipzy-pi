const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");

async function sendAlert(http, alert) {
  log("sendAlert: " + JSON.stringify(alert, null, 2), "alrt", "info");
  return await http.post("/alert", { alert: alert });
}

module.exports = { sendAlert };
