import CLI from 'clui';
import fs from 'fs';
import simpleGit from 'simple-git';
const git = simpleGit();

import touch from 'touch';
import _ from 'lodash';

import * as inquirer from '../inquirer.js';
import * as gh from './github.js';

const Spinner = CLI.Spinner;

export const createRemoteRepo = async (name, description) => {
    const github = gh.getInstance();
    const answers = await inquirer.askRepoDetails(name, description);

    const data = {
      name: answers.name,
      description: answers.description,
      private: (answers.visibility === 'private')
    };

    const status = new Spinner('Creating remote repository...');
    status.start();

    try {
      const response = await github.repos.createForAuthenticatedUser(data);
      return response.data;
    } finally {
      status.stop();
    }
  }

export const createGitignore = async () => {
    const filelist = _.without(fs.readdirSync('.'), '.git', '.gitignore');
  
    if (filelist.length) {
      const answers = await inquirer.askIgnoreFiles(filelist);
  
      if (answers.ignore.length) {
        fs.writeFileSync( '.gitignore', answers.ignore.join( '\n' ) );
      } else {
        touch( '.gitignore' );
      }
    } else {
      touch('.gitignore');
    }
  }


  export const setupRepo = async (url) => {
    const status = new Spinner('Initializing local repository and pushing to remote...');
    status.start();
  
    try {
        git.init()
        .then(git.add('.gitignore'))
        .then(git.add('./*'))
        .then(git.commit('Initial commit'))
        .then(git.addRemote('origin', url))
        .then(git.push('origin', 'master'));
    } finally {
      status.stop();
    }
  }