import { getConstants } from "./constants.js";
import { getMsgs } from "./msgs.js";
import { getConfigs } from "./configs.js";
import {
  toUINT32,
  deflate,
  inflate,
  buildIndex,
  parseIndex,
  buildTree,
  parseTree,
  buildCommit,
  parseCommit,
  getCntLinesDifferent,
  getModeNormalized,
  detectRenames,
  getDateNormalizedForLog,
  isPathsAllSelected,
  getModulesHash,
} from "./utils.js";

const {
  OBJECTS,
  INDEX,
  REFS,
  HEAD,
  HEADS,
  MAIN,
  COMMIT,
  PREFIX_REF,
  ROOT_COMMIT,
  BLOB,
  REGEX_DOUBLE_BACKSLASH,
} = getConstants();
const {
  MSG_USAGE_INIT,
  MSG_ERROR_FATAL_NOT_EXIST_REPOSITORY,
  MSG_ERROR_FATAL_MISSING_BRANCH_OR_COMMIT_ARGUMENT,
  MSG_ERROR_FATAL_PATHSPEC_NOT_MATCH,
  MSG_ERROR_FATAL_DOES_NOT_HAVE_ANY_COMMITS,
  MSG_INITIALIZED_REPOSITORY,
  MSG_ERROR_NOTHING_TO_COMMIT,
  MSG_CHANGES_NOT_STAGED_FOR_COMMIT,
  MSG_CHANGES_TO_BE_COMMITTED,
  MSG_UNTRACKED_FILES,
  MSG_ERROR_FATAL_NOT_VALID_OBJECT_NAME,
  MSG_ERROR_FATAL_BRANCH_ALREADY_EXISTS,
  MSG_ERROR_ERROR_CANNOT_DELETE_CHECKED_OUT_BRANCH,
  MSG_ERROR_FATAL_BRANCH_NAME_REQUIRED,
  MSG_ERROR_ERROR_BRANCH_NOT_FOUND,
  MSG_SWITCHED_TO_BRANCH,
  MSG_ERROR_FATAL_BRANCH_HEAD_IS_BROKEN,
  MSG_DELETED_BRANCH,
  MSG_HEADER_ON_BRANCH,
  MSG_HEADER_SUB_NEW_FILE,
  MSG_HEADER_SUB_DELETED_FILE,
  MSG_HEADER_SUB_MODIFIED_FILE,
  MSG_CREATED_BRANCH,
  MSG_ERROR_NOTHING_SPECIFIED_NOTHING_ADDED,
  MSG_CLONING_INTO,
  MSG_ERROR_FATAL_REPOSITORY_NOT_FOUND,
  MSG_ERROR_FATAL_NOT_SUPPORTED_COMMAND,
} = getMsgs();
const {
  ALGORITHM_HASH,
  FILENAME_REPOSITORY,
  CONFIG_AUTHOR,
  PATHS_EXCLUDED_FIXED,
  BRANCH_DEFAULT,
} = getConfigs();
const { hashBuffer, hashHexLen } = getModulesHash(ALGORITHM_HASH);

export class Analyzer {
  #fs;
  #pathRoot;
  #pathRepository;
  #pathObjects;
  #pathStagingArea;
  #pathHead;
  #pathRefsHeads;

  constructor(fs, pathRoot) {
    this.#fs = fs;
    this.#pathRoot = pathRoot;
    this.#pathRepository = this.#fs.join(this.#pathRoot, FILENAME_REPOSITORY);
    this.#pathObjects = this.#fs.join(this.#pathRepository, OBJECTS);
    this.#pathStagingArea = this.#fs.join(this.#pathRepository, INDEX);
    this.#pathHead = this.#fs.join(this.#pathRepository, HEAD);
    this.#pathRefsHeads = this.#fs.join(this.#pathRepository, REFS, HEADS);
  }

  init(...args) {
    if (args.length > 0) {
      throw new Error(MSG_USAGE_INIT);
    }

    const exist = this.#existRepository();

    this.#fs.mkdir(this.#pathObjects);
    this.#fs.mkdir(this.#fs.join(this.#pathRepository, REFS, HEADS));
    this.#fs.writeFile(
      this.#pathHead,
      `${PREFIX_REF} ${REFS}/${HEADS}/${MAIN}\n`
    );
    this.#fs.hide();

