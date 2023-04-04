
export const displayName = 'Name'

export function updateDisplayName(newName) {
    if (newName) this.displayName = newName // Update the name (or ignore on get requests)
    return this.displayName
}

export const nested = {
    displayName: "Nested Name",
    updateDisplayName
}

export const array = []