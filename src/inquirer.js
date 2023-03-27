import inquirer from 'inquirer';
import minimist from 'minimist';
import * as files from './files.js'

export const askGithubCredentials = () => {
    const questions = [
        {
        name: 'token',
        type: 'input',
        message: 'Enter your GitHub Personal Access Token:',
        validate: function( value ) {
            if (value.length) {
                return true;
            } else {
            return 'Please enter your personal access token.';
            }
        }
        },
        // {
        // name: 'password',
        // type: 'password',
        // message: 'Enter your password:',
        // validate: function(value) {
        //     if (value.length) {
        //     return true;
        //     } else {
        //     return 'Please enter your password.';
        //     }
        // }
        // }
    ];
    return inquirer.prompt(questions);
}

export const askIgnoreFiles = (filelist) => {
    const questions = [
      {
        type: 'checkbox',
        name: 'ignore',
        message: 'Select the files and/or folders you wish to ignore:',
        choices: filelist,
        default: ['node_modules', 'bower_components']
      }
    ];
    return inquirer.prompt(questions);
  }

  export const getTwoFactorAuthenticationCode = () => {
    return inquirer.prompt({
      name: 'twoFactorAuthenticationCode',
      type: 'input',
      message: 'Enter your two-factor authentication code:',
      validate: function(value) {
        if (value.length) {
          return true;
        } else {
          return 'Please enter your two-factor authentication code.';
        }
      }
    });
  }

  export const askRepoDetails = (name, description) => {
    const questions = [
      {
        type: 'input',
        name: 'name',
        message: 'Enter a name for the repository:',
        default: name || files.getCurrentDirectoryBase(),
        validate: function( value ) {
          if (value.length) {
            return true;
          } else {
            return 'Please enter a name for the repository.';
          }
        }
      },
      {
        type: 'input',
        name: 'description',
        default: description || null,
        message: 'Optionally enter a description of the repository:'
      },
      {
        type: 'list',
        name: 'visibility',
        message: 'Public or private:',
        choices: [ 'public', 'private' ],
        default: 'public'
      }
    ];
    return inquirer.prompt(questions);
  }