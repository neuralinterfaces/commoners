
import chalk from "chalk";
import * as files from "../files.js"
import * as github from "./github.js"
import * as repo from "./repo.js"
import { runCommand } from "../processes.js";
import { rmdirSync } from "node:fs";

const getGithubToken = async () => {
    let token = github.getStoredGithubToken(); // Fetch token from config store
    return token ?? await github.getPersonalAccesToken(); // No token found, use credentials to access GitHub account
};

// NOTE: It would still be very nice to automate the initial push
export const publishGHPages = async (message) => {
    await runCommand('git subtree push --prefix dist origin gh-pages', undefined, { log: false }) // NOTE: This is a fixed branch and folder
}

// Initialize a Git repository for the project
export const initGitRepo = async ({ name, description } = {}, opts = {}) => {

    // Ensure you have a valid token
    let token;
    if (opts.clear) github.clearStoredGithubToken()

    // Retrieve & Set Authentication Token
    token = await getGithubToken();
    github.githubAuth(token);


    // Ensure the git repo exists
    if (files.exists('.git')) {
        if (opts.reset) rmdirSync('.git', { recursive: true, force: true })
        else return {
            valid: true,
            message: 'This project is already a Git repository!'
        }
    }


    try {

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