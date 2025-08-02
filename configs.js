import path from "node:path";
import { getConstants } from "./constants.js";

const { MAIN, ALGORITHM_HASH_ALLOWED } = getConstants();

export function getConfigs(overrides = {}) {
  const NAME_SYSTEM = process.env.NAME_SYSTEM || "nbgit";
  const FILENAME_REPOSITORY = `.${NAME_SYSTEM}`;
  const NAME_REPOSITORY = process.env.NAME_REPOSITORY || "repository";
  const ALGORITHM_HASH = process.env.ALGORITHM_HASH;

  return {
    NAME_SYSTEM,
    NAME_SYSTEM_CAPITALIZED:
      NAME_SYSTEM[0].toUpperCase() + NAME_SYSTEM.slice(1),
    FILENAME_REPOSITORY,
    NAME_REPOSITORY,
    PATH_ROOT: path.join(process.cwd(), NAME_REPOSITORY),
    ALGORITHM_HASH: ALGORITHM_HASH_ALLOWED.includes(ALGORITHM_HASH)
      ? ALGORITHM_HASH
      : "sha1",
    CONFIG_AUTHOR: {
      name: process.env.NAME_AUTHOR || "konerds",
      email: process.env.EMAIL_AUTHOR || "adr10won@gmail.com",
    },
    PATHS_EXCLUDED_FIXED: [".git", FILENAME_REPOSITORY],
    BRANCH_DEFAULT: MAIN,
    ...overrides,
  };
}
