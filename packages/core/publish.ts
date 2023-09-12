import { ifRepo, publishGHPages } from './github/index.js'
import { push } from './github/repo.js'

export type PublishOptions = {
    message: string
}

export default function publish ({ message }: PublishOptions) {
    return ifRepo(() => {
        if (message) push(message)
        return publishGHPages()
    })
}