const fs = require("fs");
const path = require("path");
const WaitQueue = require("wait-queue");
const zlib = require("zlib");

const { fileStatAsync } = require("iipzy-shared/src/utils/fileIO");
const { log } = require("iipzy-shared/src/utils/logFile");
//const { sleep } = require("iipzy-shared/src/utils/utils");

const entryHeaderSize = 42;

class RoundRobinDB {
  constructor(userDataPath, fileName, entrySize, maxEntries) {
    log(
      "RoundRobinDB.constructor: userDataPath = " +
        userDataPath +
        ", fileName = " +
        fileName +
        ", entrySize = " +
        entrySize +
        ", maxEntries = " +
        maxEntries,
      "rrdb",
      "info"
    );
    this.userDataPath = userDataPath;
    this.fileName = fileName;
    this.entrySize = entrySize + entryHeaderSize;
    this.maxEntries = maxEntries;
    this.headerSize = 120;
    this.nextEntryIndex = 0;
    this.lap = 0;
    this.nextId = 1;
    this.linkId = 0;
    this.fd = 0;
    //this.numEntries = 0;
    this.path = null;

    this.allowWrites = true;

    this.writeQueue = new WaitQueue();
  }

  async init(templateFileZip) {
    log("...>>>init: templateFileZip = " + templateFileZip, "rrdb", "info");
    // const userDataPath = (electron.app || electron.remote.app).getPath(
    //   "userData"
    // );

    this.path = path.join(this.userDataPath, this.fileName + ".rrdb");
    log("roundRobinDB.init: path=" + this.path, "rrdb", "info");

    this.fd = await this.openDB();
    log("...>>>init - after openDB", "rrdb", "info");

    log("db opened, fd = " + this.fd, "rrdb", "info");

    const { bytesRead, buffer } = await this.readChunk(0, this.headerSize);

    log("...>>>init - after readChunk: bytesRead = " + bytesRead, "rrdb", "info");

    if (bytesRead > 0) {
      let bufAsString = buffer.toString().trim();
      log("...buffer='" + bufAsString + "'", "rrdb", "info");
      log("...buffer typeof =" + typeof bufAsString, "rrdb", "info");
      log("...buffer length =" + bufAsString.length, "rrdb", "info");
      if (bytesRead === this.headerSize) {
        let n = bufAsString.indexOf("}");
        bufAsString = bufAsString.substring(0, n + 1);
        log("..about to parse " + bufAsString, "rrdb", "info");
        const jo = JSON.parse(bufAsString);
        log("...rrdb, json = " + jo.toString(), "rrdb", "info");
        this.headerSize = jo["headerSize"];
        this.entrySize = jo["entrySize"];
        this.maxEntries = jo["maxEntries"];
        this.nextEntryIndex = jo["entryIndex"];
        this.linkId = jo["linkId"];
        this.lap = jo["lap"];
        this.nextId = this.nextEntryIndex + 1 + this.lap * this.maxEntries;
      }
    } else {
      if (templateFileZip) {
        log(">>> start unzip", "rrdb", "info");
        await new Promise((resolve, reject) => {
          const fileContents = fs.createReadStream(templateFileZip);
          const writeStream = fs.createWriteStream(this.path);
          const unzip = zlib.createGunzip();
          fileContents
            .pipe(unzip)
            .pipe(writeStream)
            .on("finish", err => {
              if (err) return reject(err);
              else resolve();
            });
        });
        log("<<< end unzip", "rrdb", "info");
      } else {
        await this.writeChunk(this.createHeader(), 0, this.headerSize);
        log(">>> start preallocate", "rrdb", "info");
        // pre-allocate the file.
        for (let i = 0; i < this.maxEntries; i++) {
          await this.writeFiller(i);
        }
        log("<<< end preallocate", "rrdb", "info");
      }
    }

    // if (this.lap > 0) this.numEntries = this.maxEntries;
    // else this.numEntries = this.nextEntryIndex;

    // see if link is still valid.
    if (this.nextId > this.linkId + this.getNumEntries()) this.linkId = 0;

    this.waitWriteQueue();

    log("...entrySize      = " + this.entrySize, "rrdb", "info");
    log("...maxEntries     = " + this.maxEntries, "rrdb", "info");
    log("...numEntries     = " + this.getNumEntries(), "rrdb", "info");
    log("...nextEntryIndex = " + this.nextEntryIndex, "rrdb", "info");
    log("...nextId         = " + this.nextId, "rrdb", "info");
    log("...linkId         = " + this.linkId, "rrdb", "info");
    log("...lap            = " + this.lap, "rrdb", "info");

    log("...<<<init", "rrdb", "info");

    return {
      linkId: this.linkId,
      maxEntries: this.maxEntries,
      numEntries: this.getNumEntries()
    };
  }

