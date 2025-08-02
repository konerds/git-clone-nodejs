import {
  describe,
  it,
  expect,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FileSystem } from "./file-system.js";
import { Analyzer } from "./analyzer.js";
import { getConstants } from "./constants.js";
import { getConfigs } from "./configs.js";
import { getMsgs } from "./msgs.js";

const { OBJECTS, INDEX, HEAD, REFS, HEADS } = getConstants();
const {
  MSG_ERROR_FATAL_NOT_EXIST_REPOSITORY,
  MSG_USAGE_INIT,
  MSG_INITIALIZED_REPOSITORY,
  MSG_ERROR_NOTHING_SPECIFIED_NOTHING_ADDED,
  MSG_ERROR_FATAL_PATHSPEC_NOT_MATCH,
  MSG_ERROR_FATAL_NOT_SUPPORTED_COMMAND,
  MSG_ERROR_NOTHING_TO_COMMIT,
  MSG_ERROR_FATAL_DOES_NOT_HAVE_ANY_COMMITS,
  MSG_ERROR_ERROR_BRANCH_NOT_FOUND,
  MSG_SWITCHED_TO_BRANCH,
  MSG_ERROR_FATAL_REPOSITORY_NOT_FOUND,
} = getMsgs();
const { PATH_ROOT, BRANCH_DEFAULT, FILENAME_REPOSITORY, NAME_REPOSITORY } =
  getConfigs();

function cleanUp() {
  if (fs.existsSync(PATH_ROOT)) {
    fs.rmSync(PATH_ROOT, { recursive: true, force: true });
  }
}