    return `${MSG_INITIALIZED_REPOSITORY(this.#pathRepository, exist)}${this.#fs
      .join(this.#pathRepository, " ")
      .toString()
      .slice(0, -1)}`;
  }

  add(...args) {
    this.#checkRepository();

    const filenames = args.filter((f) => f.trim() !== "");

    if (filenames.length === 0) {
      throw new Error(MSG_ERROR_NOTHING_SPECIFIED_NOTHING_ADDED);
    }

    const pathsFileToAdd = filenames.some(isPathsAllSelected)
      ? this.#getPaths(this.#pathRoot, "")
      : filenames.map((f) => {
          return {
            pathFile: this.#fs.join(this.#pathRoot, f),
            pathRelativeFile: f,
          };
        });

    for (const { pathFile, pathRelativeFile } of pathsFileToAdd) {
      if (this.#fs.exists(pathFile)) {
        continue;
      }

      throw new Error(MSG_ERROR_FATAL_PATHSPEC_NOT_MATCH(pathRelativeFile));
    }

    this.#fetchStagingArea();

    for (const { pathFile, pathRelativeFile } of pathsFileToAdd) {
      const { ctimeMs, mtimeMs, dev, ino, mode, uid, gid, size } =
        this.#fs.stat(pathFile);
      const data = this.#fs.readFile(pathFile);
      const header = `${BLOB} ${data.length}\0`;
      const store = Buffer.concat([Buffer.from(header), data]);
      const hash = hashBuffer(store);

      const hashHexBlob = hash.toString("hex");
      const pathCurrent = this.#fs.join(
        this.#pathObjects,
        hashHexBlob.slice(0, 2)
      );
      const file = hashHexBlob.slice(2);

      if (pathCurrent && !this.#fs.exists(pathCurrent)) {
        this.#fs.mkdir(pathCurrent);
      }

      this.#fs.writeFile(this.#fs.join(pathCurrent, file), deflate(store));

      const modeOctal = parseInt(getModeNormalized(mode), 8);

      let entries = [];

      if (this.#fs.exists(this.#pathStagingArea)) {
        entries = parseIndex(this.#fs.readFile(this.#pathStagingArea));
        const prev = entries.find((e) => e.path === pathRelativeFile);

        if (
          prev &&
          prev.sha1.equals(hash) &&
          prev.mode === toUINT32(modeOctal) &&
          prev.fileSize === toUINT32(size) &&
          prev.mtime === Math.floor(Number(mtimeMs) / 1000)
        ) {
          continue;
        }

        entries = entries.filter((e) => e.path !== pathRelativeFile);
      }

      entries.push({
        ctime: Math.floor(Number(ctimeMs) / 1000),
        mtime: Math.floor(Number(mtimeMs) / 1000),
        dev: toUINT32(dev),
        ino: toUINT32(ino),
        mode: toUINT32(modeOctal),
        uid: toUINT32(uid),
        gid: toUINT32(gid),
        fileSize: toUINT32(size),
        sha1: hash,
        path: pathRelativeFile,
      });
      this.#fs.writeFile(this.#pathStagingArea, buildIndex(entries));
    }
  }

  commit(...args) {
    const szArgs = args.length;

    if (szArgs === 0) {
      throw new Error(MSG_ERROR_FATAL_NOT_SUPPORTED_COMMAND(args.join(" ")));
    }

    if (szArgs > 1) {
      throw new Error(MSG_ERROR_FATAL_PATHSPEC_NOT_MATCH(args[0]));
    }

    this.#checkRepository();

    const { branch, isRoot } = this.#getCurrentBranchInfo();

    if (!this.#fs.exists(this.#pathStagingArea)) {
      throw new Error(MSG_ERROR_NOTHING_TO_COMMIT(branch, isRoot));
    }

    const entries = parseIndex(this.#fs.readFile(this.#pathStagingArea));

    if (entries.length === 0) {
      throw new Error(MSG_ERROR_NOTHING_TO_COMMIT(branch, isRoot));
    }

    const { hash: hashTree } = buildTree(this.#fs, this.#pathObjects, entries);

    let parent = null;
    let hashTreeParent = null;
    let contentHead = "";

    if (this.#fs.exists(this.#pathHead)) {
      contentHead = this.#fs.readFile(this.#pathHead).toString().trim();

      if (contentHead.startsWith(PREFIX_REF)) {
        const pathRefFull = this.#fs.join(
          this.#pathRepository,
          ...contentHead.replace(PREFIX_REF, "").trim().split("/")
        );

        if (this.#fs.exists(pathRefFull)) {
          const hashParent = this.#fs.readFile(pathRefFull).toString().trim();

          if (hashParent.length === hashHexLen) {
            parent = hashParent;
            const pathParent = this.#fs.join(
              this.#pathObjects,
              parent.slice(0, 2)
            );
            const fileParent = parent.slice(2);

            if (this.#fs.exists(this.#fs.join(pathParent, fileParent))) {
              const { tree: hashTreeParent } = parseCommit(
                inflate(
                  this.#fs.readFile(this.#fs.join(pathParent, fileParent))
                ).slice(buffer.indexOf(0) + 1)
              );

              if (hashTreeParent === hashTree) {
                return MSG_ERROR_NOTHING_TO_COMMIT(branch, isRoot);
              }
            }
          }
        }
      }
    }

    const message = args[0];

    const { hash: hashCommitted } = buildCommit(this.#fs, this.#pathObjects, {
      tree: hashTree,
      parent,
      message,
      author: CONFIG_AUTHOR,
    });

    contentHead = this.#fs.readFile(this.#pathHead).toString().trim();
    this.#fs.writeFile(
      contentHead.startsWith(PREFIX_REF)
        ? this.#fs.join(
            this.#pathRepository,
            ...contentHead.replace(`${PREFIX_REF} `, "").trim().split("/")
          )
        : this.#pathHead,
      hashCommitted
    );

    const hashShort = hashCommitted.slice(0, 7);
    const filesPrev = {};

    if (parent && hashTreeParent) {
      const pathTree = this.#fs.join(
        this.#pathObjects,
        hashTreeParent.slice(0, 2)
      );
      const fileTree = hashTreeParent.slice(2);

      if (this.#fs.exists(this.#fs.join(pathTree, fileTree))) {
        const treeCompressed = this.#fs.readFile(
          this.#fs.join(pathTree, fileTree)
        );
        const bufferTree = inflate(treeCompressed);
        const bodyTree = bufferTree.slice(bufferTree.indexOf(0) + 1);
        const entriesTree = parseTree(bodyTree);

        for (const { mode, path: pathRelativeFile, sha1 } of entriesTree) {
          const pathBlob = this.#fs.join(this.#pathObjects, sha1.slice(0, 2));
          const pathFileBlob = sha1.slice(2);
          let textPrev = "";

          if (this.#fs.exists(this.#fs.join(pathBlob, pathFileBlob))) {
            const blobCompressed = this.#fs.readFile(
              this.#fs.join(pathBlob, pathFileBlob)
            );
            const bufferBlob = inflate(blobCompressed);
            textPrev = bufferBlob.slice(bufferBlob.indexOf(0) + 1).toString();
          }
          filesPrev[pathRelativeFile] = { mode, text: textPrev, sha1 };
        }
      }
    }

    let cntInsertions = 0;
    let cntDeletions = 0;
    let linesFileCreated = [];
    let linesFileDeleted = [];
    let linesFileRenamed = [];
    let filesChanged = [];

    if (isRoot) {
      for (const e of entries) {
        let text = "";

        try {
          text = this.#fs
            .readFile(this.#fs.join(this.#pathRoot, e.path))
            .toString();
        } catch {}

        cntInsertions += text.length === 0 ? 0 : text.split("\n").length;
        linesFileCreated.push(
          ` create mode ${getModeNormalized(e.mode)} ${e.path}`
        );
        filesChanged.push(e.path);
      }
    } else {
      const filesDeleted = [];
      const filesCreated = [];

      for (const p in filesPrev) {
        if (entries.find((e) => e.path === p)) {
          continue;
        }

        filesDeleted.push({
          ...filesPrev[p],
          path: p,
          mode: getModeNormalized(filesPrev[p].mode),
        });
      }

      for (const e of entries) {
        if (filesPrev[e.path]) {
          continue;
        }

        let text = "";

        try {
          text = this.#fs
            .readFile(this.#fs.join(this.#pathRoot, e.path))
            .toString();
        } catch {}

        filesCreated.push({
          path: e.path,
          text,
          mode: getModeNormalized(e.mode),
          sha1: e.sha1.toString("hex"),
        });
      }

      const { renameds, deletedsRemain, createdsRemain } = detectRenames(
        filesDeleted,
        filesCreated,
        90
      );

      for (const r of renameds) {
        linesFileRenamed.push(
          ` rename ${r.oldPath} => ${r.newPath} (${r.similarity}%)`
        );
        filesChanged.push(r.newPath);
      }

      for (const d of deletedsRemain) {
        linesFileDeleted.push(` delete mode ${d.mode} ${d.path}`);
        filesChanged.push(d.path);
        cntDeletions += d.text.length === 0 ? 0 : d.text.split("\n").length;
      }

      for (const c of createdsRemain) {
        linesFileCreated.push(` create mode ${c.mode} ${c.path}`);
        filesChanged.push(c.path);
        cntInsertions += c.text.length === 0 ? 0 : c.text.split("\n").length;
      }

      for (const e of entries) {
        const prev = filesPrev[e.path];

        if (!prev || renameds.find((r) => r.newPath === e.path)) {
          continue;
        }

        if (
          getModeNormalized(e.mode) === getModeNormalized(prev.mode) &&
          e.sha1.equals(Buffer.from(prev.sha1, "hex"))
        ) {
          continue;
        }

        let textPrev = prev.text ?? "";
        let textNew = "";

        try {
          textNew = this.#fs
            .readFile(this.#fs.join(this.#pathRoot, e.path))
            .toString();
        } catch {}

        const {
          cntInsertions: cntInsertionsCurrent,
          cntDeletions: cntDeletionsCurrent,
        } = getCntLinesDifferent(textPrev, textNew);
        cntInsertions += cntInsertionsCurrent;
        cntDeletions += cntDeletionsCurrent;
        filesChanged.push(e.path);
      }
    }

    const szChanged = Array.from(new Set(filesChanged)).length;

    let msgCommit = `[${branch}${
      isRoot ? ` (${ROOT_COMMIT})` : ""
    } ${hashShort}] ${message}\n`;
    let lineChanges = ` ${szChanged} file${szChanged > 1 ? "s" : ""} changed`;

    if (isRoot && cntInsertions === 0 && cntDeletions === 0) {
      lineChanges += `, 0 insertions(+), 0 deletions(-)`;
    } else {
      if (cntInsertions > 0) {
        lineChanges += `, ${cntInsertions} insertion${
          cntInsertions === 1 ? "" : "s"
        }(+)`;
      }

      if (cntDeletions > 0) {
        lineChanges += `, ${cntDeletions} deletion${
          cntDeletions === 1 ? "" : "s"
        }(-)`;
      }
    }

    msgCommit += lineChanges + "\n";

    if (linesFileRenamed.length > 0) {
      msgCommit += linesFileRenamed.join("\n") + "\n";
    }

    if (linesFileCreated.length > 0) {
      msgCommit += linesFileCreated.join("\n") + "\n";
    }

    if (linesFileDeleted.length > 0) {
      msgCommit += linesFileDeleted.join("\n") + "\n";
    }

    return msgCommit;
  }

  status() {
    this.#checkRepository();

    const { branch, isRoot } = this.#getCurrentBranchInfo();
    const stageds = Object.fromEntries(
      (this.#fs.exists(this.#pathStagingArea)
        ? parseIndex(this.#fs.readFile(this.#pathStagingArea))
        : []
      ).map((e) => [e.path, e])
    );

    let filesPrev = {};
    const hashHead = this.#getHashCommitHead();

    if (hashHead) {
      const pathCurrent = this.#fs.join(
        this.#pathObjects,
        hashHead.slice(0, 2)
      );
      const file = hashHead.slice(2);

      if (this.#fs.exists(this.#fs.join(pathCurrent, file))) {
        const buffer = inflate(
          this.#fs.readFile(this.#fs.join(pathCurrent, file))
        );
        const { tree: hashTree } = parseCommit(
          buffer.slice(buffer.indexOf(0) + 1)
        );

        if (hashTree) {
          const pathTree = this.#fs.join(
            this.#pathObjects,
            hashTree.slice(0, 2)
          );
          const fileTree = hashTree.slice(2);

          if (this.#fs.exists(this.#fs.join(pathTree, fileTree))) {
            const treeCompressed = this.#fs.readFile(
              this.#fs.join(pathTree, fileTree)
            );
            const bufferTree = inflate(treeCompressed);
            const bodyTree = bufferTree.slice(bufferTree.indexOf(0) + 1);
            const entriesTree = parseTree(bodyTree);

            for (const { mode, path: pathRelativeFile, sha1 } of entriesTree) {
              filesPrev[pathRelativeFile] = { mode, sha1 };
            }
          }
        }
      }
    }

    const filesWorkingDirectory = this.#getPaths(this.#pathRoot).map(
      (info) => info.pathRelativeFile
    );

    const filesStagedModified = [];
    const filesStagedAdded = [];
    const filesStagedDeleted = [];
    const filesChangedNotStaged = [];
    const filesUntracked = [];

    for (const pathRelative in stageds) {
      const prev = filesPrev[pathRelative];

      if (!prev) {
        filesStagedAdded.push(pathRelative);

        continue;
      }

      if (stageds[pathRelative].sha1.toString("hex") !== prev.sha1) {
        filesStagedModified.push(pathRelative);
      }
    }

    for (const pathRelativeFile in filesPrev) {
      if (stageds[pathRelativeFile]) {
        continue;
      }

      filesStagedDeleted.push(pathRelativeFile);
    }

    for (const path of filesWorkingDirectory) {
      const entry = stageds[path];

      if (!entry) {
        filesUntracked.push(path);

        continue;
      }

      const data = this.#fs.readFile(this.#fs.join(this.#pathRoot, path));
      const header = `${BLOB} ${data.length}\0`;
      const store = Buffer.concat([Buffer.from(header), data]);
      const hash = hashBuffer(store);

      if (!entry.sha1.equals(hash)) {
        filesChangedNotStaged.push(path);
      }
    }

    if (
      filesStagedAdded.length === 0 &&
      filesStagedModified.length === 0 &&
      filesStagedDeleted.length === 0 &&
      filesChangedNotStaged.length === 0 &&
      filesUntracked.length === 0
    ) {
      console.log(MSG_ERROR_NOTHING_TO_COMMIT(branch, isRoot));

      return;
    }

    let out = `${MSG_HEADER_ON_BRANCH(branch)}\n`;

    if (
      filesStagedAdded.length > 0 ||
      filesStagedModified.length > 0 ||
      filesStagedDeleted.length > 0
    ) {
      out += MSG_CHANGES_TO_BE_COMMITTED;

      for (const file of filesStagedAdded) {
        out += `${MSG_HEADER_SUB_NEW_FILE(file)}\n`;
      }

      for (const file of filesStagedModified) {
        out += `${MSG_HEADER_SUB_MODIFIED_FILE(file)}\n`;
      }

      for (const file of filesStagedDeleted) {
        out += `${MSG_HEADER_SUB_DELETED_FILE(file)}\n`;
      }
    }

    if (filesChangedNotStaged.length > 0) {
      out += MSG_CHANGES_NOT_STAGED_FOR_COMMIT;

      for (const file of filesChangedNotStaged) {
        out += `${MSG_HEADER_SUB_MODIFIED_FILE(file)}\n`;
      }
    }

    if (filesUntracked.length > 0) {
      out += MSG_UNTRACKED_FILES;

      for (const file of filesUntracked) {
        out += `\t${file}\n`;
      }
    }

    console.log(out.trim());
  }

  log() {
    this.#checkRepository();

    const { branch } = this.#getCurrentBranchInfo();
    let hashCommitted = this.#getHashCommitHead();

    if (!hashCommitted) {
      throw new Error(MSG_ERROR_FATAL_DOES_NOT_HAVE_ANY_COMMITS(branch));
    }

    const memosBranchesSHA = {};

    if (this.#fs.exists(this.#pathRefsHeads)) {
      const branches = this.#fs
        .readDir(this.#pathRefsHeads, { withFileTypes: true })
        .filter((f) => f.isFile())
        .map((f) => f.name);

      for (const b of branches) {
        const pathFileRef = this.#fs.join(this.#pathRefsHeads, b);

        if (!this.#fs.exists(pathFileRef)) {
          continue;
        }

        const sha = this.#fs.readFile(pathFileRef).toString().trim();

        if (sha.length === hashHexLen) {
          if (!memosBranchesSHA[sha]) {
            memosBranchesSHA[sha] = [];
          }

          memosBranchesSHA[sha].push(b);
        }
      }
    }

    let isHead = true;

    while (hashCommitted) {
      const pathCurrent = this.#fs.join(
        this.#pathObjects,
        hashCommitted.slice(0, 2)
      );
      const file = hashCommitted.slice(2);

      if (!this.#fs.exists(this.#fs.join(pathCurrent, file))) {
        break;
      }

      const compressed = this.#fs.readFile(this.#fs.join(pathCurrent, file));
      const buffer = inflate(compressed);
      const { parent, author, message } = parseCommit(
        buffer.slice(buffer.indexOf(0) + 1).toString()
      );

      let textRefs = "";

      if (isHead) {
        textRefs = ` (${HEAD} -> ${branch}`;

        if (memosBranchesSHA[hashCommitted]) {
          const branchesFrom = memosBranchesSHA[hashCommitted].filter(
            (b) => b !== branch
          );

          if (branchesFrom.length > 0) {
            textRefs += ", " + branchesFrom.join(", ");
          }
        }

        textRefs += ")";
      } else if (memosBranchesSHA[hashCommitted]) {
        textRefs = " (" + memosBranchesSHA[hashCommitted].join(", ") + ")";
      }

      console.log(`${COMMIT} ${hashCommitted}${textRefs}`);

      if (isHead) {
        isHead = false;
      }

      if (author?.name && author?.email) {
        console.log(`Author: ${author.name} <${author.email}>`);
      }

      let dateNormalized = "";

      if (author?.timestamp && author?.timezone) {
        dateNormalized = getDateNormalizedForLog(
          new Date(Number(author.timestamp) * 1000),
          author.timezone
        );
      }

      if (dateNormalized) {
        console.log(`Date:   ${dateNormalized}`);
      }

      console.log();

      if (message.trim()) {
        console.log("    " + message.split("\n").join("\n    "));
      }

      hashCommitted = parent || null;
    }
  }

  branch(...args) {
    this.#checkRepository();

    const { branch } = this.#getCurrentBranchInfo();
    const branches = this.#fs
      .readDir(this.#fs.join(this.#pathRepository, REFS, HEADS), {
        withFileTypes: true,
      })
      .filter((f) => f.isFile())
      .map((f) => f.name);
    const szArgs = args.length;

    if (szArgs === 0) {
      for (const b of branches) {
        console.log(`${b === branch ? "*" : " "} ${b}`);
      }

      return;
    }

    if (szArgs > 2) {
      return;
    }

    if (szArgs === 2) {
      if (args[0] !== "-d") {
        throw new Error(MSG_ERROR_FATAL_NOT_VALID_OBJECT_NAME(args[0]));
      }

      const name = args[1];

      if (!branches.includes(name)) {
        throw new Error(MSG_ERROR_ERROR_BRANCH_NOT_FOUND(name));
      }

      if (name === branch) {
        throw new Error(
          MSG_ERROR_ERROR_CANNOT_DELETE_CHECKED_OUT_BRANCH(name, this.#pathRoot)
        );
      }

      const fileBranch = this.#fs.join(this.#pathRepository, REFS, HEADS, name);

      if (!this.#fs.exists(fileBranch)) {
        throw new Error(MSG_ERROR_ERROR_BRANCH_NOT_FOUND(name));
      }

      this.#fs.unlink(fileBranch);
      console.log(MSG_DELETED_BRANCH(name));

      return;
    }

    const name = args[0];

    if (szArgs === 1) {
      if (name === "-d") {
        throw new Error(MSG_ERROR_FATAL_BRANCH_NAME_REQUIRED);
      }

      if (branches.includes(name)) {
        throw new Error(MSG_ERROR_FATAL_BRANCH_ALREADY_EXISTS(name));
      }
    }

    const hash = this.#getHashCommitHead();

    if (!hash) {
      throw new Error(MSG_ERROR_FATAL_NOT_VALID_OBJECT_NAME(branch));
    }

    this.#fs.writeFile(
      this.#fs.join(this.#pathRepository, REFS, HEADS, name),
      hash + "\n"
    );
    console.log(MSG_CREATED_BRANCH(name, hash.slice(0, 7)));
  }

  switch(...args) {
    this.#checkRepository();

    if (args.length !== 1) {
      throw new Error(MSG_ERROR_FATAL_NOT_SUPPORTED_COMMAND(args.join(" ")));
    }

    const name = args[0].trim();

    if (!name) {
      throw new Error(MSG_ERROR_FATAL_MISSING_BRANCH_OR_COMMIT_ARGUMENT);
    }

    const fileBranch = this.#fs.join(this.#pathRepository, REFS, HEADS, name);

    if (!this.#fs.exists(fileBranch)) {
      throw new Error(MSG_ERROR_FATAL_PATHSPEC_NOT_MATCH(name));
    }

    this.#fs.writeFile(
      this.#pathHead,
      `${PREFIX_REF} ${REFS}/${HEADS}/${name}\n`
    );

    const hash = this.#fs.readFile(fileBranch).toString().trim();

    if (!hash || hash.length !== hashHexLen) {
      throw new Error(MSG_ERROR_FATAL_BRANCH_HEAD_IS_BROKEN);
    }

    let filesInTree = {};
    const pathCurrent = this.#fs.join(this.#pathObjects, hash.slice(0, 2));
    const file = hash.slice(2);

    if (this.#fs.exists(this.#fs.join(pathCurrent, file))) {
      const buffer = inflate(
        this.#fs.readFile(this.#fs.join(pathCurrent, file))
      );
      const { tree: hashTree } = parseCommit(
        buffer.slice(buffer.indexOf(0) + 1)
      );

      if (hashTree) {
        const pathTree = this.#fs.join(this.#pathObjects, hashTree.slice(0, 2));
        const fileTree = hashTree.slice(2);

        if (this.#fs.exists(this.#fs.join(pathTree, fileTree))) {
          const treeCompressed = this.#fs.readFile(
            this.#fs.join(pathTree, fileTree)
          );
          const bufferTree = inflate(treeCompressed);
          const bodyTree = bufferTree.slice(bufferTree.indexOf(0) + 1);
          const entriesTree = parseTree(bodyTree);

          for (const { mode, path: pathRelativeFile, sha1 } of entriesTree) {
            filesInTree[pathRelativeFile] = { mode, sha1 };
          }
        }
      }
    }

    const filesWorkingDirectory = this.#getPaths(this.#pathRoot).map(
      (info) => info.pathRelativeFile
    );

    for (const f of filesWorkingDirectory) {
      this.#fs.unlink(this.#fs.join(this.#pathRoot, f));
    }

    for (const [pathRelativeFile, { sha1 }] of Object.entries(filesInTree)) {
      const pathBlob = this.#fs.join(this.#pathObjects, sha1.slice(0, 2));
      const pathFileBlob = sha1.slice(2);

      if (!this.#fs.exists(this.#fs.join(pathBlob, pathFileBlob))) {
        continue;
      }

      const blobCompressed = this.#fs.readFile(
        this.#fs.join(pathBlob, pathFileBlob)
      );
      const bufferBlob = inflate(blobCompressed);
      const body = bufferBlob.slice(bufferBlob.indexOf(0) + 1);
      this.#fs.writeFile(this.#fs.join(this.#pathRoot, pathRelativeFile), body);
    }

    const indexEntries = Object.entries(filesInTree).map(
      ([pathRelativeFile, info]) => {
        return {
          ctime: 0,
          mtime: 0,
          dev: 0,
          ino: 0,
          mode: parseInt(info.mode, 8),
          uid: 0,
          gid: 0,
          fileSize: 0,
          sha1: Buffer.from(info.sha1, "hex"),
          path: pathRelativeFile,
        };
      }
    );
    this.#fs.writeFile(this.#pathStagingArea, buildIndex(indexEntries));

    console.log(MSG_SWITCHED_TO_BRANCH(name));
  }

  clone(...args) {
    if (args.length !== 2) {
      throw new Error(MSG_ERROR_FATAL_NOT_SUPPORTED_COMMAND(args.join(" ")));
    }

    const [source, destination] = args;
    const pathSourceRoot = this.#fs.isAbsolute(source)
      ? source
      : this.#fs.join(this.#pathRoot, source);
    const pathSourceRepository = this.#fs.join(
      pathSourceRoot,
      FILENAME_REPOSITORY
    );

    if (!this.#fs.exists(pathSourceRepository)) {
      throw new Error(
        MSG_ERROR_FATAL_REPOSITORY_NOT_FOUND(pathSourceRepository)
      );
    }

    const pathDestinationRoot = this.#fs.isAbsolute(destination)
      ? destination
      : this.#fs.join(this.#pathRoot, destination);

    if (!this.#fs.exists(pathDestinationRoot)) {
      this.#fs.mkdir(pathDestinationRoot);
    }

    const pathDestRepository = this.#fs.join(
      pathDestinationRoot,
      FILENAME_REPOSITORY
    );
    this.#copyRecursively(pathSourceRepository, pathDestRepository);

    const analyzerSource = new Analyzer(this.#fs, source);
    const files = analyzerSource
      .#getPaths(pathSourceRoot)
      .filter(
        ({ pathFile, pathRelativeFile }) =>
          !pathRelativeFile.startsWith(FILENAME_REPOSITORY) &&
          !PATHS_EXCLUDED_FIXED.some((p) => pathRelativeFile.startsWith(p)) &&
          this.#fs.isFile(pathFile)
      );

    for (const { pathFile, pathRelativeFile } of files) {
      const pathFileDestination = this.#fs.join(
        pathDestinationRoot,
        pathRelativeFile
      );
      const dirnameDestination = this.#fs.dirname(pathFileDestination);

      if (!this.#fs.exists(dirnameDestination)) {
        this.#fs.mkdir(dirnameDestination);
      }

      this.#fs.writeFile(pathFileDestination, this.#fs.readFile(pathFile));
    }

    this.#fs.hide(pathDestRepository);

    return MSG_CLONING_INTO(destination);
  }

  #getPaths(pathRoot, pathBase = "") {
    const paths = [];
    const pathAbsolute = this.#fs.join(pathRoot, pathBase);
    const dirs = this.#fs.readDir(pathAbsolute, { withFileTypes: true });

    for (const d of dirs) {
      if (PATHS_EXCLUDED_FIXED.includes(d.name)) {
        continue;
      }

      const pathCurrent = this.#fs.join(pathBase, d.name);

      if (d.isDirectory()) {
        paths.push(...this.#getPaths(pathRoot, pathCurrent));

        continue;
      }

      if (!d.isFile()) {
        continue;
      }

      const pathRelative = pathCurrent.replace(REGEX_DOUBLE_BACKSLASH, "/");
      paths.push({
        pathFile: this.#fs.join(pathRoot, pathRelative),
        pathRelativeFile: pathRelative,
      });
    }

    return paths;
  }

  #existRepository() {
    return this.#fs.exists(this.#pathRepository);
  }

  #checkRepository() {
    if (!this.#existRepository()) {
      throw new Error(MSG_ERROR_FATAL_NOT_EXIST_REPOSITORY);
    }
  }

  #getCurrentBranchInfo() {
    let branch = BRANCH_DEFAULT;
    let isRoot = true;

    if (this.#fs.exists(this.#pathHead)) {
      const contentHead = this.#fs.readFile(this.#pathHead).toString().trim();

      if (contentHead.startsWith(PREFIX_REF)) {
        branch = contentHead.split("/").pop();
        const pathRefFull = this.#fs.join(
          this.#pathRepository,
          ...contentHead.replace(PREFIX_REF, "").trim().split("/")
        );

        if (this.#fs.exists(pathRefFull)) {
          isRoot = !(
            this.#fs.readFile(pathRefFull).toString().trim().length ===
            hashHexLen
          );
        }
      }
    }

    return { branch, isRoot };
  }

  #fetchStagingArea() {
    if (this.#fs.exists(this.#pathStagingArea)) {
      this.#fs.writeFile(
        this.#pathStagingArea,
        buildIndex(
          parseIndex(this.#fs.readFile(this.#pathStagingArea)).filter((e) =>
            this.#fs.exists(this.#fs.join(this.#pathRoot, e.path))
          )
        )
      );
    }
  }

  #getHashCommitHead() {
    if (!this.#existRepository() || !this.#fs.exists(this.#pathHead)) {
      return null;
    }

    const contentHead = this.#fs.readFile(this.#pathHead).toString().trim();
    let hash = contentHead;

    if (contentHead.startsWith(PREFIX_REF)) {
      const pathRefFull = this.#fs.join(
        this.#pathRepository,
        ...contentHead.replace(PREFIX_REF, "").trim().split("/")
      );

      if (!this.#fs.exists(pathRefFull)) {
        return null;
      }

      hash = this.#fs.readFile(pathRefFull).toString().trim();
    }

    return hash.length === hashHexLen ? hash : null;
  }

  #copyRecursively(src, dest) {
    if (!this.#fs.exists(dest)) {
      this.#fs.mkdir(dest);
    }

    const dirs = this.#fs.readDir(src, { withFileTypes: true });

    for (const d of dirs) {
      if (!d?.name) {
        continue;
      }

      const pathSrc = this.#fs.join(src, d.name);
      const pathDest = this.#fs.join(dest, d.name);

      if (d.isDirectory()) {
        this.#copyRecursively(pathSrc, pathDest);

        continue;
      }

      if (!d.isFile()) {
        continue;
      }

      this.#fs.writeFile(pathDest, this.#fs.readFile(pathSrc));
    }
  }

  get pathRoot() {
    return this.#pathRoot;
  }

  get pathRepository() {
    return this.#pathRepository;
  }
}
