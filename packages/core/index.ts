import { ifRepo, publishGHPages } from './github/index.js'
import { push as pushToGithub } from "./github/repo.js";

export { default as launch } from './launch.js'

type ResolvedConfig = {

}

type BuildOptions = {

}


type StartOptions = {
    
}

type DevOptions = {

}

type PublishOptions = {
    message: string
}

type CommitOptions = PublishOptions

export const build = (opts: BuildOptions, resolvedConfig: ResolvedConfig) => {

}

export const start = (opts: StartOptions, resolvedConfig: ResolvedConfig) => {

}

export const createServer = (opts: DevOptions, resolvedConfig: ResolvedConfig) => {

}


// ------------- Github Integration ----------------
export const commit = (opts: CommitOptions) => ifRepo(() => pushToGithub(opts.message))

export const publish = (opts: PublishOptions) => ifRepo(() => {
    if (opts.message) pushToGithub(opts.message)
    return publishGHPages()
})