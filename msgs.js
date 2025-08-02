import { getConstants } from "./constants.js";
import { getConfigs } from "./configs.js";

const { HEAD } = getConstants();
const { NAME_SYSTEM, NAME_SYSTEM_CAPITALIZED, FILENAME_REPOSITORY, PATH_ROOT } =
  getConfigs();

export function getMsgs(overrides = {}) {
  const MSG_HEADER_ON_BRANCH = (branch) => `On branch ${branch}`;

  return {
    MSG_ERROR_FATAL_NOT_EXIST_REPOSITORY: `fatal: not a ${NAME_SYSTEM} repository (or any of the parent directories): ${FILENAME_REPOSITORY}`,
    MSG_ERROR_FATAL_MISSING_BRANCH_OR_COMMIT_ARGUMENT:
      "fatal: missing branch or commit argument",
    MSG_ERROR_FATAL_BRANCH_NAME_REQUIRED: "fatal: branch name required",
    MSG_ERROR_FATAL_BRANCH_HEAD_IS_BROKEN: `fatal: branch ${HEAD} is broken`,
    MSG_INITIALIZED_REPOSITORY: (pathFull, exist) =>
      `${
        exist ? "Reinitialized existing" : "Initialized empty"
      } ${NAME_SYSTEM_CAPITALIZED} repository in ${pathFull}`,
    MSG_ERROR_FATAL_NOT_SUPPORTED_COMMAND: (cmd) =>
      `fatal: '${cmd}' is not a supported command`,
    MSG_ERROR_FATAL_PATHSPEC_NOT_MATCH: (pathFull) =>
      `fatal: pathspec '${pathFull}' did not match any files`,
    MSG_ERROR_FATAL_DOES_NOT_HAVE_ANY_COMMITS: (branch) =>
      `fatal: your current branch '${branch}' does not have any commits yet`,
    MSG_HEADER_ON_BRANCH,
    MSG_HEADER_SUB_NEW_FILE: (pathFile) => `\tnew file:   ${pathFile}`,
    MSG_HEADER_SUB_MODIFIED_FILE: (pathFile) => `\tmodified:   ${pathFile}`,
    MSG_HEADER_SUB_DELETED_FILE: (pathFile) => `\tdeleted:    ${pathFile}`,
    MSG_ERROR_NOTHING_TO_COMMIT: (branch, isRoot) =>
      isRoot
        ? `${MSG_HEADER_ON_BRANCH(
            branch
          )}\n\nInitial commit\n\nnothing to commit (create/copy files and use "add" to track)`
        : `${MSG_HEADER_ON_BRANCH(
            branch
          )}\nnothing to commit, working tree clean`,
    MSG_CHANGES_TO_BE_COMMITTED: `\nChanges to be committed:\n  (use "${NAME_SYSTEM} restore --staged <file>..." to unstage)\n`,
    MSG_CHANGES_NOT_STAGED_FOR_COMMIT: `\nChanges not staged for commit:\n  (use "${NAME_SYSTEM} add <file>..." to update what will be committed)\n  (use "${NAME_SYSTEM} restore <file>..." to discard changes in working directory)\n`,
    MSG_UNTRACKED_FILES: `\nUntracked files:\n  (use "${NAME_SYSTEM} add <file>..." to include in what will be committed)\n`,
    MSG_ERROR_FATAL_NOT_VALID_OBJECT_NAME: (name) =>
      `fatal: Not a valid object name: '${name}'.`,
    MSG_ERROR_FATAL_BRANCH_ALREADY_EXISTS: (name) =>
      `fatal: A branch named '${name}' already exists.`,
    MSG_ERROR_ERROR_BRANCH_NOT_FOUND: (name) =>
      `error: branch '${name}' not found`,
    MSG_ERROR_ERROR_CANNOT_DELETE_CHECKED_OUT_BRANCH: (name) =>
      `error: Cannot delete branch '${name}' checked out at '${PATH_ROOT}'.`,
    MSG_SWITCHED_TO_BRANCH: (name) => `Switched to branch '${name}'`,
    MSG_DELETED_BRANCH: (name) => `Deleted branch '${name}'`,
    MSG_CREATED_BRANCH: (name, hashSliced) =>
      `Branch '${name}' created at ${hashSliced}...`,
    MSG_USAGE_INIT: `usage: ${NAME_SYSTEM} init`,
    MSG_ERROR_NOTHING_SPECIFIED_NOTHING_ADDED:
      "fatal: nothing specified, nothing added.",
    MSG_CLONING_INTO: (path) => `Cloning into '${path}'...`,
    MSG_ERROR_FATAL_REPOSITORY_NOT_FOUND: (url) =>
      `fatal: repository '${url}' not found`,
    ...overrides,
  };
}
