//! Ce que l'app impose au moteur : fonctions pures, testées sans moteur. Les noms de champs sont ceux
//! de `lib/config/` de la v2.1.5 (les mêmes réglages que l'Android).

use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use quick_xml::{Reader, Writer};
use serde_json::{json, Map, Value};
use std::io::Cursor;

/// Le serveur de relais public : sans lui, pas de synchro hors du même réseau quand aucune connexion directe n'est possible.
pub const RELAY_POOL: &str = "dynamic+https://relays.syncthing.net/endpoint";
pub const TRASHCAN_DAYS: &str = "30";
pub const FOLDER_LABEL: &str = "Neo Calendar";

pub enum Opt {
    Bool(bool),
    Int(i64),
    List(Vec<String>),
}

pub fn listen_addresses(port: u16) -> Vec<String> {
    vec![format!("tcp://0.0.0.0:{port}"), format!("quic://0.0.0.0:{port}"), RELAY_POOL.to_string()]
}

/// Les options imposées, sous le nom de leur élément XML (`listenAddress` : un élément par adresse).
/// Pas de mise à jour automatique (l'app fixe la version), pas de statistiques d'usage ni de rapport de
/// plantage, découverte globale et relais activés, découverte locale désactivée (le port UDP 21027 n'est
/// pas partageable avec un Syncthing installé sur le même PC : le second à démarrer y perd en silence).
pub fn options(port: u16) -> Vec<(&'static str, Opt)> {
    vec![
        ("autoUpgradeIntervalH", Opt::Int(0)),
        ("urAccepted", Opt::Int(-1)),
        ("crashReportingEnabled", Opt::Bool(false)),
        ("startBrowser", Opt::Bool(false)),
        ("globalAnnounceEnabled", Opt::Bool(true)),
        ("localAnnounceEnabled", Opt::Bool(false)),
        ("relaysEnabled", Opt::Bool(true)),
        ("listenAddress", Opt::List(listen_addresses(port))),
    ]
}

/// Le corps du PATCH `/rest/config/options` : les mêmes options (l'API REST reste la source de vérité après le démarrage).
pub fn options_json(port: u16) -> Value {
    let mut map = Map::new();
    for (key, opt) in options(port) {
        match opt {
            Opt::Bool(b) => map.insert(key.to_string(), json!(b)),
            Opt::Int(i) => map.insert(key.to_string(), json!(i)),
            Opt::List(list) => map.insert("listenAddresses".to_string(), json!(list)),
        };
    }
    Value::Object(map)
}

/// Un appareil distant, en PUT sur `/rest/config/devices/{id}`. Adresse « dynamic » : découverte globale.
pub fn device(device_id: &str, name: &str) -> Value {
    json!({
        "deviceID": device_id,
        "name": name,
        "addresses": ["dynamic"],
        "compression": "metadata",
        "introducer": false,
        "autoAcceptFolders": false,
        "paused": false
    })
}

/// Le dossier de notes, en PUT sur `/rest/config/folders/{id}` : envoi et réception, surveillance des
/// fichiers, `ignorePerms` (les droits d'un autre système n'ont pas de sens ici), corbeille de 30 jours
/// (une note écrasée ou supprimée par une synchro reste dans `.stversions`). `device_ids` contient
/// l'identifiant de CET appareil.
pub fn folder(id: &str, label: &str, path: &str, device_ids: &[String]) -> Value {
    json!({
        "id": id,
        "label": label,
        "path": path,
        "type": "sendreceive",
        "fsWatcherEnabled": true,
        "ignorePerms": true,
        "rescanIntervalS": 3600,
        "devices": folder_devices(device_ids),
        "versioning": { "type": "trashcan", "params": { "cleanoutDays": TRASHCAN_DAYS } }
    })
}

/// La liste `devices` d'un dossier, sans doublon.
pub fn folder_devices(device_ids: &[String]) -> Value {
    let mut seen: Vec<&String> = Vec::new();
    for id in device_ids {
        if !seen.contains(&id) {
            seen.push(id);
        }
    }
    Value::Array(seen.iter().map(|id| json!({ "deviceID": id })).collect())
}

/// Des caractères tirés au hasard dans un alphabet de 32 symboles (5 bits chacun : aucun biais de tirage).
pub fn random_chars(alphabet: &[u8; 32], len: usize) -> String {
    let mut bytes = vec![0u8; len];
    getrandom::fill(&mut bytes).expect("le générateur aléatoire du système");
    bytes.iter().map(|b| alphabet[(*b & 31) as usize] as char).collect()
}

const ID_ALPHABET: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyz234567";

/// Un identifiant de dossier du genre `neo-k3x9a-2fq7z`.
pub fn new_folder_id() -> String {
    format!("neo-{}-{}", random_chars(ID_ALPHABET, 5), random_chars(ID_ALPHABET, 5))
}

