# Aufgaben-Hierarchie & Tree View - Stufe 2

## Ziel

Die Hierarchie wird nach der ersten Tree-View-Umsetzung fachlich und ergonomisch ausgebaut.

## Aggregierte Werte

Im Tree View koennen Eltern-Aufgaben zusaetzliche Summen anzeigen:

- eigene Schaetzung
- Summe der Schaetzungen aller Nachkommen
- eigene Ist-Zeit aus Buchungen
- Gesamt-Ist-Zeit aus eigenen Buchungen und Buchungen aller Nachkommen

Eltern-Aufgaben bleiben dennoch vollwertige Aufgaben. Ihre eigenen Werte werden nicht automatisch aus Kindern ueberschrieben.

## Erweiterte Navigation

- Alle aufklappen.
- Alle zuklappen.
- Optional: Miller-Columns-Ansicht als alternative Baum-Navigation.

## Erweiterte Loeschoptionen

Wenn eine Aufgabe Kinder hat:

- Loeschen ablehnen (Stufe-1-Verhalten)
- Kinder auf die Eltern-Ebene hochstufen
- ganzen Teilbaum loeschen

Die destruktiven Optionen brauchen eine klare Bestaetigung.

## Status-Automatik

Optional spaeter:

- Eltern auf `Done` setzen, wenn alle Kinder `Done` sind.
- Eltern auf `Started` setzen, wenn mindestens ein Kind `Started` ist.

Das sollte als explizite Einstellung behandelt werden, nicht als Standardverhalten.

## Weitere Hinweise in List/Board

Falls die Stufe-1-Hinweise nicht ausreichen:

- vollstaendiger Breadcrumb statt direktem Parent
- deutlicherer Children-Indikator
- Hover-Details fuer direkte Kinder
