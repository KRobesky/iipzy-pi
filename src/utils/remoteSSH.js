const { spawn } = require("child_process");

const Defs = require("iipzy-shared/src/defs");
const { log } = require("iipzy-shared/src/utils/logFile");
const { spawnAsync } = require("iipzy-shared/src/utils/spawnAsync");
const { sleep } = require("iipzy-shared/src/utils/utils");

class RemoteSSH {
  constructor() {
    log("RemoteSSH.constructor", "rssh", "info");

    this.enabled = false;
    // spawnSSH hack.
    this.spawnSSH_stdout;
    this.spawnSSH_stderr;
    this.spawnSSH_completed = false;
  }

  getState() {
    log("RemoteSSH.getState: " + this.enabled, "rssh", "info");
    return this.enabled;
  }

  async setState(state, password) {
    log("RemoteSSH.setState: " + state, "rssh", "info");
    try {
      const port = 8765;

      let status = Defs.httpStatusOk;
      let message = "";

      if (state) {
        this.enabled = false;
        // stop any previous sessions
        while (true) {
          const { stdout, stderr } = await spawnAsync("ssh-remote", ["--kill-ssh", port]);
          if (stderr)
            log("(Error) RemoteSSH.setState (stop previous session): stderr = " + stderr, "rssh", "error");
          if (stdout) {
            log("RemoteSSH.setState (stop previous session): stdout = " + stdout, "rssh", "info");
            if (stdout.includes("nothing to stop"))
              break;
          }
          await sleep(2*1000);
        }

        // get ssh command line.

        const sessionLimitMins = 120;
        let commandLine = null;
        {
          const { stdout, stderr } = await spawnAsync("ssh-remote", ["--command-line", port, password]);
          if (stderr)
            log("(Error) RemoteSSH.setState (get ssh command line): stderr = " + stderr, "rssh", "error");
          else {
            log("RemoteSSH.setState (get ssh command line): stdout = " + stdout, "rssh", "info");
            //commandLine = stdout.replaceAll("[\n\r]$", "");
            commandLine = stdout.replaceAll("\n", "");
            // e.g., commandLine = "ssh -tt -R8765:localhost:22 root@iipzy.net"
          }
        }
        
        if (commandLine) {
          log("RemoteSSH.setState: commandLine = " + commandLine, "rssh", "info");
          const parts = commandLine.split(' ');
          const command = parts[0];
          let params = [];
          for (let i = 1; i < parts.length; i++) {
            params.push(parts[i]);
          }

          log("RemoteSSH.setState: command = " + command + ", params = " + JSON.stringify(params), "rssh", "info");
          
          this.spawnSSH(command, params, 10, this.completionCallback.bind(this));
          while (!this.spawnSSH_completed) {
            await sleep(1000);
          }
          const stdout = this.spawnSSH_stdout;
          const stderr = this.spawnSSH_stderr;
          log("---RemoteSSH.setState (start ssh): stdout = " + stdout, "rssh", "error");
          if (stderr) {
            log("(Error) RemoteSSH.setState (start ssh): stderr = " + stderr, "rssh", "error");
            status = Defs.httpStatusUnprocessableEntity;
            message = "Error - " + stderr;
          } else {
            // get start message.
            const { stdout, stderr } = await spawnAsync("ssh-remote", ["--start-message", port, sessionLimitMins]);
            message = stdout;
            log("RemoteSSH.setState: start-message = " + message, "rssh", "info");
            this.enabled = true;
          }
        }  else {
          status = Defs.httpStatusUnprocessableEntity;
          message = "(Error) Failed to get command line";
        }     
      } else {
        const { stdout, stderr } = await spawnAsync("ssh-remote", ["--kill-ssh", port]);
        if (stderr)
          log("(Error) RemoteSSH.setState (stop session): stderr = " + stderr, "rssh", "error");
        if (stdout)
          log("RemoteSSH.setState (stop session): stdout = " + stdout, "rssh", "info");
          this.enabled = false;
      }

      log("RemoteSSH.setState: returning status " + status + ", message = " + message, "rssh", "info");   
      return {
        status,
        data: {message}
      };
    } catch(ex) {
      log("(Exception) RemoteSSH.setState: " + ex, "rssh", "error");     
      return {
        status: Defs.httpStatusUnprocessableEntity,
        data: {message: ex}
      };
    }
  }

  completionCallback(stdout, stderr) {
    log("RemoteSSH.completionCallback", "rssh", "info");
    this.spawnSSH_stdout = stdout;
    this.spawnSSH_stderr = stderr;
    this.spawnSSH_completed = true;
  }

  async spawnSSH(command, params, timeoutSeconds, completionCallback) {
    // up to 'timeoutSeconds' for ssh to return an error.
    this.spawnSSH_completed = false;
    const timeout = setTimeout(() => {
      completionCallback("", "");
    }, timeoutSeconds * 1000);

    const { stdout, stderr } = await spawnAsync(command, params);
    if (stderr)
      log("(Error) RemoteSSH.spawnSSH: stderr = " + stderr, "rssh", "error");
    if (stdout)
      log("RemoteSSH.spawnSSH: stdout = " + stdout, "rssh", "info");
    clearTimeout(timeout);
    completionCallback(stdout, stderr );
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