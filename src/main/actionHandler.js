// NB: The functions of this module are now being done in iipzy-sentinel-admin.
//  Leaving this around in case the is a use in the future.
//
// const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");

let configFile = null;

async function init(context) {
  log("actionHandler.init", "actn", "info");

  const { _configFile } = context;
  configFile = _configFile;
}

const actionUuidSet = new Set();

async function actionCB(actions, actionCompletionCB) {
  log(
    "actionCB: actions = " + JSON.stringify(actions, null, 2),
    "main",
    "info"
  );

  /*
  actions = [
  {
    "actionUuid": "b357b47c-1e2c-40cc-967e-6f502fc5511f",
    "request": {
      "command": "set-log-level",
      "tgtClientToken": "b8364bd5-0068-4553-97d4-07d076eb7a2e",
      "params": {
        "logLevel": "normal"
      }
    }
  }
]
  */

  if (actions.length === 0) {
    if (actionUuidSet.size !== 0) {
      actionUuidSet.clear();
    }
    return;
  }

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const { actionUuid, request } = action;
    const { command, params } = request;

    // check if we are already processing this action.
    if (actionUuidSet.has(actionUuid)) continue;

    actionUuidSet.add(actionUuid);

    switch (command) {
      default: {
        // ignore.
        const actionAck = { actionUuid, actionResult: {} };
        actionCompletionCB(actionAck);
        break;
      }
    }
  }
}

module.exports = { actionCB, init };
