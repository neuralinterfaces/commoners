//! Receives the tapped frame stream in Rust (ctx.tapPort('frames', 'plugin:stream|frames'))
//! and reports rate, gaps and latency to stderr. Each frame: u32 sequence at byte 0,
//! f64 send time (ms since epoch) at byte 8, little-endian.

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    ipc::{InvokeBody, Request},
    plugin::{Builder, TauriPlugin},
    Manager, Runtime, State,
};

#[derive(Default)]
struct Stats {
    received: u64,
    last: u32,
    gaps: u64,
    latencies: Vec<f64>,
}

#[tauri::command]
fn frames(request: Request<'_>, stats: State<'_, Mutex<Stats>>) {
    let InvokeBody::Raw(bytes) = request.body() else { return };
    if bytes.len() < 16 {
        return;
    }
    let n = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
    let sent = f64::from_le_bytes(bytes[8..16].try_into().unwrap());
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs_f64() * 1000.0;

    let mut s = stats.lock().unwrap();
    if s.last != 0 && n != s.last + 1 {
        s.gaps += 1;
    }
    s.last = n;
    s.received += 1;
    if s.received > 120 {
        s.latencies.push(now - sent); // Skip warm-up (frames buffered before the tap attached)
    }
    if s.received % 300 == 0 && !s.latencies.is_empty() {
        let mut sorted = s.latencies.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let q = |p: f64| sorted[((p * sorted.len() as f64) as usize).min(sorted.len() - 1)];
        eprintln!(
            "[stream-tap] received={} gaps={} bytes={} p50={:.2}ms p95={:.2}ms max={:.2}ms",
            s.received,
            s.gaps,
            bytes.len(),
            q(0.5),
            q(0.95),
            sorted[sorted.len() - 1]
        );
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("stream")
        .invoke_handler(tauri::generate_handler![frames])
        .setup(|app, _| {
            app.manage(Mutex::new(Stats::default()));
            Ok(())
        })
        .build()
}
