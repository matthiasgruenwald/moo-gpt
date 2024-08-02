Das `#`-Symbol am Anfang einer Zeile kennzeichnet in Python einen Kommentar. Kommentare sind Anmerkungen oder Beschreibungen im Quellcode, die vom Python-Interpreter ignoriert werden, aber für Menschen, die den Code lesen oder warten, nützlich sein können. Sie helfen dabei, den Code verständlicher zu machen, indem sie erklären, was bestimmte Codeabschnitte tun oder warum spezifische Entscheidungen getroffen wurden.

Beispiel:

```python
# Dies ist ein Kommentar. Er wird vom Python-Interpreter ignoriert.

import math  # Importiert die Mathematikbibliothek

# Berechne den Umfang eines Kreises mit einem Radius von 5
radius = 5
umfang = 2 * math.pi * radius  # Formel für den Umfang

print("Der Umfang des Kreises beträgt:", umfang)  # Ausgabe des Ergebnisses
```

In diesem Beispiel gibt es mehrere Kommentare, die erklären, was der Code tut:

- Der erste Kommentar beschreibt allgemein den Zweck der Datei oder des Codesegments.
- Eine Inline-Kommentare (nach `import math`) erklärt, dass die Mathematikbibliothek importiert wird.
- Weitere Kommentare erklären die Berechnung des Kreisumfangs und die Ausgabe des Ergebnisses.

# Kommentare sind besonders wichtig für:

- Erklärungen komplexer oder nicht offensichtlicher Logik.
- Notizen über zukünftige Verbesserungen oder bekannte Probleme.
- Dokumentation von Abschnitten des Codes für andere Entwickler und für zukünftige Referenz.

1. Aufzählung

- erstens
- zweitens 


2. Mit Spiegelstrichen

- drittens
- viertens

## Formeln
Kein Problem, ich gebe Dir ein paar Hinweise, wie Du vorgehen kannst.

1. **Verstehe das Ziel**: Das ursprüngliche Programm wandelt Grad in Bogenmaß um. Deine Aufgabe besteht darin, den umgekehrten Prozess durchzuführen, d.h. Bogenmaß in Grad umzurechnen.

2. **Recherchiere die Formel**: Du musst wissen, dass es eine Beziehung zwischen Grad und Bogenmaß gibt. Diese lautet:
   \[ \text{Grad} = \text{Bogenmaß} \times \frac{180}{\pi} \]

3. **Schritte im Code**:
   - Importiere wie im ursprünglichen Programm die `math`-Bibliothek.
   - Ändere die Eingabe so, dass nach Bogenmaß gefragt wird.
   - Verwende die Umrechnungsformel, um Bogenmaß in Grad zu konvertieren.
   - Gib das Ergebnis in Grad aus.

4. **Kommentare im Code**: Kommentiere jeden Schritt im Code ausreichend, damit Du und andere den Ablauf nachvollziehen können.

Visualisieren wir nur die notwendigen Änderungen, ohne konkreten Code zu schreiben:

- Statt `a_deg = float(input("Winkel in Grad:"))`, nimm etwas wie `a_rad = float(input("Winkel im Bogenmaß:"))`.
- Ersetze die Berechnungszeile, um Grad anhand der Bogenmaß-Formel zu erhalten.
- Passe die Ausgabe entsprechend (z.B. "Wert in Grad: ").
