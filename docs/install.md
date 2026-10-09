# Installation

VideoWizard laeuft direkt aus diesem Repo; es gibt keinen Build-Schritt, alle
Aufrufe gehen ueber `tsx`. Voraussetzung ist Node 22 oder neuer. `<repo>`
steht im Folgenden fuer den Pfad dieses Repos.

Den MCP-Server **verbindlich mit `npm --silent` starten**. Ohne `--silent`
schreibt npm sein Banner nach stdout und zerbricht den JSON-RPC-Strom. Der
Server liegt in `src/mcp/server.ts` und ruft dieselben Befehle auf wie die
CLI; die Skills liegen unter `skills/`.

Zuerst die Abhaengigkeiten:

    npm install

## Claude Code

Die Plugin-Metadaten liegen in `.claude-plugin/plugin.json` bei; die Skills
liegen unter `skills/`. Wird dieses Repo als Plugin eingebunden, findet
Claude Code die Skills ohne weitere Einrichtung.

Den MCP-Server hinzufuegen:

    claude mcp add videowizard -- npm --silent --prefix <repo> run mcp

Alternativ eine `.mcp.json` beim Plugin mit demselben Befehl:

```json
{
  "mcpServers": {
    "videowizard": {
      "command": "npm",
      "args": ["--silent", "--prefix", "<repo>", "run", "mcp"]
    }
  }
}
```

## OpenCode

**Mit dem Plugin (empfohlen).** `.opencode/plugins/videowizard.js` liegt im
Repo und registriert `skills/`. Es ist fuer OpenCode V1 (config-Hook) und V2
(setup) gebaut. Wird das Repo als Plugin eingebunden, ist keine weitere
Skill-Einrichtung noetig.

**Ohne Plugin.** Das Skills-Verzeichnis in der `opencode.json` eintragen
(V2: `"skills": ["<repo>/skills"]`, V1 stattdessen
`{"skills": {"paths": ["<repo>/skills"]}}`). Der MCP-Block sieht je Fassung
anders aus; V2 legt die Server unter `mcp.servers` ab:

```json
{
  "mcp": {
    "servers": {
      "videowizard": {
        "type": "local",
        "command": ["npm", "--silent", "--prefix", "<repo>", "run", "mcp"]
      }
    }
  }
}
```

V1 traegt den Servernamen direkt unter `mcp` ein:

```json
{
  "mcp": {
    "videowizard": {
      "type": "local",
      "command": ["npm", "--silent", "--prefix", "<repo>", "run", "mcp"]
    }
  }
}
```

## Codex

Der MCP-Block in der Codex-Konfiguration (`~/.codex/config.toml`). Die genaue
Form ist **nachgeschlagen, nicht gegengeprueft**; bitte gegen die eigene
Codex-Fassung pruefen:

```toml
[mcp_servers.videowizard]
command = "npm"
args = ["--silent", "--prefix", "<repo>", "run", "mcp"]
```

Geprueft ist nur der Serverstart selbst (`npm --silent run mcp`).
