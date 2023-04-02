
export const displayName = 'Name'

export function updateDisplayName(newName='Default Name') {
    if (this.displayName) this.displayName = newName
    return this.displayName
}

export const nested = {
    displayName: "Nested Name",
    updateDisplayName
}

export const array = []