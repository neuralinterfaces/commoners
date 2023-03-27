
import CLI from 'clui';
import Configstore from 'configstore';
import { Octokit } from "@octokit/rest";

import pkg from '../../package.json' assert { type: "json" };
import { askGithubCredentials } from '../inquirer.js';

const Spinner = CLI.Spinner;

const conf = new Configstore(pkg.name);

let octokit;

export const getInstance = () => {
    return octokit;
}

export const getStoredGithubToken = () => {
    return conf.get('github.token');
}

export const clearStoredGithubToken = () => {
    return conf.delete('github.token');
}


export const getPersonalAccesToken = async () => {

    const { token } = await askGithubCredentials();
    const status = new Spinner('Authenticating you, please wait...');

    status.start();
    
    try {
      if(token) {
        conf.set('github.token', token);
        return token;
      } else {
        throw new Error("GitHub token was not provided by the user");
      }
    } finally {
      status.stop();
    }
  }

export const githubAuth = (token) => {
  octokit = new Octokit({ auth: token })
}
