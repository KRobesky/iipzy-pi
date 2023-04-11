const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");

const http = require("iipzy-shared/src/services/httpService");
const { spawnAsync } = require("iipzy-shared/src/utils/spawnAsync");

const { decrypt } = require("../core/main/utils/cipher");
const piLocalEvents = require("../core/main/utils/piLocalEvents");

let configFile = null;

let loggedInUserName = null;
let loggedInPasswordDecrypted = null;

function init(context) {
  log("auth.init", "auth", "info");
  const { _configFile } = context;
  configFile = _configFile;
}

async function login() {
  log(">>>login", "auth", "info");
  // see if we hve a serverIPAddress.
  if (!http.getBaseURL()) {
    await handleCompletion("", "", "", Defs.loginStatusNoServerAddress);
    return;
  }
  // get credentials from config file.
  const userName = configFile.get("userName");
  log("auth.login: userName = " + userName, "auth", "info");
  if (!userName) {
    await handleCompletion("", "", "", Defs.loginStatusLoginFailed);
    return;
  }

  const passwordEncrypted = configFile.get("password");
  if (!passwordEncrypted) {
    await handleCompletion(userName, "", "", Defs.loginStatusLoginFailed);
    return;
  }
  const passwordDecrypted = decrypt(passwordEncrypted);

  const results = await http.post("/auth/login", {
    userName: userName,
    password: passwordDecrypted
  });

  const { data, status } = results;
  log("login: status = " + status, "auth", "info");
  if (status === Defs.httpStatusOk) {
    log("login: succeeded", "auth", "info");
    await handleCompletion(
      userName,
      passwordDecrypted,
      data.authToken,
      data.isLoggedIn ? Defs.loginStatusLoggedIn : Defs.loginStatusLoggedOut
    );
  } else if (
    status === Defs.httpStatusUnauthorized &&
    data &&
    data.__hadError__ &&
    data.__hadError__.statusCode === Defs.statusInvalidCredentials
  ) {
    await handleCompletion(userName, "", "", Defs.loginStatusLoginFailed);
  } else {
    log("login: failed", "auth", "info");
    await handleCompletion(userName, "", "", Defs.loginStatusLoggedOut);
  }

  log("<<<login", "auth", "info");
}

async function logout(userName) {
  log(">>>logout", "auth", "info");
  const results = await http.post("/auth/logout");
  const { data, status } = results;
  if (status === Defs.httpStatusOk) {
    log("logout: succeeded", "auth", "info");
    await handleCompletion(userName, "", "", Defs.loginStatusLoggedOut);
  } else {
    log("logout: failed", "auth", "info");
    handleCompletion(userName, "", "", Defs.loginStatusLoggedOut);
  }

  log("<<<logout", "auth", "info");
}

async function handleCompletion(userName, passwordDecrypted, authToken, loginStatus) {
  log(
    "handleCompletion: userName=" +
      userName +
      ", authToken=" +
      authToken +
      ", loginStatus =" +
      loginStatus,
    "auth",
    "info"
  );

  if (loginStatus === Defs.loginStatusLoggedIn) {
    loggedInUserName = userName;
    loggedInPasswordDecrypted = passwordDecrypted;
    await configFile.set("authToken", authToken);
  } else {
    loggedInUserName = null;
    loggedInPasswordDecrypted = null;
    await configFile.set("authToken", null);
  }

  // set http header.
  http.setAuthTokenHeader(authToken);

  piLocalEvents.emit(Defs.pevLoginStatus, { loginStatus });
}

async function getConfigCredentials() {
  log("auth.getConfigCredentials", "auth", "info");
  const userName = configFile.get("userName");
  const passwordDecrypted = decrypt(configFile.get("password"));
  return { userName: userName, passwordDecrypted: passwordDecrypted };
}

function getLoggedInCredentials() {
  log("auth.getLoggedInCredentials", "auth", "info");
  return {
    userName: loggedInUserName,
    passwordDecrypted: loggedInPasswordDecrypted
  };
}

async function saveCredentials(userName, passwordEncrypted) {
  log("auth.saveCredentials: userName=" + userName, "auth", "info");
  await configFile.set("userName", userName);
  await configFile.set("password", passwordEncrypted);
}

async function handleLoginStatus(data) {
  const { loginStatus } = data;
  log("auth.handleLoginStatus: loginStatus = " + loginStatus, "auth", "info");
  if (loginStatus === Defs.loginStatusLoggedIn) {
    await login();
  } else if (loginStatus === Defs.loginStatusLoggedOut) {
    await logout();
  }
  piLocalEvents.emit(Defs.pevLoginStatus, data);
}

async function setMachinePassword(passwordDecrypted) {
  if (passwordDecrypted) {
    log("setMachinePassword", "auth", "info");
    const { stdout, stderr } = await spawnAsync(
      "sudo",
      ["chpasswd"],
      "pi:" + passwordDecrypted
    );
    if (stderr)
      log("(Error) setMachinePassword: stderr = " + stderr, "auth", "error");
  }
}

piLocalEvents.on(Defs.ipcLoginStatus, handleLoginStatus);

module.exports = {
  getConfigCredentials,
  getLoggedInCredentials,
  init,
  login,
  logout,
  saveCredentials,
  setMachinePassword
};
