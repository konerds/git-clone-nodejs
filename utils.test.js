import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  deflate,
  inflate,
  toUINT32,
  getModeNormalized,
  getLocalTimezone,
  buildIndex,
  parseIndex,
  buildTree,
  parseTree,
  buildCommit,
  parseCommit,
  getCntLinesDifferent,
  detectRenames,
  getDateNormalizedForLog,
  isPathsAllSelected,
  calculatePercentageSimilarityRename,
  getModulesHash,
} from "./utils.js";
import { FileSystem } from "./file-system.js";
import { getConstants } from "./constants.js";
import { getConfigs } from "./configs.js";

const { TREE } = getConstants();
const { ALGORITHM_HASH } = getConfigs();

const STORAGE_TEST = path.join(process.cwd(), "storage-test");

describe("utils.js", () => {
  afterAll(() => {
    try {
      if (fs.existsSync(STORAGE_TEST)) {
        fs.rmSync(STORAGE_TEST, {
          force: true,
          recursive: true,
          retryDelay: 200,
          maxRetries: 10,
        });
      }
    } catch (_) {}
  });

  it("deflate(버퍼 데이터) 와 inflate(압축된 데이터) 를 호출하면, 원본 데이터와 동일한 데이터를 반환할 수 있어야 한다", () => {
    const data = Buffer.from("test");
    const deflated = deflate(data);

    expect(Buffer.isBuffer(deflated)).toBe(true);
    expect(inflate(deflated).toString()).toBe(data.toString());
  });

  it("sha1(문자열) 과 sha1Buffer(문자열) 을 호출하면, 각각 SHA1 Hash 문자열 값과 버퍼를 반환해야 한다", () => {
    const { hashHex, hashBuffer, hashLen, hashHexLen } = getModulesHash("sha1");

    const str = "test";

    expect(hashHex(str)).toMatch(new RegExp(`^[0-9a-f]{${hashHexLen}}$`));

    const buf = hashBuffer(str);

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBe(hashLen);
    expect(buf.toString("hex")).toBe(hashHex(str));
  });

  it("sha256(문자열) 과 sha256Buffer(문자열) 을 호출하면, 각각 SHA256 Hash 문자열 값과 버퍼를 반환해야 한다", () => {
    const { hashHex, hashBuffer, hashLen, hashHexLen } =
      getModulesHash("sha256");

    const str = "test";

    expect(hashHex(str)).toMatch(new RegExp(`^[0-9a-f]{${hashHexLen}}$`));

    const buf = hashBuffer(str);

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBe(hashLen);
    expect(buf.toString("hex")).toBe(hashHex(str));
  });

  it("hashCustom(문자열) 을 호출하면, 해당되는 Hash 문자열 값을 반환해야 한다", () => {
    const { hashHex, hashHexLen } = getModulesHash("custom");

    const str = "test";

    expect(hashHex(str)).toMatch(new RegExp(`^[0-9a-f]{${hashHexLen}}$`));
  });

  it("toUINT32(숫자 값) 를 호출하면, 32 bit unsigned 값으로 변환하여 반환해야 한다", () => {
    expect(toUINT32(0xffffffff + 10)).toBe(9);
    expect(toUINT32(-1)).toBe(toUINT32(0xffffffff));
    expect(toUINT32(1)).toBe(1);
  });

  it("getModeNormalized(8진수 숫자 값) 를 호출하면, 실제 Git 에서 사용되는 실행 비트 유무에 따른 모드를 반환해야 한다", () => {
    expect(getModeNormalized(0o100644)).toBe("100644");
    expect(getModeNormalized(0o100755)).toBe("100755");
    expect(getModeNormalized(0o100000)).toBe("100644");
    expect(getModeNormalized(0o100777)).toBe("100755");
  });

  it("getLocalTimezone() 를 호출하면, System Timezone 문자열 값을 반환해야 한다", () => {
    expect(getLocalTimezone()).toMatch(/^[+-][0-9]{4}$/);
  });

  it("buildIndex(객체들) 와 parseIndex(인덱스 값) 를 호출하면, 각각 StagingArea 를 직렬화하고 역직렬화한 결과가 일치해야 한다", () => {
    const { hashBuffer } = getModulesHash(ALGORITHM_HASH);
    const entries = [
      {
        ctime: 1,
        mtime: 2,
        dev: 3,
        ino: 4,
        mode: 33188,
        uid: 1000,
        gid: 1000,
        fileSize: 6,
        sha1: hashBuffer("blob"),
        path: "test1.txt",
      },
      {
        ctime: 7,
        mtime: 8,
        dev: 9,
        ino: 10,
        mode: 33261,
        uid: 1001,
        gid: 1001,
        fileSize: 12,
        sha1: hashBuffer("bar"),
        path: "test2.js",
      },
    ];
    const parsed = parseIndex(buildIndex(entries));

    expect(parsed.length).toBe(2);
    expect(parsed[0].path).toBe("test1.txt");
    expect(parsed[1].path).toBe("test2.js");
    expect(Buffer.compare(parsed[0].sha1, entries[0].sha1)).toBe(0);
    expect(Buffer.compare(parsed[1].sha1, entries[1].sha1)).toBe(0);
  });

  it("buildTree(FileSystem 인스턴스, 트리 경로, 생성할 객체들) 와 parseTree(생성된 트리 객체) 를 호출하면, 각각 트리 객체를 생성하고 파싱한 결과가 일치해야 한다", () => {
    const { hashBuffer } = getModulesHash(ALGORITHM_HASH);
    const pathTree = path.join(STORAGE_TEST, "objects");

    if (!fs.existsSync(pathTree)) {
      fs.mkdirSync(pathTree, { recursive: true });
    }

    const entries = [
      {
        mode: 0o100644,
        sha1: hashBuffer("abcd"),
        path: "test.txt",
      },
      {
        mode: 0o100755,
        sha1: hashBuffer("efgh"),
        path: "test/test.txt",
      },
    ];
    const { buffer } = buildTree(FileSystem.getInstance(), pathTree, entries);

    expect(buffer.slice(0, 4).toString()).toBe(TREE);

    const parsedTree = parseTree(buffer.slice(buffer.indexOf(0) + 1));

    expect(parsedTree.length).toBe(2);
    expect(parsedTree[0].path).toBe("test.txt");
    expect(parsedTree[1].path).toBe("test/test.txt");
    expect(parsedTree[0].sha1).toBe(hashBuffer("abcd").toString("hex"));
    expect(parsedTree[1].sha1).toBe(hashBuffer("efgh").toString("hex"));
  });

  it("buildCommit(FileSystem 인스턴스, 객체들) 와 parseCommit(생성된 Commit 객체) 를 호출하면, 각각 커밋 객체를 생성하고 파싱한 결과가 일치해야 한다", () => {
    const pathObjects = path.join(STORAGE_TEST, "objects1");

    if (!fs.existsSync(pathObjects)) {
      fs.mkdirSync(pathObjects);
    }

    const { buffer } = buildCommit(FileSystem.getInstance(), pathObjects, {
      tree: "1241asfd23gfh12f3hg12f3hg1f23hg12fh3123f",
      parent: undefined,
      message: "Genesis commit",
      author: { name: "konerds", email: "adr10won@gmail.com" },
    });

    expect(buffer.slice(0, 6).toString()).toContain("commit");

    const { tree, author, message } = parseCommit(
      buffer.slice(buffer.indexOf(0) + 1).toString()
    );

    expect(tree).toBe("1241asfd23gfh12f3hg12f3hg1f23hg12fh3123f");
    expect(author.name).toBe("konerds");
    expect(message).toContain("Genesis commit");
  });

  it("getCntLinesDifferent(문자열1, 문자열2) 를 호출하면, diff 라이브러리를 활용하여 문자열1 에서 문자열2 까지의 삽입된 줄 수 값과 삭제된 줄 수 값을 반환해야 한다", () => {
    const { cntInsertions, cntDeletions } = getCntLinesDifferent(
      "\n\n\n",
      "\n\n\n\n\n\n"
    );

    expect(cntInsertions).toBe(3);
    expect(cntDeletions).toBe(0);

    const { cntInsertions: cntInsertions2, cntDeletions: cntDeletions2 } =
      getCntLinesDifferent("\n\n\n\n\n\n", "\n\n\n");

    expect(cntInsertions2).toBe(0);
    expect(cntDeletions2).toBe(3);

    const { cntInsertions: cntInsertions3, cntDeletions: cntDeletions3 } =
      getCntLinesDifferent("\n\n\n", "\n\n\n");

    expect(cntInsertions3).toBe(0);
    expect(cntDeletions3).toBe(0);
  });

  it("calculatePercentageSimilarityRename(문자열1, 문자열2) 를 호출하면, diff 라이브러리를 활용하여 문자열1 과 문자열 2의 유사도 계산 값을 반환해야 한다", () => {
    expect(calculatePercentageSimilarityRename("abc", "abc")).toBe(100);
    expect(calculatePercentageSimilarityRename("abc", "def")).toBeLessThan(100);
    expect(calculatePercentageSimilarityRename("", "")).toBe(100);
    expect(calculatePercentageSimilarityRename("abcd", "")).toBe(0);
    expect(calculatePercentageSimilarityRename("", "efgh")).toBe(0);
  });

  it("detectRenames(삭제된 파일 정보들, 생성된 파일 정보들, 임계치) 를 호출하면, diff 라이브러리를 활용하여 파일 이름 변경 여부를 감지한 값을 반환해야 한다", () => {
    const { hashHex, hashBuffer } = getModulesHash(ALGORITHM_HASH);
    const result = detectRenames(
      [
        {
          path: "test1.txt",
          mode: "100644",
          text: "1\n2",
          sha1: hashHex("1\n2"),
        },
      ],
      [
        {
          path: "test2.js",
          mode: "100644",
          text: "1\n2",
          sha1: hashBuffer("1\n2"),
        },
      ]
    );

    expect(Array.isArray(result.renameds)).toBe(true);
    expect(result.renameds[0].oldPath).toBe("test1.txt");
    expect(result.renameds[0].newPath).toBe("test2.js");
  });

  it("getDateNormalizedForLog(Date 인스턴스) 를 호출하면, 로그 포맷과 맞는 정규화된 날짜 문자열을 반환해야 한다", () => {
    expect(getDateNormalizedForLog(new Date("2024-01-02T15:04:05Z"))).toMatch(
      /^[A-Z][a-z]{2} [A-Z][a-z]{2} [0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} 2024 [+-][0-9]{4}$/
    );
  });

  it(`isPathsAllSelected(경로) 를 호출하면, 매개변수로 전달된 경로가 모두 선택하는 '.', './', '*' 형태인지 여부를 반환해야 한다`, () => {
    expect(isPathsAllSelected(".")).toBe(true);
    expect(isPathsAllSelected("./")).toBe(true);
    expect(isPathsAllSelected("*")).toBe(true);
    expect(isPathsAllSelected("foo")).toBe(false);
  });
});
