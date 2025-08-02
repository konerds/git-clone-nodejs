import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FileSystem } from "./file-system.js";

const STORAGE_TEST = path.join(process.cwd(), "storage-test");

describe("FileSystem", () => {
  let instance;

  beforeAll(() => {
    if (!fs.existsSync(STORAGE_TEST)) {
      fs.mkdirSync(STORAGE_TEST);
    }

    instance = FileSystem.getInstance();
  });

  afterAll(() => {
    if (fs.existsSync(STORAGE_TEST)) {
      fs.rmdirSync(STORAGE_TEST, { recursive: true });
    }
  });

  it("getInstance() 를 호출하면, 항상 같은 인스턴스를 반환해야 한다", () => {
    const instance1 = FileSystem.getInstance();
    const instance2 = FileSystem.getInstance();

    expect(instance1).toBe(instance2);
  });

  it("writeFile(경로, 파일 내용) 와 readFile(경로) 를 호출하면, 파일을 쓰고 읽을 수 있어야 한다", () => {
    const pathFile = path.join(STORAGE_TEST, "test.txt");
    instance.writeFile(pathFile, "Hello, World!");
    const content = instance.readFile(pathFile).toString();

    expect(content).toBe("Hello, World!");
  });

  it("exists(경로) 를 호출하면, 파일 존재 여부를 확인할 수 있어야 한다", () => {
    const pathFile = path.join(STORAGE_TEST, "test.txt");

    expect(instance.exists(pathFile)).toBe(true);

    const notExists = path.join(STORAGE_TEST, "test2.txt");

    expect(instance.exists(notExists)).toBe(false);
  });

  it("readDir(경로) 을 호출하면, 디렉토리를 읽을 수 있어야 한다", () => {
    expect(instance.readDir(STORAGE_TEST)).toContain("test.txt");
  });

  it("unlink(경로) 를 호출하면, 파일을 삭제할 수 있어야 한다", () => {
    const pathFile = path.join(STORAGE_TEST, "test.txt");
    instance.unlink(pathFile);

    expect(instance.exists(pathFile)).toBe(false);
  });

  it("mkdir(경로) 을 호출하면, 중첩 디렉토리를 생성할 수 있어야 한다", () => {
    const pathNested = path.join(STORAGE_TEST, "a", "b", "c");
    instance.mkdir(pathNested);

    expect(fs.existsSync(pathNested)).toBe(true);
  });

  it("dirname(경로) 와 join(경로들) 을 호출하면, 올바른 경로를 반환해야 한다", () => {
    const pathFile = path.join(STORAGE_TEST, "a", "b", "c", "test.txt");

    expect(instance.dirname(pathFile)).toBe(
      path.join(STORAGE_TEST, "a", "b", "c")
    );

    expect(instance.join(STORAGE_TEST, "x", "y")).toBe(
      path.join(STORAGE_TEST, "x", "y")
    );
  });

  it("isAbsolute(경로) 를 호출하면, 절대 경로 여부를 반환해야 한다", () => {
    expect(instance.isAbsolute("/absolute/path")).toBe(true);
    expect(instance.isAbsolute("relative/path")).toBe(false);
  });
});