fn xml_text(opt: &Opt) -> Vec<String> {
    match opt {
        Opt::Bool(b) => vec![b.to_string()],
        Opt::Int(i) => vec![i.to_string()],
        Opt::List(list) => list.clone(),
    }
}

/// Remplace, dans `<configuration><section>`, les éléments enfants nommés dans `values` par leurs nouvelles
/// valeurs (un élément par valeur, ajoutés en fin de section). Le reste du fichier traverse tel quel.
fn set_section(xml: &str, section: &str, values: &[(&str, Vec<String>)]) -> Result<String, String> {
    let mut reader = Reader::from_str(xml);
    let mut writer = Writer::new(Cursor::new(Vec::new()));
    let mut path: Vec<String> = Vec::new();
    let mut skipping = 0usize;
    let mut found = false;
    let managed = |path: &[String], name: &str| {
        path.len() == 2 && path[1] == section && values.iter().any(|(tag, _)| *tag == name)
    };
    loop {
        let event = reader.read_event().map_err(|e| format!("config.xml illisible : {e}"))?;
        match event {
            Event::Eof => break,
            Event::Start(ref e) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                if skipping > 0 {
                    skipping += 1;
                    continue;
                }
                if managed(&path, &name) {
                    skipping = 1;
                    continue;
                }
                path.push(name);
                writer.write_event(event).map_err(|e| e.to_string())?;
            }
            Event::Empty(ref e) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                if skipping > 0 || managed(&path, &name) {
                    continue;
                }
                writer.write_event(event).map_err(|e| e.to_string())?;
            }
            Event::End(ref e) => {
                if skipping > 0 {
                    skipping -= 1;
                    continue;
                }
                if path.len() == 2 && path[1] == section {
                    found = true;
                    for (tag, list) in values {
                        for value in list {
                            writer.write_event(Event::Start(BytesStart::new(*tag))).map_err(|e| e.to_string())?;
                            writer.write_event(Event::Text(BytesText::new(value))).map_err(|e| e.to_string())?;
                            writer.write_event(Event::End(BytesEnd::new(*tag))).map_err(|e| e.to_string())?;
                        }
                    }
                }
                path.pop();
                writer.write_event(Event::End(e.borrow())).map_err(|e| e.to_string())?;
            }
            _ if skipping > 0 => {}
            _ => writer.write_event(event).map_err(|e| e.to_string())?,
        }
    }
    if !found {
        return Err(format!("config.xml sans <{section}>"));
    }
    String::from_utf8(writer.into_inner().into_inner()).map_err(|e| e.to_string())
}

