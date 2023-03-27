
import chalk from "chalk";
import * as files from "../files.js"
// import * as inquirer from "./src/inquirer.js"
import * as github from "./github.js"
import * as repo from "./repo.js"


const getGithubToken = async () => {
    let token = github.getStoredGithubToken(); // Fetch token from config store
    return token ?? await github.getPersonalAccesToken(); // No token found, use credentials to access GitHub account
};
      
// Initialize a Git repository for the project
export const initGitRepo = async (name, description) => {

    if (files.directoryExists('.git')) {
        console.log(chalk.red('Already a Git repository!'));
        process.exit();
    }
    
    try {
        // Retrieve & Set Authentication Token
        const token = await getGithubToken();
        github.githubAuth(token);
    
        // Create remote repository
        const repoInfo = await repo.createRemoteRepo(name, description);

        // Create .gitignore file
        await repo.createGitignore();
    
        // Set up local repository and push to remote
        await repo.setupRepo(repoInfo.ssh_url);
    
        console.log(chalk.green(`Your new repository has been published at ${repoInfo.html_url}`));
        } catch(err) {
            if (err) {
            switch (err.status) {
                case 401:
                console.log(chalk.red('Couldn\'t log you in. Please provide correct credentials/token.'));
                break;
                case 422:
                console.log(chalk.red('There is already a remote repository or token with the same name'));
                break;
                default:
                console.log(chalk.red(err));
            }
            }
        }
}