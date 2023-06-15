
import chalk from "chalk";
import * as files from "../files.js"
import { getRepoDetails } from "../inquirer.js"
import * as github from "./github.js"
import * as repo from "./repo.js"
import { runCommand } from "../processes.js";


// INSTALL: yarn add configstore @octokit/rest clui simple-git touch lodash -d


const getGithubToken = async () => {
    let token = github.getStoredGithubToken(); // Fetch token from config store
    return token ?? await github.getPersonalAccesToken(); // No token found, use credentials to access GitHub account
};

export const publishGHPages = async (message) => {
    await repo.push(message, async () => {
        await runCommand('git', ['subtree split --branch gh-pages --prefix dist/'])
    })
}

// Initialize a Git repository for the project
export const initGitRepo = async ({ name, description } = {}) => {

    if (files.exists('.git')) {
        return {
            valid: true,
            message: 'This project is already a Git repository!'
        }
    }


    let token;
    try {

        // Retrieve & Set Authentication Token
        token = await getGithubToken();
        github.githubAuth(token);

        // Create remote repository
        const repoInfo = await repo.createRemoteRepo(name, description);

        // Create .gitignore file
        await repo.createGitignore();

        // Set up local repository and push to remote
        await repo.setupRepo(repoInfo.ssh_url);

        console.log(`Your new repository has been published at ${chalk.blueBright(repoInfo.html_url)}`);

        return {
            valid: true
        }

    } catch (err) {
        if (err) {
            switch (err.status) {
                case 401:
                    github.clearStoredGithubToken()
                    throw new Error('Couldn\'t log you in. Please try again and provide a new access token.')
                case 422:
                    throw new Error('There is already a remote repository or token with the same name')
                default:
                    throw err
            }
        }
    }
}