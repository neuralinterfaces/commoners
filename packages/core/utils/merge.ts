const isObject = (o) => {
    return o && typeof o === "object" && !Array.isArray(o);
};

type MergeOptions = {
    arrays?: boolean,
    transform?: (path: string[], v: any) => any
}


type ArbitraryObject = {[x:string]: any}

const merge = (toMerge: ArbitraryObject = {}, target: ArbitraryObject = {}, opts: MergeOptions = {}, _path = []) => {

    const output = { ...target } // Shallow copy the target at each location

    // Deep merge objects
    for (const [k, v] of Object.entries(toMerge)) {
        const targetV = target[k];
        const updatedPath = [..._path, k];
        
        const updatedV = opts.transform ? opts.transform(updatedPath, v) : v; // Apply transformation

        if (updatedV === undefined) continue // Ignore undefined values

        if (opts.arrays && Array.isArray(updatedV) && Array.isArray(targetV)) output[k] = [...targetV, ...updatedV]; // Merge array entries together
        else if (isObject(updatedV) || isObject(targetV)) output[k] = merge(v, targetV, opts, updatedPath); // Recurse into objects
        else output[k] = updatedV; // Replace primitive values
    }

    return output;
}

export default merge