  async validate() {
    log("...>>>validate", "rrdb", "info");

    let ok = false;

    try {
      this.path = path.join(this.userDataPath, this.fileName);
      if (!this.fileName.endsWith(".rrdb")) this.path += ".rrdb";
      log("roundRobinDB.validate: path=" + this.path, "rrdb", "info");

      this.fd = await this.openDB();
      log("...>>>validate - after openDB", "rrdb", "info");

      log("db opened, fd = " + this.fd, "rrdb", "info");

      const { bytesRead, buffer } = await this.readChunk(0, this.headerSize);

      log("...>>>validate - after readChunk: bytesRead = " + bytesRead, "rrdb", "info");

      if (bytesRead > 0) {
        let bufAsString = buffer.toString().trim();
        log("...buffer='" + bufAsString + "'", "rrdb", "info");
        log("...buffer typeof =" + typeof bufAsString, "rrdb", "info");
        log("...buffer length =" + bufAsString.length, "rrdb", "info");
        if (bytesRead === this.headerSize) {
          let n = bufAsString.indexOf("}");
          bufAsString = bufAsString.substring(0, n + 1);
          log("..about to parse " + bufAsString, "rrdb", "info");
          const jo = JSON.parse(bufAsString);
          log("...rrdb, json = " + jo.toString(), "rrdb", "info");
          const headerSize = jo["headerSize"];
          //const entryIndex = jo["entryIndex"];
          const entrySize = jo["entrySize"];
          const maxEntries = jo["maxEntries"];
          const stat = await fileStatAsync(this.path);
          const sizeSansHeader = stat.size - headerSize;
          log(
            "...rrdb, validate: actual size = " + stat.size + ", sanHeader = " + sizeSansHeader,
            "rrdb",
            "info"
          );
          // const expectedCurSize = this.headerSize + this.maxEntries * this.entrySize;
          // const expectedMaxSize = this.headerSize + this.maxEntries * this.entrySize;
          // log("...rrdb, validate: expected size = " + expectedMaxSize, "rrdb", "info");
          if (
            headerSize === this.headerSize &&
            entrySize === this.entrySize &&
            maxEntries === this.maxEntries &&
            sizeSansHeader % entrySize === 0
          )
            ok = true;
        }
      }
    } catch (ex) {
      log("(Exception) roundRobinDB.validate: " + ex, "rrdb", "error");
      ok = false;
    }

    if (this.fd) {
      fs.close(this.fd);
    }

    log("...<<<validate: ok = " + ok, "rrdb", "info");

    return ok;
  }

  createHeader() {
    if (this.nextId > this.linkId + this.getNumEntries()) this.linkId = 0;
    let header = null;
    header = JSON.stringify({
      headerSize: this.headerSize,
      entrySize: this.entrySize,
      maxEntries: this.maxEntries,
      entryIndex: this.nextEntryIndex,
      lap: this.lap,
      //nextId: this.nextId,
      linkId: this.linkId
    });

    return header.padEnd(this.headerSize, " ");
  }

  getNumEntries() {
    if (this.lap > 0) return this.maxEntries;
    return this.nextEntryIndex;
  }

  // getFileSize() {
  //   //log("...getFileSize", "rrdb", "info");
  //   return new Promise((resolve, reject) => {
  //     fs.stat(this.path, (err, stats) => {
  //       if (err) reject(err);
  //       else {
  //         //log("getFileSize = " + stats.size, "rrdb", "info");
  //         resolve(stats.size);
  //       }
  //     });
  //   });
  // }

