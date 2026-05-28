use std::env;
use std::io::{Read, Write};
use std::net::TcpListener;

fn handle_get() -> String {
    let secret = env::var("SECRET_VARIABLE").unwrap_or_default();
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
        secret
    )
}

fn handle_post(body: &str, content_type: &str) -> String {
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
        content_type, body
    )
}

fn main() {
    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let addr = format!("{}:{}", host, port);

    println!("Starting server on http://{}", addr);

    let listener = TcpListener::bind(&addr).expect("Failed to bind");

    for stream in listener.incoming() {
        let mut stream = stream.expect("Failed to accept connection");
        let mut buffer = [0u8; 4096];
        let n = stream.read(&mut buffer).unwrap_or(0);
        let request = String::from_utf8_lossy(&buffer[..n]);

        let response = if request.starts_with("GET") {
            handle_get()
        } else if request.starts_with("POST") {
            let body = request
                .split("\r\n\r\n")
                .nth(1)
                .unwrap_or("")
                .trim_end_matches('\0');

            let content_type = request
                .lines()
                .find(|l| l.starts_with("Content-Type: "))
                .map(|l| &l[14..])
                .unwrap_or("application/octet-stream");

            handle_post(body, content_type)
        } else {
            "HTTP/1.1 405 Method Not Allowed\r\nAccess-Control-Allow-Origin: *\r\n\r\n".to_string()
        };

        let _ = stream.write_all(response.as_bytes());
    }
}
