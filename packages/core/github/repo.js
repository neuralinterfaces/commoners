import CLI from 'clui';
import fs from 'node:fs';
import simpleGit from 'simple-git';
const git = simpleGit();

import touch from 'touch';
import _ from 'lodash';

import * as inquirer from '../utils/inquirer.js';
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


  const gitIgnoreName = '.gitignore'

export const createGitignore = async () => {
    const filelist = _.without(fs.readdirSync('.'), '.git', gitIgnoreName);
  
    if (filelist.length) {
      const answers = await inquirer.askIgnoreFiles(filelist);
  
      if (answers.ignore.length) {
        fs.writeFileSync( gitIgnoreName, answers.ignore.join( '\n' ) );
      } else {
        touch( gitIgnoreName );
      }
    } else {
      touch(gitIgnoreName);
    }
  }


  export const setupRepo = async (url) => {
    const status = new Spinner('Initializing local repository and pushing to remote...');
    status.start();
  
    try {
        await git.init()
        await git.add(gitIgnoreName)
        await git.add('./*')
        await git.commit('Initial commit')
        await git.branch('main')
        await git.addRemote('origin', url)
        await git.push('origin', 'main')

    } finally {
      status.stop();
    }
  }

  export const push = async (message, callback) => {
    const status = new Spinner('Pushing changes to remote...');
    status.start();
    
  
    try {

      await git.init()

      await git.add('./*')
      await git.commit(message)

      // await git.branch('main')
      await git.push('origin', 'main')

      // Run any additional code before stopping the spinner
      await callback(message)

    } finally {
      status.stop();
    }
  }