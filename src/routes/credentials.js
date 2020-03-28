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

  const reqPasswordDecrypted = decrypt(req.body.passwordEncrypted);

  log("-----curUserName = " + userName, "cred", "info");
  log("-----reqUserName = " + req.body.userName, "cred", "info");

  if (
    !userName ||
    userName !== req.body.userName ||
    !passwordDecrypted ||
    passwordDecrypted !== reqPasswordDecrypted
  ) {
    // save in config file.
    await saveCredentials(req.body.userName, req.body.passwordEncrypted);

    if (userName) await logout(userName);

    await login();
  }

  // set as Raspberry pi password.
  setMachinePassword(reqPasswordDecrypted);

  let results = {};

  res.send(results);
});

module.exports = router;
