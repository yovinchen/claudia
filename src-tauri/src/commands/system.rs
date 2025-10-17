use std::process::{Command, Stdio};

/// Flush system DNS cache across platforms
#[tauri::command]
pub async fn flush_dns() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("ipconfig")
            .arg("/flushdns")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to execute ipconfig: {}", e))?;
        if output.status.success() {
            return Ok("DNS cache flushed".into());
        } else {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(if err.is_empty() {
                "ipconfig /flushdns failed".into()
            } else {
                err
            });
        }
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("dscacheutil")
            .arg("-flushcache")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to execute dscacheutil: {}", e))?;
        if output.status.success() {
            return Ok("DNS cache flushed".into());
        } else {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(if err.is_empty() {
                "dscacheutil -flushcache failed".into()
            } else {
                err
            });
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Try common Linux methods in order
        let attempts: Vec<(&str, Vec<&str>)> = vec![
            ("resolvectl", vec!["flush-caches"]),
            ("systemd-resolve", vec!["--flush-caches"]),
            (
                "sh",
                vec![
                    "-c",
                    "service nscd restart || service dnsmasq restart || rc-service nscd restart",
                ],
            ),
        ];

        for (cmd, args) in attempts {
            if let Ok(output) = Command::new(cmd)
                .args(&args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
            {
                if output.status.success() {
                    return Ok("DNS cache flushed".into());
                }
            }
        }
        Err("No supported DNS flush method succeeded on this Linux system".into())
    }
}
