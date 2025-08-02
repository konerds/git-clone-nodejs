import zlib from "node:zlib";
import crypto from "node:crypto";
import { diffLines } from "diff";
import { getConstants } from "./constants.js";

const { TREE, COMMIT, PARENT, AUTHOR, COMMITTER, REGEX_LOG_AUTHOR } =
  getConstants();

export function deflate(data) {
  return zlib.deflateSync(data);
}

export function inflate(data) {
  return zlib.inflateSync(data);
}

export function sha1(data) {
  return crypto.createHash("sha1").update(data).digest("hex");
}

export function sha1Buffer(data) {
  return crypto.createHash("sha1").update(data).digest();
}

export function toUINT32(val) {
  return Number(val) & 0xffffffff;
}

export function getModeNormalized(mode) {
  return (mode & 0o111) === 0 ? "100644" : "100755";
}

export function getLocalTimezone() {
  const offset = -new Date().getTimezoneOffset();
  const offsetAbs = Math.abs(offset);

  return `${offset >= 0 ? "+" : "-"}${String(
    Math.floor(offsetAbs / 60)
  ).padStart(2, "0")}${String(offsetAbs % 60).padStart(2, "0")}`;
}

export function buildIndex(entries) {
  const buffers = [];
  const header = Buffer.alloc(12);
  header.write("DIRC");
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(entries.length, 8);
  buffers.push(header);

  for (const e of entries) {
    const b = Buffer.alloc(62);

    b.writeUInt32BE(e.ctime, 0);
    b.writeUInt32BE(0, 4);
    b.writeUInt32BE(e.mtime, 8);
    b.writeUInt32BE(0, 12);
    b.writeUInt32BE(e.dev, 16);
    b.writeUInt32BE(e.ino, 20);
    b.writeUInt32BE(e.mode, 24);
    b.writeUInt32BE(e.uid, 28);
    b.writeUInt32BE(e.gid, 32);
    b.writeUInt32BE(e.fileSize, 36);
    e.sha1.copy(b, 40, 0, 20);
    b.writeUInt16BE(Math.min(e.path.length, 0xfff), 60);
    buffers.push(b);
    const bufferName = Buffer.from(e.path, "utf8");
    buffers.push(bufferName);
    buffers.push(Buffer.from([0]));
    const lenPadding = (8 - ((62 + bufferName.length + 1) % 8)) % 8;

    if (lenPadding) {
      buffers.push(Buffer.alloc(lenPadding));
    }
  }

  const bufferBody = Buffer.concat(buffers);

  return Buffer.concat([bufferBody, sha1Buffer(bufferBody)]);
}

export function parseIndex(buffer) {
  const entries = [];

  if (buffer.slice(0, 4).toString() !== "DIRC") {
    return entries;
  }

  const szEntries = buffer.readUInt32BE(8);
  let offset = 12;

  for (let i = 0; i < szEntries; ++i) {
    let entry = {};
    entry.ctime = buffer.readUInt32BE(offset);
    offset += 4 + 4;
    entry.mtime = buffer.readUInt32BE(offset);
    offset += 4 + 4;
    entry.dev = buffer.readUInt32BE(offset);
    offset += 4;
    entry.ino = buffer.readUInt32BE(offset);
    offset += 4;
    entry.mode = buffer.readUInt32BE(offset);
    offset += 4;
    entry.uid = buffer.readUInt32BE(offset);
    offset += 4;
    entry.gid = buffer.readUInt32BE(offset);
    offset += 4;
    entry.fileSize = buffer.readUInt32BE(offset);
    offset += 4;
    entry.sha1 = buffer.slice(offset, offset + 20);
    offset += 20;
    entry.flags = buffer.readUInt16BE(offset);
    offset += 2;

    let idxEndName = offset;

    while (buffer[idxEndName] !== 0) {
      ++idxEndName;
    }

    entry.path = buffer.slice(offset, idxEndName).toString("utf8");
    const lenName = idxEndName - offset;
    offset = idxEndName + 1;
    offset += (8 - ((62 + lenName + 1) % 8)) % 8;

    entries.push(entry);
  }

  return entries;
}

