# git-clone-only-local-nodejs

This project contains code that implements some features to be compatible with the behavior of Git Software in a Node.js environment.

Setting `NAME_SYSTEM` value in your `.env` file to `git` will provide some compatibility with actual git repositories.

Unlike actual Git, this is a repository that does not store informations related in remote branch.

**However, since this project was developed for learning purposes, never execute commands on existing git projects.**

## Install Modules

```sh
yarn install
```

## Setup

Configure environment variables for using or testing.

```
NAME_SYSTEM=        # Name of system (e.g. git)
NAME_REPOSITORY=    # Name of repository folder (e.g. repository)
ALGORITHM_HASH=     # Hash Algorithm (sha1, sha256, custom)
NAME_AUTHOR=        # Name of author (e.g. like author config in git)
EMAIL_AUTHOR=       # Email of author (e.g. like author config in git)
```

The repository folder name will be in the form of **dot(.)** followed by `NAME_SYSTEM` value. (e.g. .git)

If you set the `ALGORITHM_HASH` value to `custom`, you can directly modify the hash algorithm by modifying the `hashCustom` function in the `utils.js` file.

However, when testing **compatibility with existing Git**, it **must be** set to `NAME_SYSTEM=git` and `ALGORITHM_HASH=sha1`.

## Getting Started

Depending on your prefer package manager.

### Start

```sh
yarn start [`Git Command`]
```

`Git Command` refers to the command part of the existing `git ...` command with the git part omitted.

> `add [filename]`, `commit [message]`, ....

### Test

#### Unit Tests

```sh
yarn test
```

#### Compatible Test with Git

```sh
yarn test:compatible
```

Since this project is using `readSync` to execute actual git commands, you must have git installed for the test to pass.
