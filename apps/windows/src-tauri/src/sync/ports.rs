//! Des ports libres pour le moteur : un d'écoute (TCP et UDP : Syncthing écoute en TCP et en QUIC sur le
//! même numéro) et un pour l'interface REST (TCP, sur `127.0.0.1`).

use std::net::TcpListener;
#[cfg(any(test, not(windows)))]
use std::net::UdpSocket;

/// Libre en TCP ET en UDP sur toutes les interfaces (là où le moteur écoute).
///
/// Sous Windows, on lit les tables de ports du système au lieu d'essayer d'écouter sur `0.0.0.0` : une écoute sur
/// toutes les interfaces fait poser par le pare-feu Windows sa question pour `neo-calendar.exe`, en plus de celle,
/// légitime, pour Syncthing (deux invites d'affilée à l'activation de la synchro).
#[cfg(windows)]
pub fn binds_tcp_and_udp(port: u16) -> bool {
    match ports_in_use() {
        Some(used) => !used.contains(&port),
        // Tables illisibles : un port déjà pris fera échouer l'écoute de Syncthing, qui le dit dans son journal.
        None => true,
    }
}

#[cfg(not(windows))]
pub fn binds_tcp_and_udp(port: u16) -> bool {
    TcpListener::bind(("0.0.0.0", port)).is_ok() && UdpSocket::bind(("0.0.0.0", port)).is_ok()
}

/// Les ports locaux occupés en TCP (écoutes et connexions) et en UDP, IPv4 et IPv6. `None` si une table est illisible.
#[cfg(windows)]
fn ports_in_use() -> Option<std::collections::HashSet<u16>> {
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, GetExtendedUdpTable, MIB_TCP6ROW_OWNER_PID, MIB_TCPROW_OWNER_PID, MIB_UDP6ROW_OWNER_PID,
        MIB_UDPROW_OWNER_PID, TCP_TABLE_OWNER_PID_ALL, UDP_TABLE_OWNER_PID,
    };
    // `AF_INET` / `AF_INET6` (Winsock), sans tirer toute la fonctionnalité Winsock de `windows-sys` pour deux nombres.
    const IPV4: u32 = 2;
    const IPV6: u32 = 23;

    let mut used = std::collections::HashSet::new();
    let tcp = |family| table(|buffer, size| unsafe { GetExtendedTcpTable(buffer, size, 0, family, TCP_TABLE_OWNER_PID_ALL, 0) });
    let udp = |family| table(|buffer, size| unsafe { GetExtendedUdpTable(buffer, size, 0, family, UDP_TABLE_OWNER_PID, 0) });
    used.extend(rows::<MIB_TCPROW_OWNER_PID>(&tcp(IPV4)?).iter().map(|r| local_port(r.dwLocalPort)));
    used.extend(rows::<MIB_TCP6ROW_OWNER_PID>(&tcp(IPV6)?).iter().map(|r| local_port(r.dwLocalPort)));
    used.extend(rows::<MIB_UDPROW_OWNER_PID>(&udp(IPV4)?).iter().map(|r| local_port(r.dwLocalPort)));
    used.extend(rows::<MIB_UDP6ROW_OWNER_PID>(&udp(IPV6)?).iter().map(|r| local_port(r.dwLocalPort)));
    Some(used)
}

/// Une table IP Helper : premier appel pour la taille, second pour le contenu (la table peut grandir entre les deux).
/// Le tampon est en `u32` pour l'alignement des lignes.
#[cfg(windows)]
fn table(fill: impl Fn(*mut core::ffi::c_void, *mut u32) -> u32) -> Option<Vec<u32>> {
    const NO_ERROR: u32 = 0;
    const ERROR_INSUFFICIENT_BUFFER: u32 = 122;
    let mut size = 0u32;
    for _ in 0..4 {
        let mut buffer = vec![0u32; (size as usize).div_ceil(4).max(1)];
        size = (buffer.len() * 4) as u32;
        match fill(buffer.as_mut_ptr().cast(), &mut size) {
            NO_ERROR => return Some(buffer),
            ERROR_INSUFFICIENT_BUFFER => continue,
            _ => return None,
        }
    }
    None
}

/// Les lignes d'une table : un `u32` de nombre d'entrées, puis les lignes (toutes alignées sur 4 octets).
#[cfg(windows)]
fn rows<Row: Copy>(buffer: &[u32]) -> Vec<Row> {
    let count = buffer[0] as usize;
    let available = (buffer.len() - 1) * 4 / std::mem::size_of::<Row>();
    let start = buffer[1..].as_ptr().cast::<Row>();
    (0..count.min(available)).map(|i| unsafe { start.add(i).read_unaligned() }).collect()
}

/// Le port est rangé dans les 16 bits bas, en ordre réseau.
#[cfg(windows)]
fn local_port(raw: u32) -> u16 {
    u16::from_be(raw as u16)
}

/// Libre en TCP sur la boucle locale (là où écoute l'interface REST).
pub fn binds_loopback_tcp(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn ephemeral_port() -> u16 {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .unwrap_or(0)
}

/// Un port libre selon `is_free`, tiré par le système (`candidate`) : au plus `tries` essais.
pub fn pick_free_port(
    is_free: &dyn Fn(u16) -> bool,
    candidate: &dyn Fn() -> u16,
    tries: usize,
) -> Result<u16, String> {
    for _ in 0..tries {
        let port = candidate();
        if port >= 1024 && is_free(port) {
            return Ok(port);
        }
    }
    Err("Aucun port libre trouvé pour la synchronisation.".to_string())
}

pub fn pick_listen_port() -> Result<u16, String> {
    pick_free_port(&binds_tcp_and_udp, &ephemeral_port, 50)
}

pub fn pick_gui_port() -> Result<u16, String> {
    pick_free_port(&binds_loopback_tcp, &ephemeral_port, 50)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn it_skips_taken_and_privileged_ports() {
        let sequence = [80u16, 40000, 40001];
        let index = Cell::new(0usize);
        let candidate = || {
            let port = sequence[index.get()];
            index.set(index.get() + 1);
            port
        };
        let port = pick_free_port(&|p| p == 40001, &candidate, 10).unwrap();
        assert_eq!(port, 40001);
        assert_eq!(index.get(), 3);
    }

    #[test]
    fn it_gives_up_after_the_allowed_tries() {
        let error = pick_free_port(&|_| false, &|| 40000, 5).unwrap_err();
        assert!(error.contains("Aucun port libre"));
    }

    #[test]
    fn a_port_held_by_someone_else_is_not_free() {
        let held = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = held.local_addr().unwrap().port();
        assert!(!binds_loopback_tcp(port));
        drop(held);
        assert!(binds_loopback_tcp(port));
    }

    #[test]
    fn a_port_held_in_tcp_or_in_udp_is_not_free_for_the_engine() {
        let tcp = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let tcp_port = tcp.local_addr().unwrap().port();
        let udp = UdpSocket::bind(("127.0.0.1", 0)).unwrap();
        let udp_port = udp.local_addr().unwrap().port();
        assert!(!binds_tcp_and_udp(tcp_port));
        assert!(!binds_tcp_and_udp(udp_port));
        drop((tcp, udp));
    }

    #[test]
    fn real_picks_are_usable() {
        assert!(pick_listen_port().unwrap() >= 1024);
        assert!(pick_gui_port().unwrap() >= 1024);
    }
}
