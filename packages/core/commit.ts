

import { ifRepo } from './github/index.js'
import { push as pushToGithub } from "./github/repo.js";
import { PublishOptions } from './publish.js';

type CommitOptions = PublishOptions

export default function commit ({ message }: CommitOptions) {
    return ifRepo(() => pushToGithub(message))
}