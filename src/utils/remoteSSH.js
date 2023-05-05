const Defs = require("iipzy-shared/src/defs");

const { log } = require("iipzy-shared/src/utils/logFile");
const { spawnAsync } = require("iipzy-shared/src/utils/spawnAsync");

class RemoteSSH {
  constructor() {
    log("RemoteSSH.constructor", "rssh", "info");

    this.enabled = false;
  }

  getEnabled() {
    log("RemoteSSH.getEnabled: " + this.enabled, "rssh", "info");
    return this.enabled;
  }

  async setEnabled(state) {
    log("RemoteSSH.setEnabled: " + state, "rssh", "info");
    try {
      let status = Defs.httpStatusOk;
      let resultMessage = "";

      if (state) {
        // stop any previous session
        {
          const { stdout, stderr } = await spawnAsync("ssh-remote", ["--kill-ssh"]);
          if (stderr)
            log("(Error) RemoteSSH.setEnabled (stop previous session): stderr = " + stderr, "rssh", "error");
          if (stdout)
            log("RemoteSSH.setEnabled (stop previous session): stdout = " + stdout, "rssh", "info");
        }

        // get ssh command line.
        const port = 8765;
        const sessionLimitMins = 120;
        let commandLine = null;
        {
          const { stdout, stderr } = await spawnAsync("ssh-remote", ["--command-line", port, "tunnel-pass"]);
          if (stderr)
            log("(Error) RemoteSSH.setEnabled (get ssh command line): stderr = " + stderr, "rssh", "error");
          else
            commandLine = stdout.replaceAll("[\n\r]$", "");
          // e.g., commandLine = "ssh -tt -R8765:localhost:22 root@iipzy.net"
        }
        
        if (commandLine) {
          log("RemoteSSH.setEnabled: commandLine = " + commandLine, "rssh", "info");
          const parts = commandLine.split(' ');
          const command = parts[0];
          let params = [];
          for (let i = 1; i < parts.length; i++) {
            params.push(parts[i]);
          }

          log("RemoteSSH.setEnabled: command = " + command + ", params = " + JSON.stringify(params), "rssh", "info");
          
          const { stdout, stderr } = await spawnAsync(command, params);
          if (stderr) {
            log("(Error) RemoteSSH.setEnabled (start ssh): stderr = " + stderr, "rssh", "error");
            status = Defs.httpStatusUnprocessableEntity;
            resultMessage = "Error - " + stderr;
          } else {
            // get start message.
            const { stdout, stderr } = await spawnAsync("ssh-remote", ["--start-message", port, sessionLimitMins]);
            resultMessage = stdout;
            log("RemoteSSH.setEnabled: start-message = " + resultMessage, "rssh", "info");
          }
        }       
      } else {
          const { stdout, stderr } = await spawnAsync("ssh-remote", ["--kill-ssh"]);
        if (stderr)
          log("(Error) RemoteSSH.setEnabled (stop session): stderr = " + stderr, "rssh", "error");
        if (stdout)
          log("RemoteSSH.setEnabled (stop session): stdout = " + stdout, "rssh", "info");
      }

      this.enabled = state;

      return {
        status,
        data: {message: resultMessage}
      };
    } catch(ex) {
      log("(Exception) RemoteSSH.setEnabled: " + ex, "rssh", "error");
    }
  }
}

module.exports = { RemoteSSH };


/*
case DiagnosticCommand.REMOTE_SSH:
    try
    {
        if (ISDefs.OS_FLAVOR == ISDefs.OS_FLAVOR_LINUX_OPENWRT)
        {
            // stop any previous session
              String s = new ISBackgroundProcess("ssh-remote --kill-ssh").run();
            ISLogger.log(ISLogger.MODULE_WEBSOCKET, Level.INFO, "handleWebSocketCommand: " + commandString + " ssh stop result - " + s);
            // get ssh command line.
            String commandLine = new ISBackgroundProcess("ssh-remote --command-line").run().replaceAll("[\n\r]$", "");
            // e.g., commandLine = "ssh -tt -R8150:localhost:22 root@portal.iipzy.com";
            if (ISUtilities.isNonEmptyString(commandLine))
            {
                String guid = mISSentinel_LocalServicesAsyncProcess_RemoteSSH.guidService();
                if (ISUtilities.isNonEmptyString(guid))
                    mISSentinel_LocalServicesAsyncProcess_RemoteSSH.destroyService(guid);
                String responseString = mISSentinel_LocalServicesAsyncProcess_RemoteSSH.createService(commandLine, true);
                  // get info.
                  responseString = new ISBackgroundProcess("ssh-remote --start-message " + REMOTE_SSH_SESSION_DURATION_MINS).run();
                remoteSSHSessionID = System.currentTimeMillis();
                  joReply.put(commandString, responseString);
                  Thread t = new Thread(() -> {
                    long myRemoteSSHSessionID = remoteSSHSessionID;
                    ISUtilities.sleep(REMOTE_SSH_SESSION_DURATION_MINS * 60 * 1000);
                    if (myRemoteSSHSessionID != remoteSSHSessionID)
                    {
                        ISLogger.log(ISLogger.MODULE_WEBSOCKET, Level.INFO, "handleWebSocketCommand: " + commandString + " obsolete session id");
                        return;
                    }
                    try
                    {
                          String ss = new ISBackgroundProcess("ssh-remote --kill-ssh").run();
                        ISLogger.log(ISLogger.MODULE_WEBSOCKET, Level.INFO, "handleWebSocketCommand: " + commandString + " ssh stop result - " + ss);
                    }
                    catch (JSONException | IOException x)
                    {
                        ISLogger.log(ISLogger.MODULE_WEBSOCKET, Level.WARN, "handleWebSocketCommand: kill-ssh " + commandString + " exception: " + x.getMessage());
                    }
                });
                t.setDaemon(true);
                t.start();
            }
        }
        else
            joReply.put(commandString, "not supported");
    }
*/