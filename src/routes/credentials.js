const express = require("express");
const router = express.Router();

//const Defs = require("iipzy-shared/src/defs");
const { log, timestampToString } = require("iipzy-shared/src/utils/logFile");

const { decrypt } = require("../core/main/utils/cipher");

const {
  getLoggedInCredentials,
  login,
  logout,
  saveCredentials,
  setMachinePassword
} = require("../main/auth");

router.post("/", async (req, res) => {
  log(
    "POST credentials: timestamp = " +
      timestampToString(req.header("x-timestamp")),
    "cred",
    "info"
  );

  const { userName, passwordDecrypted } = await getLoggedInCredentials();

  if (!userName) {
    // first-time setup.  User's credentials become machine's credentials.
    const reqPasswordDecrypted = decrypt(req.body.passwordEncrypted);
    //log("POST credentialscurUserName = " + userName, "cred", "info");
    log("POST credentials: reqUserName = " + req.body.userName, "cred", "info");
    // save in config file.
    await saveCredentials(req.body.userName, req.body.passwordEncrypted);
    // login.
    await login();
    // set as machine password.
    setMachinePassword(reqPasswordDecrypted);
  }

  res.send({});
});

module.exports = router;
