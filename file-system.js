import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getConfigs } from "./configs.js";

const { NAME_REPOSITORY, FILENAME_REPOSITORY } = getConfigs();

export class FileSystem {
  static #instance;

  constructor() {
    if (FileSystem.#instance) {
      return FileSystem.#instance;
    }

    FileSystem.#instance = this;
  }

  hide() {
    execSync(`attrib +h "${NAME_REPOSITORY}/${FILENAME_REPOSITORY}"`);
  }

  isAbsolute(pathFull) {
    return path.isAbsolute(pathFull);
  }

  join(...args) {
    return path.join(...args);
  }

  dirname(pathFull) {
    return path.dirname(pathFull);
  }

  readFile(pathFile) {
    return fs.readFileSync(pathFile);
  }

  writeFile(pathFile, data) {
    fs.writeFileSync(pathFile, data);
  }

  exists(pathFile) {
    return fs.existsSync(pathFile);
  }

  mkdir(pathFull, opts = { recursive: true }) {
    fs.mkdirSync(pathFull, opts);
  }

  stat(pathFile) {
    return fs.statSync(pathFile);
  }

  utimes(pathFile, atime, mtime) {
    fs.utimesSync(pathFile, atime, mtime);
  }

  readDir(pathFull, opts) {
    return fs.readdirSync(pathFull, opts);
  }

  unlink(pathFile) {
    fs.unlinkSync(pathFile);
  }

  isFile(pathFile) {
    return fs.statSync(pathFile).isFile();
  }

  static getInstance() {
    if (!FileSystem.#instance) {
      FileSystem.#instance = new FileSystem();
    }

    return FileSystem.#instance;
  }
}
