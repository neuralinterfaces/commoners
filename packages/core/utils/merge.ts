const isObject = (o) => {
    return o && typeof o === "object" && !Array.isArray(o);
};

type MergeOptions = {
    arrays?: boolean,
    transform?: (path: string[], v: any) => any
}


type ArbitraryObject = {[x:string]: any}

const merge = (toMerge: ArbitraryObject = {}, target: ArbitraryObject = {}, opts: MergeOptions = {}, _path = []) => {
    // Deep merge objects
    for (const [k, v] of Object.entries(toMerge)) {
        const targetV = target[k];
        const updatedPath = [..._path, k];
        
        const updatedV = opts.transform ? opts.transform(updatedPath, v) : v; // Apply transformation

        if (updatedV === undefined) delete target[k]; // Remove undefined values

        if (opts.arrays && Array.isArray(updatedV) && Array.isArray(targetV)) target[k] = [...targetV, ...updatedV]; // Merge array entries together
        else if (isObject(updatedV) || isObject(targetV)) target[k] = merge(v, target[k], opts, updatedPath); // Recurse into objects
        else target[k] = updatedV; // Replace primitive values
    }

    return target;
}

export default merge