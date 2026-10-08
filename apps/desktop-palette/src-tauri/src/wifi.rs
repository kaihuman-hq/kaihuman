//! Wi‑Fi through NetworkManager's `nmcli` — the palette's `>w`, desktop only.
//!
//! Every call runs `nmcli` in terse mode (`-t`) with `LC_ALL=C`, so its output is the same
//! colon-separated lines whatever the locale. The arguments go to `nmcli` directly, never through
//! a shell, so an SSID cannot run anything.

use std::process::{Command, Stdio};

use serde::Serialize;

/// How long a connection may take before `nmcli` gives up; its own default is 90 s.
const CONNECT_WAIT_SECONDS: &str = "30";

/// The connection type `nmcli connection show` gives a Wi‑Fi profile.
const WIFI_PROFILE_TYPE: &str = "802-11-wireless";

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Network {
    pub ssid: String,
    pub signal: u8,
    pub security: String,
    pub active: bool,
    pub known: bool,
}

/// Splits one terse line into its fields: `:` separates them, `\:` and `\\` stand for a literal
/// colon and backslash.
fn terse_fields(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut field = String::new();
    let mut chars = line.chars();
    while let Some(c) = chars.next() {
        match c {
            '\\' => field.extend(chars.next()),
            ':' => fields.push(std::mem::take(&mut field)),
            c => field.push(c),
        }
    }
    fields.push(field);
    fields
}

/// `nmcli -t -f NAME,TYPE connection show`: the names of the Wi‑Fi profiles.
fn parse_profiles(output: &str) -> Vec<String> {
    output
        .lines()
        .filter_map(|line| match terse_fields(line).as_slice() {
            [name, kind] if kind == WIFI_PROFILE_TYPE => Some(name.clone()),
            _ => None,
        })
        .collect()
}

/// `nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY device wifi list`: one network per SSID — the one in
/// use, else its strongest access point — hidden networks left out, connected first, then by
/// signal. A network is known when a profile has its name, which is what `nmcli` calls the ones it
/// creates.
fn parse_networks(output: &str, profiles: &[String]) -> Vec<Network> {
    let mut networks: Vec<Network> = Vec::new();
    for line in output.lines() {
        let [in_use, ssid, signal, security] = terse_fields(line).try_into().unwrap_or_default();
        if ssid.is_empty() {
            continue;
        }
        let security = security.trim();
        let network = Network {
            known: profiles.contains(&ssid),
            active: in_use.trim() == "*",
            signal: signal.trim().parse().unwrap_or(0),
            security: if security == "--" { "" } else { security }.to_string(),
            ssid,
        };
        match networks.iter_mut().find(|seen| seen.ssid == network.ssid) {
            Some(seen) if (network.active, network.signal) > (seen.active, seen.signal) => {
                *seen = network
            }
            Some(_) => {}
            None => networks.push(network),
        }
    }
    networks.sort_by(|a, b| (b.active, b.signal).cmp(&(a.active, a.signal)));
    networks
}

/// Runs `nmcli` with `args` and answers its output, or its own error message.
fn nmcli(args: &[&str]) -> Result<String, String> {
    let output = Command::new("nmcli")
        .args(args)
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| {
            format!("Could not run nmcli ({error}) — is NetworkManager installed and running?")
        })?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let reason = stderr
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("nmcli failed");
    Err(reason.trim().trim_start_matches("Error: ").to_string())
}

fn profiles() -> Result<Vec<String>, String> {
    Ok(parse_profiles(&nmcli(&[
        "-t",
        "-f",
        "NAME,TYPE",
        "connection",
        "show",
    ])?))
}

pub fn enabled() -> Result<bool, String> {
    Ok(nmcli(&["-t", "-f", "WIFI", "radio"])?.trim() == "enabled")
}

/// The networks in range. `rescan` waits for a fresh scan; NetworkManager refuses one right after
/// another, and the last scan answers instead.
pub fn networks(rescan: bool) -> Result<Vec<Network>, String> {
    let list = |rescan: &str| {
        nmcli(&[
            "-t",
            "-f",
            "IN-USE,SSID,SIGNAL,SECURITY",
            "device",
            "wifi",
            "list",
            "--rescan",
            rescan,
        ])
    };
    let output = if rescan {
        list("yes").or_else(|_| list("no"))?
    } else {
        list("no")?
    };
    Ok(parse_networks(&output, &profiles()?))
}

pub fn set_enabled(on: bool) -> Result<(), String> {
    nmcli(&["radio", "wifi", if on { "on" } else { "off" }]).map(|_| ())
}

/// Connects through the saved profile, or creates one with `password`. `nmcli` takes the password
/// as an argument, so it shows in the process list for the moment the call lasts.
pub fn connect(ssid: &str, password: Option<&str>) -> Result<(), String> {
    if ssid.is_empty() || ssid.len() > 32 {
        return Err("An SSID has 1 to 32 bytes".into());
    }
    let was_known = profiles()?.iter().any(|name| name == ssid);
    let mut args = vec![
        "-w",
        CONNECT_WAIT_SECONDS,
        "device",
        "wifi",
        "connect",
        ssid,
    ];
    if let Some(password) = password.filter(|password| !password.is_empty()) {
        args.extend(["password", password]);
    }
    nmcli(&args).map(|_| ()).map_err(|error| {
        // A profile made for a wrong password would be tried again, without asking, next time.
        if !was_known {
            let _ = nmcli(&["connection", "delete", "id", ssid]);
        }
        format!("Could not connect to {ssid}: {error}")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_escaped_colons_and_backslashes() {
        assert_eq!(
            terse_fields(r"*:Café\: 2\\4:78:WPA2"),
            ["*", "Café: 2\\4", "78", "WPA2"]
        );
        assert_eq!(terse_fields(":"), ["", ""]);
    }

    #[test]
    fn keeps_only_wifi_profiles() {
        let output = "Home:802-11-wireless\nWired connection 1:802-3-ethernet\nlo:loopback\nCafé\\: 2:802-11-wireless\n";
        assert_eq!(parse_profiles(output), ["Home", "Café: 2"]);
    }

    #[test]
    fn lists_each_network_once_connected_first_then_strongest() {
        let output = "\
 :Cafe:40:WPA2
 :Open Net:90:--
 :Home:55:WPA1 WPA2
*:Home:52:WPA1 WPA2
 ::70:WPA2
 :Cafe:65:WPA2
";
        let networks = parse_networks(output, &["Home".to_string()]);
        let summary: Vec<_> = networks
            .iter()
            .map(|n| {
                (
                    n.ssid.as_str(),
                    n.signal,
                    n.security.as_str(),
                    n.active,
                    n.known,
                )
            })
            .collect();
        assert_eq!(
            summary,
            [
                ("Home", 52, "WPA1 WPA2", true, true),
                ("Open Net", 90, "", false, false),
                ("Cafe", 65, "WPA2", false, false),
            ]
        );
    }

    #[test]
    fn skips_lines_it_cannot_read() {
        assert!(parse_networks("garbage\n", &[]).is_empty());
    }

    #[test]
    fn refuses_an_ssid_no_network_can_have() {
        assert_eq!(connect("", None).unwrap_err(), "An SSID has 1 to 32 bytes");
        assert_eq!(
            connect(&"x".repeat(33), None).unwrap_err(),
            "An SSID has 1 to 32 bytes"
        );
    }
}
