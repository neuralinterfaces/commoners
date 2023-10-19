import inquirer from 'inquirer';

export const yesNo = async (message) => (await inquirer.prompt([{ name: 'result', type: "confirm", message: message }])).result