/// Pose, dans le `config.xml` qu'un `syncthing generate` a écrit, les options imposées ET l'identifiant et le
/// mot de passe (haché, bcrypt) de l'interface web, AVANT le premier `serve` : le moteur n'écoute jamais sur
/// un port non choisi, n'annonce jamais sur le réseau local, et son interface web n'est jamais ouverte.
/// Idempotent : l'appliquer deux fois donne le même fichier.
pub fn prepare_config(xml: &str, port: u16, gui_user: &str, gui_password_hash: &str) -> Result<String, String> {
    if xml.to_ascii_lowercase().contains("<!doctype") {
        return Err("déclaration de type refusée dans config.xml".to_string());
    }
    let options: Vec<(&str, Vec<String>)> = options(port).iter().map(|(tag, opt)| (*tag, xml_text(opt))).collect();
    let with_options = set_section(xml, "options", &options)?;
    set_section(
        &with_options,
        "gui",
        &[("user", vec![gui_user.to_string()]), ("password", vec![gui_password_hash.to_string()])],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const GENERATED: &str = r#"<configuration version="52">
    <device id="AAAA" name="PC d'Ahmed &amp; fils" compression="metadata">
        <address>dynamic</address>
    </device>
    <gui enabled="true" tls="false" sendBasicAuthPrompt="false">
        <address>127.0.0.1:64119</address>
        <apikey>GC36hTWQs7j2N9csTHm9NWuNKSYsrFzi</apikey>
        <user>ancien</user>
    </gui>
    <options>
        <listenAddress>tcp://0.0.0.0:64122</listenAddress>
        <listenAddress>dynamic+https://relays.syncthing.net/endpoint</listenAddress>
        <globalAnnounceEnabled>true</globalAnnounceEnabled>
        <localAnnounceEnabled>true</localAnnounceEnabled>
        <relaysEnabled>true</relaysEnabled>
        <startBrowser>true</startBrowser>
        <urAccepted>0</urAccepted>
        <autoUpgradeIntervalH>12</autoUpgradeIntervalH>
        <crashReportingEnabled>true</crashReportingEnabled>
        <natEnabled>true</natEnabled>
    </options>
</configuration>"#;

    fn count(haystack: &str, needle: &str) -> usize {
        haystack.matches(needle).count()
    }

    #[test]
    fn the_options_body_carries_the_imposed_settings() {
        let body = options_json(22001);
        assert_eq!(body["autoUpgradeIntervalH"], 0);
        assert_eq!(body["urAccepted"], -1);
        assert_eq!(body["crashReportingEnabled"], false);
        assert_eq!(body["localAnnounceEnabled"], false);
        assert_eq!(body["globalAnnounceEnabled"], true);
        assert_eq!(body["relaysEnabled"], true);
        assert_eq!(body["listenAddresses"][0], "tcp://0.0.0.0:22001");
        assert_eq!(body["listenAddresses"][1], "quic://0.0.0.0:22001");
        assert_eq!(body["listenAddresses"][2], RELAY_POOL);
    }

    #[test]
    fn prepare_config_imposes_options_before_the_first_serve() {
        let out = prepare_config(GENERATED, 50123, "neo", "$2b$10$hash").unwrap();
        assert!(out.contains("<localAnnounceEnabled>false</localAnnounceEnabled>"));
        assert!(out.contains("<autoUpgradeIntervalH>0</autoUpgradeIntervalH>"));
        assert!(out.contains("<urAccepted>-1</urAccepted>"));
        assert!(out.contains("<crashReportingEnabled>false</crashReportingEnabled>"));
        assert!(out.contains("<startBrowser>false</startBrowser>"));
        assert!(out.contains("<listenAddress>tcp://0.0.0.0:50123</listenAddress>"));
        assert!(out.contains("<listenAddress>quic://0.0.0.0:50123</listenAddress>"));
        assert!(!out.contains("64122"), "l'ancien port d'écoute est retiré");
        assert_eq!(count(&out, "<listenAddress>"), 3);
        assert_eq!(count(&out, "<localAnnounceEnabled>"), 1);
        // Ce que l'app ne règle pas traverse tel quel.
        assert!(out.contains("<natEnabled>true</natEnabled>"));
        assert!(out.contains(r#"name="PC d'Ahmed &amp; fils""#));
        assert!(out.contains("<apikey>GC36hTWQs7j2N9csTHm9NWuNKSYsrFzi</apikey>"));
    }

    #[test]
    fn prepare_config_locks_the_web_interface() {
        let out = prepare_config(GENERATED, 50123, "neo", "$2b$10$hash").unwrap();
        assert!(out.contains("<user>neo</user>"));
        assert!(out.contains("<password>$2b$10$hash</password>"));
        assert!(!out.contains("ancien"));
        assert_eq!(count(&out, "<user>"), 1);
    }

    #[test]
    fn prepare_config_is_idempotent() {
        let once = prepare_config(GENERATED, 50123, "neo", "$2b$10$hash").unwrap();
        let twice = prepare_config(&once, 50123, "neo", "$2b$10$hash").unwrap();
        assert_eq!(count(&twice, "<listenAddress>"), 3);
        assert_eq!(count(&twice, "<password>"), 1);
        assert_eq!(once, twice);
    }

    #[test]
    fn prepare_config_refuses_what_is_not_a_syncthing_config() {
        assert!(prepare_config("<configuration></configuration>", 1, "u", "h").is_err());
        assert!(prepare_config("pas du xml <<<", 1, "u", "h").is_err());
        let doctype = "<!DOCTYPE x [<!ENTITY a \"b\">]><configuration><options></options><gui></gui></configuration>";
        assert!(prepare_config(doctype, 1, "u", "h").unwrap_err().contains("type"));
    }

    #[test]
    fn the_folder_body_is_send_receive_with_a_thirty_day_trashcan() {
        let body = folder("neo-aaaaa-bbbbb", "Neo Calendar", "C:\\Neo Calendar", &["ME".to_string(), "ME".to_string(), "TEL".to_string()]);
        assert_eq!(body["type"], "sendreceive");
        assert_eq!(body["path"], "C:\\Neo Calendar");
        assert_eq!(body["fsWatcherEnabled"], true);
        assert_eq!(body["versioning"]["type"], "trashcan");
        assert_eq!(body["versioning"]["params"]["cleanoutDays"], "30");
        assert_eq!(body["devices"].as_array().unwrap().len(), 2, "pas de doublon");
    }

    #[test]
    fn a_new_remote_device_is_never_an_introducer_nor_auto_accepting() {
        let body = device("ABC", "Pixel");
        assert_eq!(body["introducer"], false);
        assert_eq!(body["autoAcceptFolders"], false);
        assert_eq!(body["addresses"][0], "dynamic");
    }

    #[test]
    fn folder_ids_have_the_expected_shape_and_differ() {
        let a = new_folder_id();
        let b = new_folder_id();
        assert_ne!(a, b);
        assert_eq!(a.len(), "neo-xxxxx-xxxxx".len());
        assert!(a.starts_with("neo-"));
        assert!(a[4..].chars().all(|c| c == '-' || c.is_ascii_lowercase() || ('2'..='7').contains(&c)));
    }
}
