const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");

async function cancelIperf3Run(http, iperf3Server, iperf3Token, cancelToken) {
  log(
    "cancelIperf3Run: iperf3Server = " +
      iperf3Server +
      ", iperf3Token = " +
      iperf3Token +
      ", cancelToken = " +
      cancelToken,
    "iprf",
    "info"
  );
  return await http.delete(
    "https://" +
      iperf3Server +
      "/api/iperf3?iperf3token=" +
      iperf3Token +
      "&canceltoken=" +
      cancelToken
  );
}

async function getIperf3Server(http) {
  // first, to main server to get an address and token.
  const { status, data } = await http.get("/iperf3/server");
  if (status !== Defs.httpStatusOk) {
    return { status, data };
  }

  const { iperf3Server, iperf3Token } = data;
  log(
    "getIperf3Server: iperf3Server = " +
      iperf3Server +
      ", iperf3Token = " +
      iperf3Token +
      ", status = " +
      status,
    "iprf",
    "info"
  );
  // then, to iperf3 server to get an iperf3 instance.
  {
    const { status, data } = await http.get(
      "https://" + iperf3Server + "/api/iperf3?iperf3token=" + iperf3Token
    );
    if (status !== Defs.httpStatusOk) {
      return { status, data };
    }

    const { server, port, cancelToken } = data;
    log("getIperf3Server: server=" + server + ", port=" + port, "iprf", "info");
    return { status, server, port, iperf3Server, iperf3Token, cancelToken };
  }
}

async function getPingTarget(http) {
  const { data, status } = await http.get("/iperf3/pingtarget");
  if (status !== Defs.httpStatusOk) return { status };

  const { pingTarget } = data;
  log("getPingTarget: pingTarget = " + pingTarget, "iprf", "info");
  return { pingTarget, status };
}

function setAuthTokenHeader(authTokenHeader) {
  //??TODO - remove http.setAuthTokenHeader(authTokenHeader);
}

module.exports = { cancelIperf3Run, getIperf3Server, getPingTarget, setAuthTokenHeader };
