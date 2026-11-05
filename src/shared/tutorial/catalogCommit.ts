import type { TutorialChapter, TutorialStep, TutorialText } from './types';
import { step } from './catalogSteps';
import { COMMIT_DESCRIPTION, COMMIT_MESSAGE, commitSetup } from './lessonExamples';

const commitStep = (id: string, title: TutorialText, text: TutorialText, target: string, stage = 0, extra: Partial<TutorialStep> = {}) =>
  step(id, title, text, 'repo', target, { scenario: 'staged', continue: true, prepare: { commit: commitSetup(stage) }, ...extra });
const field = (name: string) => `[data-tutorial="commit-${name}"]`;
const value = (name: string, expected: TutorialText) => ({ kind: 'value' as const, selector: field(name), value: expected });

export const TUTORIAL_COMMIT_LESSON: TutorialChapter = {
  id: 'commit',
  section: 'repo',
  title: ['Commit: jedes Feld verstehen und ausfüllen', 'Commit: understand and fill in every field'],
  description: [
    'Typ, Präfix/Bereich, Nachricht, Beschreibung, Vorschau und Signoff einzeln ausprobieren und den Commit anschließend im Verlauf prüfen.',
    'Practice type, prefix/scope, message, description, preview and signoff individually, then check the commit in history.',
  ],
  question: ['Wie fülle ich alle Felder eines Commits richtig aus?', 'How do I fill in every commit field?'],
  keywords: 'commit type typ prefix präfix scope bereich message nachricht description beschreibung signoff titel',
  steps: [
    commitStep(
      'overview',
      ['Was speichert ein Commit?', 'What does a commit save?'],
      [
        'Ein Commit speichert den vorgemerkten Dateistand mit Autor, Zeitpunkt und Nachricht in der lokalen Geschichte. README.md liegt hier bereits im Index. In der vorherigen Lektion lernst du Staging. Jetzt füllen wir jedes Feld einzeln aus. Es wird noch nichts veröffentlicht.',
        'A commit saves the staged file contents with an author, timestamp and message in local history. README.md is already staged here. The previous lesson teaches staging. Now we will fill in each field separately. Nothing is published yet.',
      ],
      '.staging-commit-area',
      0,
      { continue: false },
    ),
    commitStep(
      'type-explained',
      ['Typ: welche Art von Änderung?', 'Type: what kind of change?'],
      [
        'Der Typ ist eine freiwillige Konvention im Commit-Titel. feat steht für Funktionen, fix für Fehlerkorrekturen und docs für Dokumentation. Standard lässt den Typ weg. Der Typ verändert keine Dateien und führt keine Git-Aktion aus.',
        'The type is an optional convention in the commit title. feat means a feature, fix a bug fix, and docs documentation. Default omits the type. Choosing a type does not modify files or execute Git.',
      ],
      field('type'),
    ),
    commitStep(
      'type',
      ['Wähle docs aus', 'Choose docs'],
      [
        'Unsere README ist Dokumentation. Öffne das Feld Typ und wähle docs. Erst nach dieser Auswahl geht es weiter. Die übrigen Typen bleiben für andere Arten von Änderungen verfügbar.',
        'Our README is documentation. Open Type and choose docs. The lesson continues after that selection. The other types remain available for other kinds of changes.',
      ],
      field('type'),
      0,
      { completion: value('type', ['docs', 'docs']) },
    ),
    commitStep(
      'prefix-explained',
      ['Präfix oder Bereich: wozu gehört die Änderung?', 'Prefix or scope: what does the change concern?'],
      [
        'Ohne Typ ist dieses Feld ein freies Präfix vor der Nachricht. Mit einem Typ wird es zum Bereich in Klammern, zum Beispiel docs(lernen). Es ist optional: Lass es weg, wenn ein Bereich nichts zum Verständnis beiträgt.',
        'Without a type this field is a free prefix before the message. With a type it becomes the scope in parentheses, such as docs(lernen). It is optional: omit it when a scope adds no useful context.',
      ],
      field('prefix'),
      1,
    ),
    commitStep(
      'prefix',
      ['Trage den Bereich lernen ein', 'Enter the scope lernen'],
      [
        'Schreibe lernen in das Feld Bereich. Verwende hier nur den Bereich selbst; Klammern und Doppelpunkt setzt die App später automatisch. Deine Auswahl docs bleibt dabei erhalten.',
        'Enter lernen in Scope. Enter only the scope itself; the app adds parentheses and the colon automatically. Your docs selection is retained.',
      ],
      field('prefix'),
      1,
      { completion: value('prefix', ['lernen', 'lernen']) },
    ),
    commitStep(
      'message-explained',
      ['Nachricht: die kurze Zusammenfassung', 'Message: the short summary'],
      [
        'Die Nachricht beschreibt knapp, was sich ändert. Sie erscheint direkt im Commit-Graphen. Typ und Bereich gehören in ihre eigenen Felder und werden nicht noch einmal in der Nachricht wiederholt. Ohne einen Titel lässt die App keinen Commit zu.',
        'The message briefly describes what changes. It appears directly in the commit graph. Type and scope have their own fields and should not be repeated in the message. The app requires a title before committing.',
      ],
      field('message'),
      2,
    ),
    commitStep(
      'message',
      ['Schreibe die Beispielnachricht', 'Write the sample message'],
      [
        `Trage „${COMMIT_MESSAGE[0]}“ in Nachricht ein. Du schreibst nur diesen Text. Die App verbindet ihn mit Typ und Bereich. Du kannst das Feld wie gewohnt mit den Pfeiltasten bearbeiten.`,
        `Enter “${COMMIT_MESSAGE[1]}” in Message. Enter only that text. The app combines it with the type and scope. Arrow keys continue to edit the text normally.`,
      ],
      field('message'),
      2,
      { completion: value('message', COMMIT_MESSAGE) },
    ),
    commitStep(
      'description-explained',
      ['Beschreibung: warum und mit welchem Kontext?', 'Description: why and with what context?'],
      [
        'Die Beschreibung ist der optionale ausführliche Text unter dem Titel. Hier erklärst du Gründe, Auswirkungen oder Zusammenhänge. Mehrere Zeilen sind erlaubt. Dieser Text ist Teil der Commit-Nachricht, keine zusätzliche Datei und keine Veröffentlichung.',
        'Description is the optional longer text below the title. Explain reasons, effects or context here. Multiple lines are allowed. This text belongs to the commit message; it is neither an extra file nor a publication.',
      ],
      field('description'),
      3,
    ),
    commitStep(
      'description',
      ['Ergänze einen Grund', 'Add a reason'],
      [
        `Gib in Beschreibung ein: „${COMMIT_DESCRIPTION[0]}“. Damit hat der Commit einen knappen Titel und eine getrennte Erläuterung.`,
        `Enter in Description: “${COMMIT_DESCRIPTION[1]}”. The commit now has a short title and a separate explanation.`,
      ],
      field('description'),
      3,
      { completion: value('description', COMMIT_DESCRIPTION) },
    ),
    commitStep(
      'preview',
      ['Prüfe den zusammengesetzten Titel', 'Check the assembled title'],
      [
        'Die Vorschau zeigt docs(lernen): Lernprojekt dokumentieren. Sie setzt Typ, Bereich und Nachricht zusammen. Kontrolliere vor jedem Commit, ob Titel und vorgemerkte Dateien zusammenpassen. Die Beschreibung wird getrennt vom Titel gespeichert.',
        'The preview shows docs(lernen): Document the learning project. It combines type, scope and message. Before committing, check that the title describes the staged files. The description is stored separately from the title.',
      ],
      '.staging-commit-preview',
      4,
    ),
    commitStep(
      'signoff-explained',
      ['Signoff ist keine kryptografische Signatur', 'Signoff is not a cryptographic signature'],
      [
        'Signoff ergänzt eine Signed-off-by-Zeile mit deiner Git-Identität im Beschreibungstext. Projekte können diese Bestätigung verlangen. Sie ist etwas anderes als ein kryptografisch signierter Commit. In dieser Übung wird die Beispielidentität verwendet.',
        'Signoff appends a Signed-off-by line with your Git identity to the message body. A project may require this confirmation. It differs from a cryptographically signed commit. Practice uses the sample identity.',
      ],
      '[data-tutorial="commit-signoff"]',
      4,
    ),
    commitStep(
      'signoff',
      ['Aktiviere Signoff für den Beispielcommit', 'Enable signoff for the sample commit'],
      [
        'Setze das Häkchen bei Signoff. In deinen eigenen Projekten aktivierst du es entsprechend den Projektregeln. Es führt allein noch keinen Commit aus.',
        'Check Signoff. In your own projects, use it according to project rules. Checking it alone does not create a commit.',
      ],
      '[data-tutorial="commit-signoff"]',
      4,
      { completion: { kind: 'value', selector: '[data-tutorial="commit-signoff"] input', value: ['true', 'true'] } },
    ),
    commitStep(
      'amend-explained',
      ['Amend ändert den letzten Commit', 'Amend changes the last commit'],
      [
        'Amend ersetzt den letzten Commit, statt einen weiteren anzulegen. Bereits veröffentlichte Geschichte darfst du dadurch nicht unbedacht umschreiben. Lass Amend für diesen ersten neuen Commit ausgeschaltet. Eine eigene Lektion behandelt Korrekturen und ihre Schutzprüfungen.',
        'Amend replaces the last commit instead of adding another. Do not casually rewrite published history this way. Leave Amend off for this first new commit. A separate lesson covers corrections and their protection checks.',
      ],
      '[data-tutorial="commit-amend"]',
      5,
    ),
    commitStep(
      'commit',
      ['Jetzt den lokalen Commit erstellen', 'Now create the local commit'],
      [
        'Prüfe README.md im Index, die Vorschau und die Beschreibung. Klicke dann Commit. Die App speichert die vorgemerkten Inhalte und deine Angaben. Push ist eine getrennte Aktion und wird hier nicht ausgeführt.',
        'Check README.md in the index, the preview and the description, then click Commit. The app saves the staged contents and your message. Push is a separate action and is not performed here.',
      ],
      '.staging-commit-btn',
      5,
      { action: 'committed' },
    ),
    commitStep(
      'result',
      ['Das Ergebnis im Verlauf prüfen', 'Check the result in history'],
      [
        'Dein neuer Commit steht nun oben im Graphen. Die vorgemerkten Änderungen sind gespeichert und das Formular ist wieder leer. Bei einem eigenen Projekt kannst du den Commit auswählen und Autor, Nachricht sowie Dateien prüfen. Dein Commit ist weiterhin lokal.',
        'Your new commit is at the top of the graph. The staged changes have been saved and the form is empty again. In your own project you can select the commit and inspect its author, message and files. The commit is still local.',
      ],
      '[data-tutorial="graph"]',
      5,
      { scenario: 'committed' },
    ),
  ],
};
