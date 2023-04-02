const isProxy = Symbol('isProxy')
const proxyTarget = Symbol('proxyTarget')

import { isESM } from './esm.js'
import * as symbols from './symbols.js'

const nonProxiableObjects = [Map, Set, WeakMap, WeakSet, Promise]   


// An object that has its method / properties exposed to networking protocols
// NOTE: Both functions and ES Modules must use the returned proxy to be able to trigger subscriptions

export class Service {
    constructor() {
        this.responses = new Map()
        this.endpoints = {}
        this.subscriptions = {}
        Object.defineProperty(this.endpoints, symbols.doNotAddAll, { value: true }) // DO NOT DRILL INTO THIS OBJECT
    }

    forward = (id, ...args) => {
        if (this.subscriptions[id]) this.subscriptions[id].forEach(link => {
            (this.endpoints[link] || this.responses.get(link)).call({ [symbols.id]: id }, ...args)
        })
    }

    #canProxy = (service) => {
        return (typeof service === 'function' || (typeof service === 'object' && (!nonProxiableObjects.find(c => service instanceof c))));
    }

    add = (id, endpoint) => {

        if (isESM(endpoint)) endpoint = { ...endpoint }

        if (this.#canProxy(endpoint)) {
            
            // let esmNewValues = {}
            const proxy = (endpoint[isProxy]) ? endpoint : new Proxy(endpoint, {
                get: (target, key) => {
                    if (key === symbols.id) return id;
                    if (key === isProxy)  return true;
                    if (key === proxyTarget) return target;
                    // if (key in esmNewValues) return esmNewValues[key]
                    return Reflect.get(target, key);
                },
                set: (target, key, value) => {
                    const propId = `${id}.${key}`

                    // // Cannot register new properties on ESM objects
                    // if (isESM(target)) {
                    //     console.warn(`Cannot register a new property on an ESM object. Property: ${propId}`)
                    //     esmNewValues[key] = value // Still resolve the value
                    //     this.forward(propId, value) // Still run links
                    //     return true
                    // }

                    // Just ensure new properties are registered
                    if (!(key in target)) {
                        target[key] = value // Ensure is present first
                        value = this.#monitorProperty(propId) // register new property
                    }

                    // this.forward(propId, value)
                    return Reflect.set(target, key, value);
                },
                apply: (target, thisArg, args) => {
                    let res = target.call(thisArg ?? {}, ...args)
                    if (thisArg === undefined) this.forward(id, res) // Only run links if the function has no context
                    return res
                },
            })

            // Drill into proxied objects to register their properties
            if (typeof endpoint === 'object' && !endpoint[symbols.doNotAddAll]) {
                Object.entries(endpoint).forEach(([k, v]) => {
                    const propId = `${id}.${k}`
                    const res = this.add(propId, v)
                    // NOTE: This must be set to effectively target the proxy on the original object...
                    // if (res) endpoint[k] = res 
                })
            }
            endpoint = proxy // Use proxy as endpoint object
        } 

        // Force primitives to be wrapped in an object so they have IDs
        else {
            if (typeof endpoint === 'number') endpoint = new Number(endpoint)
            else if (typeof endpoint === 'string') endpoint = new String(endpoint)
            else if (typeof endpoint === 'boolean') endpoint = new Boolean(endpoint)
            if (endpoint && !(symbols.id in endpoint)) Object.defineProperty(endpoint, symbols.id, { value: id })
        }

        this.endpoints[id] = endpoint // Register anything that is attempted to be added

        return endpoint
    }

    // Remove a registered endpoint
    remove = (target) => {
        if (typeof target === 'function') {
            target = Array.from(this.responses.keys()).find(key => this.responses.get(key) === target)
        }

        if (target && typeof target === 'string') {
            const got = this.endpoints[target]
            if (got) {
                delete this.endpoints[target]

                // Delete sub-endpoints
                if (typeof got === 'object') Object.entries(got).forEach(([k, v]) => this.remove(`${target}.${k}`))
            }
        }
    }
    

    set(id, ...args) {
        const path = id.split('.')
        const prop = path.length > 1 ? path.pop() : null
        const parent = this.endpoints[path.join('.')]

        if (parent) {

            // Register bare updates without a parent
            if (!prop) {
                parent[prop] = args[0] // Register new object if no property is specified
                this.forward(id, args[0])
            }

            // Register updates on the parent
            if (prop in parent) {
                const endpoint = parent[prop]
                if (typeof endpoint === 'function') return parent[prop](...args) // NOTE: Must only include functions with side-effects
                else {
                    if (args[0]) parent[prop] = args[0]
                    return parent[prop]
                }
            } else throw new Error(`Service with ID ${id} is not a function or object`)
        } else throw new Error(`No service found with path ${path}`)
    }

    #handleGet = (endpoint) => {
        if (typeof endpoint === 'function') return endpoint(...args) // NOTE: Must distinguish from functions with side-effects
        else return endpoint
    }
    
    get(id, ...args) {
        const path = id.split('.')
        const endpoint = this.endpoints[path.join('.')]
        if (endpoint) return this.#handleGet(endpoint) // Directly get endpoint if available

        console.error('AHH')
        const prop =  path.length > 1 ? path.pop() : null
        const parent = this.endpoints[path.join('.')]

        if (parent) {
            if (!prop) return parent // Return object if no property is specified
            if (prop in parent) {
                const endpoint = parent[prop]
                if (typeof endpoint === 'function') return parent[prop](...args) // NOTE: Must distinguish from functions with side-effects
                else return endpoint
            }
            else throw new Error(`Endpoint with ID ${id} is not a function or object`)
        } else throw new Error(`No endpoint found with path ${path}`)
    }

    #monitorProperty = (source) => {

        const path = source.split('.')
        const prop = path.pop()
        const parent = this.endpoints[path.join('.')]
        if (parent && prop in parent) {
            const desc = Object.getOwnPropertyDescriptor(parent, prop)
            let latestValue = parent[prop]
            
            if (typeof latestValue === 'function') {
                const og = latestValue

                latestValue = (...args) => {
                    const res = og.call(parent, ...args)
                    if (res !== undefined) this.forward(source, res) // Only run links if the function returns a value
                    return res
                }
            }

            if (!desc.set && desc.configurable) Object.defineProperty(parent, prop, {
                get: () => latestValue,
                set: (value) => {
                    latestValue = this.add(source, value)
                    if ((typeof latestValue !== 'function')) this.forward(source, latestValue)
                },
            })

            return latestValue // Pass back the latest function proxy
        } 
    }


    subscribe(source, target) {
        
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
        
        if (!this.subscriptions[source]) this.subscriptions[source] = new Set()
        this.subscriptions[source].add(target)

        this.#monitorProperty(source)
        // else console.error('Could not find parent', source)

        return target
    }

    unsubscribe(source, target) {

        // Clear if no target is specified
        if (!target) {
            this.subscriptions.source = new Set()
            return
        }

        // Selectively remove links
        if (typeof target === 'string') {
            this.subscriptions[source].delete(target)
        } else {
            const f = target

            // Grab response that matches this endpoint
            const matched = Array.from(this.subscriptions[source]).find((key) => {
                const val = this.responses.get(key)
                return val && (val === f || (val[isProxy] && val[proxyTarget] === f))

            })
  
            if (matched) this.subscriptions[source].delete(matched)
            else console.warn(`Could not find function ${f} in service`)
        }
    }
}