export function buildTree(fs, pathObject, entries) {
  let partsTree = [];

  for (const e of entries) {
    const mode = getModeNormalized(e.mode);
    const bufferMode = Buffer.from(mode + " " + e.path + "\0");
    partsTree.push(Buffer.concat([bufferMode, e.sha1]));
  }

  const bodyTree = Buffer.concat(partsTree);
  const headerTree = Buffer.from(`${TREE} ${bodyTree.length}\0`);
  const treeStored = Buffer.concat([headerTree, bodyTree]);
  const treeHash = sha1(treeStored);

  const pathTree = fs.join(pathObject, treeHash.slice(0, 2));
  const fileTree = treeHash.slice(2);

  if (pathTree && !fs.exists(pathTree)) {
    fs.mkdir(pathTree);
  }

  fs.writeFile(fs.join(pathTree, fileTree), deflate(treeStored));

  return { hash: treeHash, buffer: treeStored };
}

export function parseTree(bodyTree) {
  const entries = [];
  let offset = 0;

  while (offset < bodyTree.length) {
    const idxSpace = bodyTree.indexOf(0x20, offset);
    const idxNull = bodyTree.indexOf(0x00, idxSpace);

    if (idxSpace === -1 || idxNull === -1) {
      break;
    }

    entries.push({
      mode: bodyTree.slice(offset, idxSpace).toString(),
      path: bodyTree.slice(idxSpace + 1, idxNull).toString(),
      sha1: bodyTree.slice(idxNull + 1, idxNull + 21).toString("hex"),
    });

    offset = idxNull + 21;
  }

  return entries;
}

export function buildCommit(fs, pathObject, { tree, parent, message, author }) {
  console.log(message);

  const timestamp = Math.floor(Date.now() / 1000);
  const timezone = getLocalTimezone();
  const commitText =
    `${TREE} ${tree}\n` +
    (parent ? `${PARENT} ${parent}\n` : "") +
    `${AUTHOR} ${author.name} <${author.email}> ${timestamp} ${timezone}\n` +
    `${COMMITTER} ${author.name} <${author.email}> ${timestamp} ${timezone}\n\n` +
    `${message}\n`;
  const header = `${COMMIT} ${Buffer.byteLength(commitText)}\0`;
  const store = Buffer.concat([Buffer.from(header), Buffer.from(commitText)]);
  const hash = sha1(store);

  const pathCommit = fs.join(pathObject, hash.slice(0, 2));
  const fileCommit = hash.slice(2);

  if (pathCommit && !fs.exists(pathCommit)) {
    fs.mkdir(pathCommit);
  }

  fs.writeFile(fs.join(pathCommit, fileCommit), deflate(store));

  return { hash, buffer: store };
}

export function parseCommit(commitBody) {
  const body = Buffer.isBuffer(commitBody) ? commitBody.toString() : commitBody;
  const lines = body.split("\n");
  let parent;
  let tree = "";
  let author = {};
  let committer = {};
  let message = "";
  let isCurrentInMessage = false;

  for (const line of lines) {
    if (line.trim() === "") {
      isCurrentInMessage = true;

      continue;
    }

    if (isCurrentInMessage) {
      message += (message ? "\n" : "") + line;

      continue;
    }

    if (line.startsWith(`${TREE} `)) {
      tree = line.slice(5).trim();

      continue;
    }

    if (line.startsWith(`${PARENT} `)) {
      parent = line.slice(7).trim();

      continue;
    }

    if (line.startsWith(`${AUTHOR} `)) {
      const matched = line.slice(7).match(REGEX_LOG_AUTHOR);

      if (matched) {
        author = {
          name: matched[1],
          email: matched[2],
          timestamp: matched[3],
          timezone: matched[4],
        };
      }
    }
  }

  return {
    tree,
    parent,
    author,
    committer,
    message: message.trim(),
  };
}

