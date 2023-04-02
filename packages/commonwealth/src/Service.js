const isProxy = Symbol('isProxy')
const proxyTarget = Symbol('proxyTarget')

import * as symbols from './symbols.js'

const nonProxiableObjects = [Map, Set, WeakMap, WeakSet, Promise]    

// An object that has its method / properties exposed to networking protocols
export class Service {
    constructor() {
        this.responses = new Map()
        this.endpoints = new Map()
        this.onOutput = {}
    }

    #runOnOutput = (id, ...args) => {
        if (this.onOutput[id]) this.onOutput[id].forEach(link => {
            (this.endpoints.get(link) || this.responses.get(link)).call({ [symbols.id]: id }, ...args)
        })
    }

    #canProxy = (service) => {
        return (typeof service === 'function' || (typeof service === 'object' && (!nonProxiableObjects.find(c => service instanceof c))));
    }

    register = (id, service) => {

        if (this.#canProxy(service)) {
            
            const proxy = (service[isProxy]) ? service : new Proxy(service, {
                get: (target, key) => {
                    if (key === symbols.id) return id;
                    if (key === isProxy)  return true;
                    if (key === proxyTarget) return target;
                    return Reflect.get(target, key);
                },
                set: (target, key, value) => {
                    const propId = `${id}.${key}`

                    // Just ensure new properties are registered
                    if (!(key in target)) {
                        target[key] = value // Ensure is present first
                        value = this.#monitorProperty(propId) // register new property
                    }

                    // this.#runOnOutput(propId, value)
                    return Reflect.set(target, key, value);
                },
                apply: (target, thisArg, args) => {
                    let res = target.call(thisArg ?? {}, ...args)
                    if (thisArg === undefined) this.#runOnOutput(id, res) // Only run links if the function has no context
                    return res
                },
            })

            this.endpoints.set(id, proxy)
            if (typeof service === 'object') {
                Object.entries(service).forEach(([k, v]) => this.register(`${id}.${k}`, v))
            }

            return proxy
        } 

        // Force primitives to be wrapped in an object so they have IDs
        else {
            if (typeof service === 'number') service = new Number(service)
            else if (typeof service === 'string') service = new String(service)
            else if (typeof service === 'boolean') service = new Boolean(service)
            if (service) Object.defineProperty(service, symbols.id, { value: id })
        }

        return service
    }
    

    set(id, ...args) {
        const path = id.split('.')
        const prop = path.length > 1 ? path.pop() : null
        const service = this.endpoints.get(path.join('.'))

        if (service) {
            if (!prop) service[prop] = args[0] // Register new object if no property is specified
            if (prop in service) {
                const endpoint = service[prop]
                if (typeof endpoint === 'function') return service[prop](...args) // NOTE: Must only include functions with side-effects
                else {
                    console.log('Setting', id, 'to', args)
                    if (args[0]) service[prop] = args[0]
                    return service[prop]
                }
            } else throw new Error(`Service with ID ${id} is not a function or object`)
        } else throw new Error(`No service found with path ${path}`)
    }
    
    get(id, ...args) {
        const path = id.split('.')
        const prop =  path.length > 1 ? path.pop() : null
        const service = this.endpoints.get(path.join('.'))

        if (service) {
            if (!prop) return service // Return object if no property is specified
            if (prop in service) {
                const endpoint = service[prop]
                if (typeof endpoint === 'function') return service[prop](...args) // NOTE: Must distinguish from functions with side-effects
                else return endpoint
            }
            else throw new Error(`Service with ID ${id} is not a function or object`)
        } else throw new Error(`No service found with path ${path}`)
    }

    #monitorProperty = (source) => {

        const path = source.split('.')
        const prop = path.pop()
        const parent = this.endpoints.get(path.join('.'))
        if (parent && prop in parent) {
            const desc = Object.getOwnPropertyDescriptor(parent, prop)
            let latestValue = parent[prop]
            
            if (typeof latestValue === 'function') {
                const og = latestValue
                latestValue = (...args) => {
                    const res = og.call(parent, ...args)
                    if (res !== undefined) this.#runOnOutput(source, res) // Only run links if the function returns a value
                    return res
                }
            }

            if (!desc.set) Object.defineProperty(parent, prop, {
                get: () => latestValue,
                set: (value) => {
                    latestValue = this.register(source, value)
                    if ((typeof latestValue !== 'function')) this.#runOnOutput(source, latestValue)
                },
            })

            return latestValue // Pass back the latest function proxy
        } 
    }


    add(source, target) {
        
        // If a function is passed, add it to the possible responses
        if (typeof target === 'function') {
            const found = Array.from(this.responses.keys()).find(key => this.responses.get(key) === target)
            if (found) target = found // Only add once
            else {
                const f = target
                target = Math.random().toString(36).slice(7) // Generate a random ID for the function
                this.responses.set(target, f)
            }
        }

        // if (!this.endpoints.has(target)) throw new Error(`Could not find ${target} in service`)
        // else if (!this.endpoints.has(source)) throw new Error(`Could not find ${source} in service`)
        
        if (!this.onOutput[source]) this.onOutput[source] = new Set()
        this.onOutput[source].add(target)

        this.#monitorProperty(source)
        // else console.error('Could not find parent', source)

        return target
    }

    remove(source, target) {

        // Clear if no target is specified
        if (!target) {
            this.onOutput.source = new Set()
            return
        }

        // Selectively remove links
        if (typeof target === 'string') {
            this.onOutput[source].delete(target)
        } else {
            const f = target

            // Grab response that matches this endpoint
            const matched = Array.from(this.onOutput[source]).find((key) => {
                const val = this.responses.get(key)
                return val && (val === f || (val[isProxy] && val[proxyTarget] === f))

            })
  
            if (matched) this.onOutput[source].delete(matched)
            else console.warn(`Could not find function ${f} in service`)
        }
    }
}