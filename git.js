import dotenv from "dotenv";
import { getMsgs } from "./msgs.js";
import { getConfigs } from "./configs.js";
import { FileSystem } from "./file-system.js";
import { Analyzer } from "./analyzer.js";

dotenv.config();

const { PATH_ROOT, CMDS_ALLOWED, NAME_SYSTEM } = getConfigs();
const { MSG_ERROR_FATAL_NOT_SUPPORTED_COMMAND } = getMsgs();

const fs = FileSystem.getInstance();
const analyzer = new Analyzer(fs, PATH_ROOT);

const [, , cmd, ...args] = process.argv;

try {
  if (NAME_SYSTEM === "git" && !CMDS_ALLOWED.includes(cmd)) {
    throw new Error(MSG_ERROR_FATAL_NOT_SUPPORTED_COMMAND(cmd));
  }

  switch (cmd) {
    case "init":
      console.log(analyzer.init(...args));

      break;

    case "add":
      for (const f of args) {
        analyzer.add(f);
      }

      console.log();

      break;

    case "commit":
      console.log(analyzer.commit(args[0] ?? ""));

      break;

    case "log":
      analyzer.log();

      break;

    case "status":
      analyzer.status();

      break;

    case "branch":
      analyzer.branch(...args);

      break;

    case "switch":
      analyzer.switch(...args);

      break;

    case "clone":
      analyzer.clone(...args);

      break;

    default:
      if (!cmd) {
        break;
      }

      throw new Error(MSG_ERROR_FATAL_NOT_SUPPORTED_COMMAND(cmd));
  }
} catch (e) {
  console.error(e?.message ?? e);

  process.exit(1);
}