  async openDB() {
    log("...openDB", "rrdb", "info");

    const exists = await new Promise((resolve, reject) => {
      fs.exists(this.path, exists => {
        resolve(exists);
      });
    });

    if (!exists) {
      // create the file.
      await new Promise((resolve, reject) => {
        fs.writeFile(this.path, "", err => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    return new Promise((resolve, reject) => {
      fs.open(this.path, "r+", 0o666, (err, file) => {
        if (err) {
          log("...err=" + err + ", code=" + err.code, "rrdb", "info");
          reject(err);
        } else {
          log("openDB resolved", "rrdb", "info");
          resolve(file);
        }
      });
    });
  }

  readChunk(offset, size) {
    log("...readChunk, fd=" + this.fd + ", offset=" + offset + ", size=" + size, "rrdb", "info");
    return new Promise((resolve, reject) => {
      const buf = Buffer.alloc(size);
      fs.read(this.fd, buf, 0, size, offset, (err, bytesRead, buffer) => {
        if (err) {
          log("...read err=" + err, "rrdb", "info");
          reject(err);
        } else {
          log("...read ok: bytesRead = " + bytesRead, "rrdb", "info");
          resolve({ bytesRead, buffer });
        }
      });
    });
  }

  async writeChunk(data, offset, entrySize) {
    log("...writeChunk, data=" + data + ", offset=" + offset, "rrdb", "info");

    if (!this.allowWrites) return 0;

    let numWritten = -1;

    const p1 = new Promise((resolve, reject) => {
      fs.write(this.fd, data.padEnd(entrySize, " "), offset, "utf8", (err, written, string) => {
        if (err) {
          log("...write err=" + err, "rrdb", "info");
          reject(err);
        } else {
          //log("...write ok: written = " + written, "rrdb", "info");
          resolve({ written });
        }
      });
    });

    p1.then(res => {
      const { written } = res;
      numWritten = written;
    });
    p1.catch(err => {
      throw new Error(err);
    });

    await p1;

    const p2 = new Promise((resolve, reject) => {
      fs.fdatasync(this.fd, err => {
        if (err) {
          log("...fdatasync err=" + err, "rrdb", "info");
          reject(err);
        } else {
          //log("...fdatasync ok", "rrdb", "info");
          resolve(true);
        }
      });
    });

    p2.then(state => {});
    p2.catch(err => {
      throw new Error(err);
    });

    await p2;

    return numWritten;
  }

  // NB: assumes that dataSansNewLine is a JSON object.
  write(dataSansNewLine, linkId) {
    log("roundRobinDB.write: data =  " + dataSansNewLine + ", linkId = " + linkId, "rrdb", "info");

    if (this.fd === null) return;

    if (!dataSansNewLine.startsWith("{")) {
      const msg = "roundRobinDB: data must be a JSON object";
      log("(Error) roundRobinDB.write: " + msg, "rrdb", "error");
      throw new Error(msg);
    }

    const id = this.nextId;

    if (linkId && linkId != 0) this.linkId = linkId;
    log(
      "roundRobinDB.write: this.linkId = " +
        this.linkId +
        ", this.nextId = " +
        this.nextId +
        ", this.numEntries = " +
        this.getNumEntries(),
      "rrdb",
      "info"
    );
    if (this.nextId > this.linkId + this.getNumEntries()) this.linkId = 0;

    const data = '\n{"id":' + id + ',"linkId":' + this.linkId + ',"data":' + dataSansNewLine + "},";

    if (data.length + 1 > this.entrySize) {
      const msg = "roundRobinDB: data longer than entry size";
      console.error(msg);
      throw new Error(msg);
    }

    this.writeQueue.push({ id, data });

    this.nextId++;

    const numEntries = Math.min(id, this.maxEntries);

    return { numEntries, id, linkId: this.linkId };
  }

  async waitWriteQueue() {
    log(">>>roundRobinDB.waitWriteQueue", "rrdb", "info");
    while (true) {
      try {
        const { id, data } = await this.writeQueue.shift();
        await this.write_helper(id, data);
      } catch (ex) {
        log("(Exception) roundRobinDB.waitWriteQueue: " + ex, "rrdb", "error");
      }
    }
    log("<<<roundRobinDB.waitWriteQueue", "rrdb", "info");
  }

  async write_helper(id, data) {
    log("roundRobinDB.write_helper : id = " + id + ", data =  " + data, "rrdb", "info");

    this.nextEntryIndex = (id - 1) % this.maxEntries;
    const offset = this.headerSize + this.entrySize * this.nextEntryIndex;
    this.nextEntryIndex++;
    await this.writeChunk(data, offset, this.entrySize);

    if (id % this.maxEntries === 0) this.lap++;
    await this.writeChunk(this.createHeader(), 0, this.headerSize);
  }

  async writeFiller(index) {
    const data = '\n{"id":' + (index + 1) + ',"linkId":0,"data":{}},';
    const offset = this.headerSize + this.entrySize * index;
    await this.writeChunk(data, offset, this.entrySize);
  }

  async read(startNumEntriesBack, readCount_) {
    log(
      "...>>>read most recent, startBack=" +
        startNumEntriesBack +
        ", readCount_=" +
        readCount_ +
        ", next=" +
        this.nextEntryIndex,
      "rrdb",
      "info"
    );

    // if (readCount_ > this.maxEntries) {
    //   const msg =
    //     "roundRobinDB: read - invalid request: readCount > this.maxEntries";
    //   console.error(msg);
    //   throw new Error(msg);
    // }

    if (startNumEntriesBack > this.getNumEntries()) startNumEntriesBack = this.getNumEntries();

    const readCount = Math.min(
      readCount_,
      this.getNumEntries() - (this.getNumEntries() - startNumEntriesBack)
    );

    log(
      "...---read most recent, startBack=" + startNumEntriesBack + ", readCount=" + readCount,
      "rrdb",
      "info"
    );

    // in one chunk or two.
    let startIndex1 = this.nextEntryIndex - startNumEntriesBack;
    log(".....startIndex1 = " + startIndex1, "rrdb", "info");
    let readCount1 = 0;
    let readCount2 = 0;
    if (startIndex1 >= 0) {
      // can read in one chunk.
      readCount1 = readCount;
    } else {
      // need to read in two chunks.
      if (this.getNumEntries() < this.maxEntries) {
        // db is partially filled
        log("...partial...", "rrdb", "info");
        startIndex1 = 0;
        readCount1 = Math.min(this.nextEntryIndex - startIndex1, readCount);
      } else {
        // db is fully filled
        startIndex1 = this.maxEntries + startIndex1;
        readCount1 = Math.min(this.maxEntries - startIndex1, readCount);
        readCount2 = readCount - readCount1;
      }
    }

    log("index1=" + startIndex1 + ", num1=" + readCount1 + ",num2=" + readCount2, "rrdb", "info");

    const offset1 = this.headerSize + startIndex1 * this.entrySize;
    const size1 = readCount1 * this.entrySize;
    const offset2 = this.headerSize;
    const size2 = readCount2 * this.entrySize;

    log(
      ", offset1=" + offset1 + ", size1=" + size1 + ", offset2=" + offset2 + ", size2=" + size2,
      "rrdb"
    );

    let json =
      '{"maxEntries":' +
      this.maxEntries +
      ', "numEntries":' +
      this.getNumEntries() +
      ', "oldest":' +
      (startNumEntriesBack === this.getNumEntries()) +
      ', "newest":' +
      (startNumEntriesBack === readCount) +
      ', "indexFirst":' +
      startIndex1 +
      ', "highestId":' +
      (this.nextId - 1) +
      ', "entries":[';
    const { bytesRead, buffer } = await this.readChunk(offset1, size1);
    log("..byteRead1=" + bytesRead, "rrdb", "info");
    if (bytesRead > 0) {
      json += buffer.toString();
    }

    //log("json1=" + json, "rrdb", "info");

    if (size2 != 0) {
      const { bytesRead, buffer } = await this.readChunk(offset2, size2);
      log("..byteRead2=" + bytesRead, "rrdb", "info");
      if (bytesRead > 0) {
        json += buffer.toString();
      }
    }

    //log("json2=" + json, "rrdb", "info");

    // remove last ","
    log("json.length=" + json.length, "rrdb", "info");
    if (bytesRead > 0) {
      const last = json.lastIndexOf(",");
      if (json.length > 1) json = json.substring(0, last);
    }
    json += "]}";

    // // fixup out of range linkIds
    // const minId = this.nextId - this.getNumEntries();
    // const jo = JSON.parse(json);
    // const ja = jo.entries;
    // let foundOne = false;
    // // NB: split this up because it can take 5 seconds if the full array is processed.
    // let s = 1;
    // for (let i = ja.length - 1; i > 0; i--) {
    //   // NB: allow other stuff to run.
    //   if (s % 20000 === 0) {
    //     //log("...rmr - sleeping(" + s + ")");
    //     await sleep(500);
    //   }
    //   s++;
    //   const joRow = ja[i];
    //   if (joRow.linkId < minId) {
    //     foundOne = true;
    //     joRow.linkId = 0;
    //   }
    // }
    // if (foundOne) json = JSON.stringify(jo);

    //log("json=" + json, "rrdb", "info");

    log("...<<<read most recent", "rrdb", "info");
    return json;
  }

  async readId(id, readCount, movingForward) {
    log(
      "...>>>readId, id =" + id + ", num = " + readCount + ", forward = " + movingForward,
      "rrdb",
      "info"
    );

    if (id < this.nextId - this.getNumEntries()) return null;

    let startNumEntriesBack = this.nextId - id;
    if (!movingForward) startNumEntriesBack += readCount;

    if (startNumEntriesBack <= 0) return null;

    if (startNumEntriesBack > this.getNumEntries()) startNumEntriesBack = this.getNumEntries();

    return this.read(startNumEntriesBack, readCount);
  }

  enableWrites(state) {
    this.allowWrites = state;
  }
}

module.exports = RoundRobinDB;
