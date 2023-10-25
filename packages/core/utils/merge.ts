const isObject = (o) => {
    return o && typeof o === "object" && !Array.isArray(o);
};

type MergeOptions = {
    arrays?: boolean
}


type ArbitraryObject = {[x:string]: any}

const merge = (toMerge: ArbitraryObject = {}, target: ArbitraryObject = {}, opts: MergeOptions = {}) => {
    // Deep merge objects
    for (const [k, v] of Object.entries(toMerge)) {
        const targetV = target[k];
        if (opts.arrays && Array.isArray(v) && Array.isArray(targetV)) target[k] = [...targetV, ...v]; // Merge array entries together
        else if (isObject(v) || isObject(targetV)) target[k] = merge(v, target[k], opts);
        else target[k] = v; // Replace primitive values
    }

    return target;
}

export default merge