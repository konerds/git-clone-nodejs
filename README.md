# git-clone-only-local-nodejs

- Cloning Git Software using Node.js

- Setting `NAME_SYSTEM` value in your `.env` file to `git` will provide some compatibility with actual git repositories.

  - However, since this project was developed for learning purposes, never execute commands on existing git projects.

  - Unlike actual Git, this is a repository that does not store informations related in remote branch.

- ## Command

  - Depending on your prefer package manager.

  - ### Install Modules

    > yarn install

  - ### Start

    > yarn start [`Git Command`]

  - ### Test

    > yarn test

  - `Git Command` refers to the command part of the existing `git ...` command with the git part omitted.

    - `add [filename]`, `commit [message]`, ....
