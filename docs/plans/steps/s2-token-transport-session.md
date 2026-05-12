# S2 — Token-Transport und Session-Nutzung

## Ziel

Query-Token verschwinden aus URLs und REST-Aufrufen. Dashboard- und Config-Session werden nicht mehr über URL-Parameter transportiert.

## Konkrete Änderungen

- Alle `?token=`-basierten Dashboard-, Config- und Admin-/Teacher-Aufrufe identifizieren und auf einen nicht-URL-basierten Session-Transport umstellen
- Alte URL-basierte Token-Nutzung bewusst brechen; keine Übergangskompatibilität für Query-Token
- Browser-History, Logs und Referer dürfen keine Session-Secrets mehr aus URLs tragen
- Admin-/Teacher-Operationen dürfen nicht mehr an Query-Secrets hängen

## Betroffene Schnittstellen

- Dashboard- und Config-Aufrufe
- REST-Endpunkte mit bisheriger `token`-Query-Authentisierung
- Eventuelle Links oder Redirects, die Session-Daten in URLs weiterreichen

## Verifikation

- Browser-History enthält keine Session-Secrets
- Admin-/Teacher-Endpunkte funktionieren im neuen Flow ohne Query-Token
- Alte `?token=`-Aufrufe schlagen kontrolliert und erwartbar fehl
