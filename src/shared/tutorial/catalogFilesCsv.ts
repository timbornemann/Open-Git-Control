import type { TutorialChapter } from './types';
import { formatStep as s, formatRecipe as recipe, formatViewer, formatValue, formatSaved, c, row, tab, editor, element } from './formatLessonHelpers';
const p = (options: Parameters<typeof recipe>[1] = {}) => recipe('csv', options);
const viewer = formatViewer('csv');
const cell = (value: string) => `.working-csv-editor [data-csv-cell="${value}"]`;
export const TUTORIAL_FILES_CSV: TutorialChapter = {
  id: 'formats-csv',
  section: 'repo',
  title: ['CSV-Zellen, Zeilen und Spalten bearbeiten', 'Edit CSV cells, rows and columns'],
  description: [
    'Trennzeichen prüfen, Zellwerte zitieren, Zeilen und Spalten bearbeiten, speichern und vergleichen.',
    'Check delimiters, quote cell values, edit rows and columns, save and compare.',
  ],
  question: ['Wie bearbeite ich eine CSV-Datei als Tabelle?', 'How do I edit a CSV file as a table?'],
  keywords: 'csv tabelle table trennzeichen delimiter semikolon komma zelle cell zeile row spalte column',
  steps: [
    s(
      'overview',
      ['CSV als Text und Tabelle bearbeiten', 'Edit CSV as text and a table'],
      [
        'Wir öffnen eine kleine Aufgabenliste, prüfen ihr Trennzeichen und ändern eine Zelle. Danach fügen wir Zeile und Spalte hinzu, entfernen sie wieder und prüfen den gespeicherten Diff.',
        'We will open a small task list, check its delimiter and edit a cell. Then we will add and remove a row and column and inspect the saved diff.',
      ],
      row('data'),
      { continue: false },
    ),
    s(
      'expand',
      ['Öffne den Ordner data', 'Expand the data folder'],
      [
        'Klicke data. Darin liegt tasks.csv. CSV-Dateien sind Textdateien, die Tabellenwerte mit einem Trennzeichen speichern.',
        'Click data. It contains tasks.csv. CSV files are text files that store table values separated by a delimiter.',
      ],
      row('data'),
      { completion: element(row('data/tasks.csv')) },
    ),
    s(
      'open',
      ['Öffne tasks.csv', 'Open tasks.csv'],
      [
        'Klicke tasks.csv. Zunächst zeigt Text die gespeicherten Zeilen mit Name und Status.',
        'Click tasks.csv. Text first shows the saved lines containing Name and Status.',
      ],
      row('data/tasks.csv'),
      { prepare: { click: [row('data')] }, completion: element(`${viewer}[data-tab="text"] ${editor}`) },
    ),
    s(
      'source',
      ['Semikolons trennen die Werte', 'Semicolons separate the values'],
      [
        'Die erste Zeile Name;Status ist ein normaler Datensatz mit Spaltennamen. Darunter folgen Alex und Sam. In dieser Datei trennt ein Semikolon die beiden Spalten.',
        'The first line Name;Status is a regular record containing column names. Alex and Sam follow. This file uses a semicolon between its two columns.',
      ],
      editor,
      { prepare: p() },
    ),
    s(
      'table-purpose',
      ['Tabelle bearbeitet denselben Textinhalt', 'Table edits the same text contents'],
      [
        'Die Registerkarte Tabelle bietet einzelne Eingabefelder. Text und Tabelle teilen sich einen Editorentwurf. Ein Wechsel zwischen ihnen speichert die Datei noch nicht.',
        'The Table tab offers individual input fields. Text and Table share one editor draft. Switching between them does not save the file.',
      ],
      tab('table'),
      { prepare: p() },
    ),
    s(
      'open-table',
      ['Öffne die Tabellenansicht', 'Open Table'],
      [
        'Klicke Tabelle. Du solltest drei Zeilen und zwei Spalten sehen. Auch die Zeile mit Name und Status wird als Tabellenzeile dargestellt.',
        'Click Table. You should see three rows and two columns. The line with Name and Status is displayed as a table row too.',
      ],
      tab('table'),
      { prepare: p(), completion: element(cell('0:1')) },
    ),
    s(
      'coordinates',
      ['Zeilennummern und Spaltenbuchstaben', 'Row numbers and column letters'],
      [
        'Links stehen die Zeilennummern, oben A und B. Alex steht in Zeile 2, sein Status in Spalte B. Diese Koordinaten helfen beim gezielten Bearbeiten.',
        'Row numbers are on the left; A and B are at the top. Alex is in row 2, with the status in column B. These coordinates help you edit a specific cell.',
      ],
      '.working-csv-editor__scroller',
      { prepare: p({ tab: 'table' }) },
    ),
    s(
      'delimiter-purpose',
      ['Das Trennzeichen bestimmt die Darstellung', 'The delimiter determines the interpretation'],
      [
        'Oben wurde Semikolon erkannt. Die Auswahl ändert, wie der Text als Tabelle gelesen wird. Sie ist kein Befehl zum Umwandeln oder Speichern der Datei.',
        'Semicolon was detected at the top. The selector changes how text is read as a table. It is not a file-conversion or save command.',
      ],
      c('csv-delimiter'),
      { prepare: p({ tab: 'table' }) },
    ),
    s(
      'wrong-delimiter',
      ['Probiere Komma als Trennzeichen', 'Try comma as the delimiter'],
      [
        'Wähle Komma. Da die Datei Semikolons enthält, erscheinen ihre Werte jetzt gemeinsam in einer Spalte. Bearbeite in dieser Darstellung keine Zelle.',
        'Select Comma. Because the file contains semicolons, its values now appear together in one column. Do not edit a cell in this interpretation.',
      ],
      c('csv-delimiter'),
      { prepare: p({ tab: 'table' }), completion: { kind: 'value', selector: c('csv-delimiter'), value: [',', ','] } },
    ),
    s(
      'delimiter-result',
      ['Eine andere Darstellung ändert keine Datei', 'A different interpretation changes no file'],
      [
        'Die Semikolons stehen jetzt innerhalb der ersten Spalte. Der Speichern-Button bleibt gesperrt: Allein die Auswahl eines Trennzeichens erzeugt noch keinen Entwurf.',
        'The semicolons now appear inside the first column. Save remains disabled: selecting a delimiter alone does not create a draft.',
      ],
      '.working-csv-editor__summary',
      { prepare: { ...p({ tab: 'table' }), fill: [{ selector: c('csv-delimiter'), value: [',', ','] }] } },
    ),
    s(
      'restore-delimiter',
      ['Wähle wieder Semikolon', 'Select Semicolon again'],
      [
        'Wähle Semikolon. Name und Status sollen wieder in zwei getrennten Spalten erscheinen.',
        'Select Semicolon. Name and Status should appear in two separate columns again.',
      ],
      c('csv-delimiter'),
      {
        prepare: { ...p({ tab: 'table' }), fill: [{ selector: c('csv-delimiter'), value: [',', ','] }] },
        completion: { kind: 'all', conditions: [{ kind: 'value', selector: c('csv-delimiter'), value: [';', ';'] }, element(cell('0:1'))] },
      },
    ),
    s(
      'cell-purpose',
      ['Bearbeite genau Alex’ Status', 'Edit only Alex’s status'],
      [
        'Im nächsten Schritt ersetzen wir Offen in Zeile 2, Spalte B durch Bereit; geprüft. Das Semikolon soll dabei Teil des Zellwerts sein, nicht eine neue Spalte.',
        'Next we will replace Open in row 2, column B with Ready; reviewed. The semicolon should be part of the cell value rather than start a new column.',
      ],
      cell('1:1'),
      { prepare: p({ tab: 'table' }) },
    ),
    s(
      'edit-cell',
      ['Schreibe Bereit; geprüft in die Zelle', 'Enter Ready; reviewed in the cell'],
      [
        'Ersetze den gesamten Status von Alex durch Bereit; geprüft. Die Zeile von Sam und die Spaltennamen bleiben unverändert.',
        'Replace Alex’s whole status with Ready; reviewed. Keep Sam’s row and the column names unchanged.',
      ],
      cell('1:1'),
      { prepare: p({ tab: 'table' }), completion: { kind: 'value', selector: cell('1:1'), value: ['Bereit; geprüft', 'Ready; reviewed'] } },
    ),
    s(
      'cell-draft',
      ['Die Tabellenänderung ist ein Entwurf', 'The table edit is a draft'],
      [
        'Die Zelle enthält jetzt ein Semikolon und bleibt trotzdem eine einzelne Zelle. Der Stern zeigt, dass die Arbeitsdatei noch nicht gespeichert wurde.',
        'The cell now contains a semicolon and still remains a single cell. The asterisk shows that the working file has not been saved yet.',
      ],
      '.file-viewer-title',
      { prepare: p({ draft: 'csv-quoted', tab: 'table' }) },
    ),
    s(
      'inspect-text',
      ['Prüfe den CSV-Text', 'Inspect the CSV text'],
      [
        'Klicke Text. Der neue Status soll in doppelten Anführungszeichen stehen, damit sein Semikolon nicht als Spaltentrenner gelesen wird.',
        'Click Text. The new status should be enclosed in double quotes so that its semicolon is not read as a column separator.',
      ],
      tab('text'),
      { prepare: p({ draft: 'csv-quoted', tab: 'table' }), completion: formatValue('csv-quoted') },
    ),
    s(
      'quoting',
      ['Anführungszeichen schützen Trennzeichen', 'Quotes protect embedded delimiters'],
      [
        'Alex’ Status steht als "Bereit; geprüft" im CSV-Text. Die Tabellenansicht hat die nötigen Anführungszeichen ergänzt. So bleibt der Wert beim erneuten Einlesen zusammen.',
        'Alex’s status appears as "Ready; reviewed" in the CSV text. Table added the required quotes, keeping the value together when the file is read again.',
      ],
      editor,
      { prepare: p({ draft: 'csv-quoted' }) },
    ),
    s(
      'back-table',
      ['Kehre zur Tabelle zurück', 'Return to Table'],
      [
        'Klicke Tabelle. Die zitierte Zeichenfolge soll wieder als ein Status in Spalte B erscheinen.',
        'Click Table. The quoted string should appear as one status in column B again.',
      ],
      tab('table'),
      { prepare: p({ draft: 'csv-quoted' }), completion: element(`${viewer}[data-tab="table"] ${cell('1:1')}`) },
    ),
    s(
      'save-cell',
      ['Speichere die Zelländerung', 'Save the cell edit'],
      [
        'Klicke Arbeitsdatei speichern. Die neue CSV-Fassung wird gespeichert; der Git-Index behält die ursprüngliche Aufgabenliste.',
        'Click Save working file. The new CSV version is saved while the Git index keeps the original task list.',
      ],
      c('save-file'),
      { prepare: p({ draft: 'csv-quoted', tab: 'table' }), completion: formatSaved('csv', 'csv-quoted') },
    ),
    s(
      'row-purpose',
      ['Eine neue Zeile beginnt leer', 'A new row starts empty'],
      [
        'Die Schaltfläche + Zeile fügt unten einen leeren Datensatz mit zwei Zellen hinzu. Das verändert zunächst nur den Entwurf. Wir entfernen diese Übungszeile später wieder.',
        'The + Row button adds an empty two-cell record at the bottom. It changes only the draft at first. We will remove this practice row later.',
      ],
      c('csv-add-row'),
      { prepare: p({ saved: 'csv-quoted', tab: 'table' }) },
    ),
    s(
      'add-row',
      ['Füge eine Zeile hinzu', 'Add a row'],
      ['Klicke + Zeile. Unter Sam soll eine vierte, leere Zeile erscheinen.', 'Click + Row. A fourth, empty row should appear below Sam.'],
      c('csv-add-row'),
      { prepare: p({ saved: 'csv-quoted', tab: 'table' }), completion: element('.working-csv-editor [data-csv-row="3"]') },
    ),
    s(
      'column-purpose',
      ['Eine Spalte betrifft alle Zeilen', 'A column affects every row'],
      [
        '+ Spalte ergänzt am rechten Rand jeder Zeile ein leeres Feld. Das gilt auch für die erste Zeile mit den Spaltennamen und die gerade ergänzte Leerzeile.',
        '+ Column adds an empty field to the right of every row, including the first row with the column names and the newly added empty row.',
      ],
      c('csv-add-column'),
      { prepare: p({ saved: 'csv-quoted', draft: 'csv-row', tab: 'table' }) },
    ),
    s(
      'add-column',
      ['Füge eine dritte Spalte hinzu', 'Add a third column'],
      [
        'Klicke + Spalte. Rechts soll Spalte C erscheinen; die bisherigen Werte in A und B bleiben erhalten.',
        'Click + Column. Column C should appear on the right, retaining the existing values in A and B.',
      ],
      c('csv-add-column'),
      { prepare: p({ saved: 'csv-quoted', draft: 'csv-row', tab: 'table' }), completion: element(cell('0:2')) },
    ),
    s(
      'remove-column-purpose',
      ['Letzte Spalte entfernt ihre Werte', 'Last column removes its values'],
      [
        'Letzte Spalte entfernt die rechte Spalte aus allen Zeilen. Unsere neue Spalte C ist leer. In einer echten Datei würdest du vorher prüfen, ob ihre Werte noch gebraucht werden.',
        'Last column removes the rightmost column from every row. Our new column C is empty. In a real file you would first check whether its values are still needed.',
      ],
      c('csv-remove-column'),
      { prepare: p({ saved: 'csv-quoted', draft: 'csv-column', tab: 'table' }) },
    ),
    s(
      'remove-column',
      ['Entferne die leere Spalte C', 'Remove empty column C'],
      [
        'Klicke Letzte Spalte. Die Tabelle soll wieder nur A und B enthalten. Die leere vierte Zeile bleibt zunächst bestehen.',
        'Click Last column. The table should return to columns A and B. The empty fourth row remains for now.',
      ],
      c('csv-remove-column'),
      {
        prepare: p({ saved: 'csv-quoted', draft: 'csv-column', tab: 'table' }),
        completion: { kind: 'all', conditions: [{ kind: 'absent', selector: cell('0:2') }, element('.working-csv-editor [data-csv-row="3"]')] },
      },
    ),
    s(
      'remove-row-purpose',
      ['Das Papierkorbsymbol gehört zu einer Zeile', 'The trash icon belongs to one row'],
      [
        'Am rechten Rand jeder Zeile befindet sich Löschen. Im nächsten Schritt verwenden wir ausschließlich das Symbol der leeren vierten Zeile.',
        'Each row has a delete icon at the right. Next we will use only the icon for the empty fourth row.',
      ],
      '.working-csv-editor [data-csv-delete-row="3"]',
      { prepare: p({ saved: 'csv-quoted', draft: 'csv-row', tab: 'table' }) },
    ),
    s(
      'remove-row',
      ['Entferne die leere vierte Zeile', 'Remove the empty fourth row'],
      [
        'Klicke das Papierkorbsymbol in Zeile 4. Die drei Zeilen mit Spaltennamen, Alex und Sam sollen erhalten bleiben.',
        'Click the trash icon in row 4. The three rows containing column names, Alex and Sam should remain.',
      ],
      '.working-csv-editor [data-csv-delete-row="3"]',
      {
        prepare: p({ saved: 'csv-quoted', draft: 'csv-row', tab: 'table' }),
        completion: { kind: 'absent', selector: '.working-csv-editor [data-csv-row="3"]' },
      },
    ),
    s(
      'delete-existing-purpose',
      ['Auch vorhandene Datensätze lassen sich entfernen', 'Existing records can also be removed'],
      [
        'Wir entfernen nun Sams Datensatz als echte zweite Änderung. Die Arbeitsdatei bleibt bis zum erneuten Speichern bei der zuvor gespeicherten Fassung mit beiden Personen.',
        'We will now remove Sam’s record as a second real change. Until saving again, the working file keeps the previously saved version with both people.',
      ],
      '.working-csv-editor [data-csv-delete-row="2"]',
      { prepare: p({ saved: 'csv-quoted', tab: 'table' }) },
    ),
    s(
      'delete-existing',
      ['Entferne Sams Zeile', 'Remove Sam’s row'],
      [
        'Klicke das Papierkorbsymbol in Zeile 3, bei Sam. Die Zeile mit Alex und die Spaltennamen sollen erhalten bleiben.',
        'Click the trash icon in row 3, next to Sam. Keep Alex’s row and the column names.',
      ],
      '.working-csv-editor [data-csv-delete-row="2"]',
      { prepare: p({ saved: 'csv-quoted', tab: 'table' }), completion: { kind: 'absent', selector: '.working-csv-editor [data-csv-row="2"]' } },
    ),
    s(
      'check-final-text',
      ['Prüfe den vollständigen Entwurf', 'Check the complete draft'],
      [
        'Klicke Text. Es sollen nur noch die Kopfzeile und Alex’ Zeile enthalten sein; sein Status bleibt korrekt in Anführungszeichen.',
        'Click Text. Only the header and Alex’s row should remain, with the status still correctly quoted.',
      ],
      tab('text'),
      { prepare: p({ saved: 'csv-quoted', draft: 'csv-removed', tab: 'table' }), completion: formatValue('csv-removed') },
    ),
    s(
      'save-final',
      ['Speichere die entfernte Zeile', 'Save the removed row'],
      [
        'Klicke Arbeitsdatei speichern. Damit wird der Entwurf mit zwei Zeilen zur aktuellen Arbeitsdatei. Die ursprünglichen drei Zeilen bleiben noch im Index.',
        'Click Save working file. The two-line draft becomes the current working file. The original three lines remain in the index.',
      ],
      c('save-file'),
      { prepare: p({ saved: 'csv-quoted', draft: 'csv-removed' }), completion: formatSaved('csv', 'csv-removed') },
    ),
    s(
      'open-diff',
      ['Öffne den CSV-Diff', 'Open the CSV diff'],
      [
        'Klicke Diff, um beide gespeicherten Änderungen gegenüber dem ursprünglichen Index zu prüfen: Alex’ neuer Status und Sams entfernte Zeile.',
        'Click Diff to check both saved changes against the original index: Alex’s new status and Sam’s removed row.',
      ],
      tab('diff'),
      { prepare: p({ saved: 'csv-removed' }), completion: element(`${viewer}[data-tab="diff"] .diff-content-scroll`) },
    ),
    s(
      'diff-result',
      ['Der Diff zeigt Textzeilen statt Zellen', 'Diff shows text lines rather than cells'],
      [
        'CSV bleibt eine Textdatei. Der Diff zeigt die geänderte Zeile mit Alex und die entfernte Zeile mit Sam. Die zwischenzeitlich ergänzte Leerzeile und Spalte sind wieder entfernt.',
        'CSV remains a text file. Diff shows Alex’s changed line and Sam’s removed line. The temporary empty row and column have been removed again.',
      ],
      '.diff-content-scroll',
      { prepare: p({ saved: 'csv-removed', tab: 'diff' }) },
    ),
    s(
      'close',
      ['Schließe die CSV-Datei', 'Close the CSV file'],
      [
        'Klicke das X des Datei-Viewers. Die gespeicherte Aufgabenliste bleibt im Lernprojekt und ist weiterhin nicht vorgemerkt.',
        'Click the file viewer’s X. The saved task list remains in the learning project and is still unstaged.',
      ],
      c('close-file'),
      { prepare: p({ saved: 'csv-removed', tab: 'diff' }), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'finish',
      ['Tabelle und Text gehören zusammen', 'Table and Text belong together'],
      [
        'Du hast Trennzeichen, Zellwerte, Anführungszeichen, Zeilen und Spalten praktisch verwendet. Die Tabelle bearbeitet denselben Textentwurf; erst Speichern ändert die Arbeitsdatei.',
        'You practiced delimiters, cell values, quoting, rows and columns. Table edits the same text draft; only Save changes the working file.',
      ],
      c('open-files'),
      { prepare: { edits: [{ path: 'data/tasks.csv', content: { example: 'file-formats', version: 'csv-removed' } }] } },
    ),
  ],
};
