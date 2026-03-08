use wasm_bindgen::prelude::*;

/// Echo function: returns the input string as-is.
/// Demonstrates basic wasm-bindgen interop.
#[wasm_bindgen]
pub fn echo(input: &str) -> String {
    input.to_string()
}

/// Add two numbers together.
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