describe("Analyzer", () => {
  let instance;
  let spyLog;

  afterAll(() => {
    instance = null;
    cleanUp();
  });

  beforeEach(() => {
    cleanUp();
    instance = new Analyzer(FileSystem.getInstance(), PATH_ROOT);
  });

  afterEach(() => {
    spyLog?.mockRestore();
  });

  it("저장소가 존재하지 않는 경로에서 init 외의 메서드를 호출하면, 오류를 발생시켜야 한다", () => {
    expect(() => instance.add("test.txt")).toThrow(
      MSG_ERROR_FATAL_NOT_EXIST_REPOSITORY
    );
    expect(() => instance.commit("Initial commit")).toThrow(
      MSG_ERROR_FATAL_NOT_EXIST_REPOSITORY
    );
    expect(() => instance.log()).toThrow(MSG_ERROR_FATAL_NOT_EXIST_REPOSITORY);
    expect(() => instance.status()).toThrow(
      MSG_ERROR_FATAL_NOT_EXIST_REPOSITORY
    );
    expect(() => instance.branch()).toThrow(
      MSG_ERROR_FATAL_NOT_EXIST_REPOSITORY
    );
    expect(() => instance.switch("main")).toThrow(
      MSG_ERROR_FATAL_NOT_EXIST_REPOSITORY
    );
  });

  it("init(...args) 를 호출하면, 오류를 발생시켜야 한다", () => {
    expect(() => instance.init("arg")).toThrow(MSG_USAGE_INIT);
  });

  it("init() 을 호출하면, 저장소를 초기화해야 한다", () => {
    const msg = instance.init();

    expect(fs.existsSync(instance.pathRepository)).toBe(true);
    expect(fs.existsSync(path.join(instance.pathRepository, OBJECTS))).toBe(
      true
    );
    expect(fs.existsSync(path.join(instance.pathRepository, REFS, HEADS))).toBe(
      true
    );
    expect(fs.existsSync(path.join(instance.pathRepository, HEAD))).toBe(true);
    expect(msg).toMatch(
      MSG_INITIALIZED_REPOSITORY(instance.pathRepository, false)
    );
  });

  it("add() 를 호출하면, 오류를 발생시켜야 한다", () => {
    instance.init();

    expect(() => instance.add()).toThrow(
      MSG_ERROR_NOTHING_SPECIFIED_NOTHING_ADDED
    );
  });

  it("add(존재하지 않는 파일 경로가 포함된 파일 경로 또는 파일 경로들) 를 호출하면, 오류를 발생시켜야 한다", () => {
    instance.init();

    expect(() => instance.add("test.txt")).toThrow(
      MSG_ERROR_FATAL_PATHSPEC_NOT_MATCH("test.txt")
    );

    const pathFile = path.join(instance.pathRoot, "test.txt");
    fs.writeFileSync(pathFile, "1234");
    instance.add("test.txt");

    expect(() => instance.add("test.txt", "test2.txt")).toThrow(
      MSG_ERROR_FATAL_PATHSPEC_NOT_MATCH("test2.txt")
    );
  });

  it("add(존재하는 파일 경로만 포함된 파일 경로) 를 호출하면, 해당 파일들이 Staging Area 에 추가되어야 한다", () => {
    instance.init();
    const pathFile = path.join(instance.pathRoot, "test.txt");
    fs.writeFileSync(pathFile, "1234");
    instance.add("test.txt");
    const pathStagingArea = path.join(instance.pathRepository, INDEX);

    expect(fs.existsSync(pathStagingArea)).toBe(true);
    expect(fs.readFileSync(pathStagingArea).length).toBeGreaterThan(0);
  });

  it("add(존재하는 파일 경로만 포함된 파일 경로들) 를 호출하면, 해당 파일들이 Staging Area 에 추가되어야 한다", () => {
    instance.init();
    const pathFile1 = path.join(instance.pathRoot, "test.txt");
    const pathFile2 = path.join(instance.pathRoot, "test2.txt");
    fs.writeFileSync(pathFile1, "1234");
    fs.writeFileSync(pathFile2, "5678");
    instance.add("test.txt", "test2.txt");
    const pathStagingArea = path.join(instance.pathRepository, INDEX);

    expect(fs.existsSync(pathStagingArea)).toBe(true);
    expect(fs.readFileSync(pathStagingArea).length).toBeGreaterThan(0);
  });

  it("commit() 를 호출하면, 오류를 발생시켜야 한다", () => {
    instance.init();

    expect(() => instance.commit()).toThrow(
      MSG_ERROR_FATAL_NOT_SUPPORTED_COMMAND("")
    );
  });

  it("commit(커밋 메시지, ...args) 를 호출하면, 오류를 발생시켜야 한다", () => {
    instance.init();
    const args = ["arg1", "arg2"];

    expect(() => instance.commit(...args)).toThrow(
      MSG_ERROR_FATAL_PATHSPEC_NOT_MATCH(args[0])
    );
  });

  it("Staging Area 에 파일들이 없을 때 commit(커밋 메시지) 을 호출하면, 오류를 발생시켜야 한다", () => {
    instance.init();

    expect(() => instance.commit("initial commit")).toThrow(
      MSG_ERROR_NOTHING_TO_COMMIT(BRANCH_DEFAULT, true)
    );
  });

  it("Staging Area 에 파일이 있을 때 commit(커밋 메시지) 을 호출하면, 오류가 발생하지 않아야 한다", () => {
    instance.init();
    const pathFile = path.join(instance.pathRoot, "test.txt");
    fs.writeFileSync(pathFile, "1234");
    instance.add("test.txt");

    expect(instance.commit("initial commit")).toMatch(/initial commit/);
    expect(
      fs.readdirSync(path.join(instance.pathRepository, OBJECTS)).length
    ).toBeGreaterThan(0);
  });

  it("빈 저장소에서 status() 를 호출하면, [Nothing to commit] 로그를 출력해야 한다", () => {
    instance.init();
    spyLog = vi.spyOn(console, "log").mockImplementation(() => {});
    instance.status();

    expect(spyLog).toHaveBeenCalledWith(
      expect.stringContaining("nothing to commit")
    );
  });

  it("StagingArea 에 파일이 있을 때 status() 를 호출하면, staged 파일과 untracked 파일 등 정보들이 로그로 출력되어야 한다", () => {
    instance.init();
    fs.writeFileSync(path.join(instance.pathRoot, "test.txt"), "1234");
    instance.add("test.txt");
    fs.writeFileSync(path.join(instance.pathRoot, "test2.txt"), "5678");
    spyLog = vi.spyOn(console, "log").mockImplementation(() => {});
    instance.status();

    expect(spyLog).toHaveBeenCalledWith(expect.stringContaining("test.txt"));
    expect(spyLog).toHaveBeenCalledWith(expect.stringContaining("test2.txt"));
  });

  it("커밋 내역이 존재하지 않을 때 log() 를 호출하면, 오류를 발생시켜야 한다", () => {
    instance.init();

    expect(() => instance.log()).toThrow(
      MSG_ERROR_FATAL_DOES_NOT_HAVE_ANY_COMMITS(BRANCH_DEFAULT)
    );
  });

  it("커밋 내역이 존재할 때 log() 를 호출하면, 커밋된 내역을 출력해야 한다", () => {
    instance.init();
    const pathFile = path.join(instance.pathRoot, "test.txt");
    fs.writeFileSync(pathFile, "1234");
    instance.add("test.txt");
    instance.commit("initial commit");
    let output = "";
    spyLog = vi.spyOn(console, "log").mockImplementation((msg = "") => {
      output += msg + "\n";
    });
    instance.log();

    expect(output).toMatch(/commit [0-9a-f]{40}/);
    expect(output).toMatch(/initial commit/);
    expect(output).toMatch(/Author:/);
    expect(output).toMatch(/Date:/);
  });

  it("저장소를 초기화하고 바로 branch() 를 호출하면, 무시되어야 한다", () => {
    instance.init();
    spyLog = vi.spyOn(console, "log").mockImplementation(() => {});
    instance.branch();

    expect(spyLog).not.toHaveBeenCalled();
  });

  it("저장소를 초기화하고 파일을 추가 및 커밋한 후 branch() 를 호출하면, 현재 브랜치 및 브랜치 목록을 출력해야 한다", () => {
    instance.init();
    fs.writeFileSync(path.join(instance.pathRoot, "test.txt"), "1234");
    instance.add("test.txt");
    instance.commit("initial commit");
    spyLog = vi.spyOn(console, "log").mockImplementation(() => {});
    instance.branch();

    expect(spyLog).toHaveBeenCalledWith(
      expect.stringContaining(`* ${BRANCH_DEFAULT}`)
    );
  });

  it("저장소가 존재할 때 branch(브랜치 이름) 를 호출하면, 해당 브랜치를 생성해야 한다", () => {
    instance.init();
    fs.writeFileSync(path.join(instance.pathRoot, "test.txt"), "1234");
    instance.add("test.txt");
    instance.commit("initial commit");
    spyLog = vi.spyOn(console, "log").mockImplementation(() => {});
    instance.branch("master");

    expect(spyLog).toHaveBeenCalledWith(expect.stringContaining("master"));

    spyLog.mockClear();
    instance.branch();

    expect(spyLog).toHaveBeenCalledWith(
      expect.stringContaining(`* ${BRANCH_DEFAULT}`)
    );
    expect(spyLog).toHaveBeenCalledWith(expect.stringContaining("master"));
  });

  it(`저장소가 존재할 때 branch("-d", 존재하지 않는 브랜치 이름) 를 호출하면, 해당 브랜치를 삭제해야 한다`, () => {
    instance.init();
    fs.writeFileSync(path.join(instance.pathRoot, "test.txt"), "1234");
    instance.add("test.txt");
    instance.commit("initial commit");
    spyLog = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(() => instance.branch("-d", "master")).toThrow(
      MSG_ERROR_ERROR_BRANCH_NOT_FOUND("master")
    );
  });

  it(`저장소가 존재할 때 branch("-d", 존재하는 브랜치 이름) 를 호출하면, 해당 브랜치를 삭제해야 한다`, () => {
    instance.init();
    fs.writeFileSync(path.join(instance.pathRoot, "test.txt"), "1234");
    instance.add("test.txt");
    instance.commit("initial commit");
    spyLog = vi.spyOn(console, "log").mockImplementation(() => {});
    instance.branch("master");

    expect(spyLog).toHaveBeenCalledWith(expect.stringContaining("master"));

    spyLog.mockClear();
    instance.branch("-d", "master");

    expect(spyLog).toHaveBeenCalledWith(
      expect.stringContaining("Deleted branch 'master'")
    );

    spyLog.mockClear();
    instance.branch();

    expect(spyLog).not.toHaveBeenCalledWith(expect.stringContaining("master"));
  });

  it("저장소가 존재할 때 switch(존재하지 않는 브랜치명) 를 호출하면, 오류를 발생시켜야 한다", () => {
    instance.init();
    fs.writeFileSync(path.join(instance.pathRoot, "test.txt"), "1234");
    instance.add("test.txt");
    instance.commit("initial commit");
    spyLog = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(() => instance.switch("master")).toThrow(
      MSG_ERROR_FATAL_PATHSPEC_NOT_MATCH("master")
    );
  });

  it("저장소가 존재할 때 switch(존재하는 브랜치명) 를 호출하면, 해당 브랜치로 전환되어야 한다", () => {
    instance.init();
    fs.writeFileSync(path.join(instance.pathRoot, "test.txt"), "1234");
    instance.add("test.txt");
    instance.commit("initial commit");
    spyLog = vi.spyOn(console, "log").mockImplementation(() => {});
    instance.branch("master");
    instance.switch("master");

    expect(spyLog).toHaveBeenCalledWith(
      expect.stringContaining(MSG_SWITCHED_TO_BRANCH("master"))
    );
  });

  it("저장소가 존재할 때 clone(존재하지 않는 source 경로, destination 경로) 를 호출하면, 오류를 발생시켜야 한다", () => {
    instance.init();
    spyLog = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => instance.clone("repository", "repository2")).toThrow(
      MSG_ERROR_FATAL_REPOSITORY_NOT_FOUND(
        path.join(instance.pathRoot, "repository", FILENAME_REPOSITORY)
      )
    );
  });

  it("저장소가 존재할 때 clone(존재하는 source 경로, destination 경로) 를 호출하면, 해당 저장소를 복제해야 한다", () => {
    instance.init();
    instance.clone(`../${NAME_REPOSITORY}`, NAME_REPOSITORY);
    const pathRepositoryCloned = path.join(
      instance.pathRoot,
      NAME_REPOSITORY,
      FILENAME_REPOSITORY
    );
    expect(fs.existsSync(pathRepositoryCloned)).toBe(true);
    expect(fs.existsSync(path.join(pathRepositoryCloned, OBJECTS))).toBe(true);
    instance.clone(NAME_REPOSITORY, `${NAME_REPOSITORY}2`);
    const pathRepositoryCloned2 = path.join(
      instance.pathRoot,
      `${NAME_REPOSITORY}2`,
      FILENAME_REPOSITORY
    );
    expect(fs.existsSync(pathRepositoryCloned2)).toBe(true);
    expect(fs.existsSync(path.join(pathRepositoryCloned2, OBJECTS))).toBe(true);
  });
});
