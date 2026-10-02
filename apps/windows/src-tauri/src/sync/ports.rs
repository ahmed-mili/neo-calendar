//! Des ports libres pour le moteur : un d'écoute (TCP et UDP : Syncthing écoute en TCP et en QUIC sur le
//! même numéro) et un pour l'interface REST (TCP, sur `127.0.0.1`).

use std::net::{TcpListener, UdpSocket};

/// Libre en TCP ET en UDP sur toutes les interfaces (là où le moteur écoute).
pub fn binds_tcp_and_udp(port: u16) -> bool {
    TcpListener::bind(("0.0.0.0", port)).is_ok() && UdpSocket::bind(("0.0.0.0", port)).is_ok()
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
    fn real_picks_are_usable() {
        assert!(pick_listen_port().unwrap() >= 1024);
        assert!(pick_gui_port().unwrap() >= 1024);
    }
}
