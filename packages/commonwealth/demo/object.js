



export const updateValue = function (multiplier=1) {
    if (this.value) this.value = this.value * multiplier
    return this.value
}

export const nestedObject = {
    value: 1,
    updateValue
}

const objectToRegister = {
    value: 1,
    updateValue,
    nested: nestedObject
}

export default objectToRegister