export function getCntLinesDifferent(a, b) {
  const diff = diffLines(a, b);

  let cntInsertions = 0;
  let cntDeletions = 0;

  for (const part of diff) {
    if (part.added) {
      cntInsertions += part.count;

      continue;
    }

    if (part.removed) {
      cntDeletions += part.count;
    }
  }

  return { cntInsertions, cntDeletions };
}

export function calculatePercentageSimilarityRename(a, b) {
  if (!a && !b) {
    return 100;
  }

  if (!a || !b) {
    return 0;
  }

  const diff = diffLines(a, b);
  let same = 0;
  let total = 0;

  for (const d of diff) {
    if (!d.added && !d.removed) {
      same += d.value.length;
    }

    total += d.value.length;
  }

  return total === 0 ? 100 : Math.round((same / total) * 100);
}

export function detectRenames(filesDeleted, filesCreated, threshold = 90) {
  const renameds = [];

  const szFilesDeleted = filesDeleted.length;
  const szFilesCreated = filesCreated.length;

  const visitedsDeleted = new Set();
  const visitedsCreated = new Set();

  for (let i = 0; i < szFilesDeleted; ++i) {
    const fileDeleted = filesDeleted[i];

    for (let j = 0; j < szFilesCreated; ++j) {
      const fileCreated = filesCreated[j];

      if (
        fileDeleted.sha1 === fileCreated.sha1.toString("hex") &&
        fileDeleted.mode === fileCreated.mode
      ) {
        renameds.push({
          oldPath: fileDeleted.path,
          newPath: fileCreated.path,
          similarity: 100,
        });
        visitedsDeleted.add(i);
        visitedsCreated.add(j);

        break;
      }
    }
  }

  for (let i = 0; i < szFilesDeleted; ++i) {
    if (visitedsDeleted.has(i)) {
      continue;
    }

    const fileDeleted = filesDeleted[i];
    let tckMax = [0, -1];

    for (let j = 0; j < szFilesCreated; ++j) {
      if (visitedsCreated.has(j)) {
        continue;
      }

      const fileCreated = filesCreated[j];

      if (fileDeleted.mode !== fileCreated.mode) {
        continue;
      }

      const percentage = calculatePercentageSimilarityRename(
        fileDeleted.text,
        fileCreated.text
      );

      if (percentage > tckMax[0]) {
        tckMax[0] = percentage;
        tckMax[1] = j;
      }
    }

    if (tckMax[0] >= threshold && tckMax[1] !== -1) {
      renameds.push({
        oldPath: fileDeleted.path,
        newPath: filesCreated[tckMax[1]].path,
        similarity: tckMax[0],
      });
      visitedsDeleted.add(i);
      visitedsCreated.add(tckMax[1]);
    }
  }

  return {
    renameds,
    deletedsRemain: filesDeleted.filter((_, i) => !visitedsDeleted.has(i)),
    createdsRemain: filesCreated.filter((_, j) => !visitedsCreated.has(j)),
  };
}

export function getDateNormalizedForLog(date = new Date()) {
  const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const wday = WEEKDAY[date.getDay()];
  const month = MONTH[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const year = date.getFullYear();

  const tzOffset = -date.getTimezoneOffset();
  const sign = tzOffset >= 0 ? "+" : "-";
  const abs = Math.abs(tzOffset);
  const tzh = String(Math.floor(abs / 60)).padStart(2, "0");
  const tzm = String(abs % 60).padStart(2, "0");

  return `${wday} ${month} ${day} ${hh}:${mm}:${ss} ${year} ${sign}${tzh}${tzm}`;
}

export function isPathsAllSelected(filename) {
  return filename === "." || filename === "./" || filename === "*";
}
