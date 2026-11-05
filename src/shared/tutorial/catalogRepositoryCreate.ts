import type { TutorialChapter, TutorialStep, TutorialText } from './types';
import { repoStep as s, repoControl as c, dialogField as f, recipe, lessonValue as value, lessonElement as element } from './repositoryLessonHelpers';
const picker = '.tutorial-directory-picker';
const choice = `${picker} .tutorial-directory-choice`;
const choose = `${picker} .dialog-btn-primary`;
const add = c('add');
const initRecipe = (stage = 0) =>
  recipe(
    { directory: 'empty' },
    [add, choice, choose],
    stage === 0
      ? []
      : ([
          { selector: `${f('createReadme')} input`, value: ['true', 'true'] },
          ...(stage >= 2 ? [{ selector: `${f('license')} select`, value: ['GPL-3.0-only', 'GPL-3.0-only'] as TutorialText }] : []),
          ...(stage >= 3 ? [{ selector: `${f('copyrightHolder')} input`, value: ['Alex Beispiel', 'Alex Beispiel'] as TutorialText }] : []),
          ...(stage >= 4 ? [{ selector: `${f('programName')} input`, value: ['OGC-Testprogramm', 'OGC-Testprogramm'] as TutorialText }] : []),
          ...(stage >= 5 ? [{ selector: `${f('programDescription')} input`, value: ['Ein Lernprojekt', 'A learning project'] as TutorialText }] : []),
        ] as { selector: string; value: TutorialText }[]),
  );
const init = (id: string, title: TutorialText, text: TutorialText, target: string, stage = 0, extra: Partial<TutorialStep> = {}) =>
  s(id, title, text, target, { prepare: initRecipe(stage), ...extra });
export const REPOSITORY_OPEN_LESSON: TutorialChapter = {
  id: 'repository-open',
  section: 'localRepos',
  title: ['Vorhandene Ordner öffnen und wiederfinden', 'Open existing folders and find them again'],
  description: [
    'Hinzufügen, Ordnerauswahl, Abbrechen, Bestätigen und den Unterschied zwischen Katalog und Projektinhalt ausprobieren.',
    'Practice Add, folder selection, Cancel and Confirm, and distinguish the catalog from project contents.',
  ],
  question: ['Wie öffne ich einen vorhandenen Projektordner?', 'How do I open an existing project folder?'],
  keywords: 'repository öffnen open ordner folder hinzufügen add abbrechen cancel',
  steps: [
    s(
      'overview',
      ['Öffnen kopiert das Projekt nicht', 'Opening does not copy a project'],
      [
        'Ein vorhandenes Repository wird an seinem bisherigen Speicherort geöffnet. Der Katalog merkt sich den Pfad. Klonen erstellt dagegen eine neue lokale Kopie; Initialisieren beginnt eine Git-Geschichte in einem bisherigen Nicht-Git-Ordner.',
        'Open uses an existing repository at its current location. The catalog remembers its path. Clone creates a new local copy; Initialize starts Git history in a folder that was not a repository.',
      ],
      undefined,
      { continue: false },
    ),
    s(
      'open-picker',
      ['Starte Hinzufügen', 'Choose Add'],
      [
        'Klicke oben Hinzufügen. Normalerweise öffnet sich die Ordnerauswahl deines Systems. Im Übungsmodus erscheint eine Auswahl mit ausschließlich vorbereiteten Beispielpfaden.',
        'Click Add at the top. Your system folder picker normally opens. Practice shows a picker containing prepared sample paths only.',
      ],
      add,
      { completion: element(picker) },
    ),
    s(
      'picker-explained',
      ['Den richtigen Ordner wählen', 'Choose the correct folder'],
      [
        'Wähle den Projektordner, der die Git-Geschichte enthält, nicht eine einzelne Datei. Der Beispielpfad ist /tutorial/OGC-Lernprojekt. Vor dem Bestätigen kannst du die Auswahl jederzeit abbrechen.',
        'Choose the project folder containing the Git history, not an individual file. The sample path is /tutorial/OGC-Lernprojekt. You can cancel before confirming.',
      ],
      picker,
      { prepare: recipe({}, [add]) },
    ),
    s(
      'cancel',
      ['Probiere Abbrechen aus', 'Try Cancel'],
      [
        'Klicke im Ordnerdialog Abbrechen. Der Katalog und das aktive Repository bleiben unverändert. Abbrechen löscht nichts.',
        'Click Cancel in the picker. The catalog and active repository remain unchanged. Cancel does not delete anything.',
      ],
      picker,
      { prepare: recipe({}, [add]), completion: { kind: 'absent', selector: picker } },
    ),
    s(
      'open-again',
      ['Öffne die Auswahl erneut', 'Open the picker again'],
      ['Klicke erneut Hinzufügen. Diesmal bestätigst du den vorbereiteten Projektordner.', 'Click Add again. This time, confirm the prepared project folder.'],
      add,
      { completion: element(picker) },
    ),
    s(
      'select',
      ['Markiere OGC-Lernprojekt', 'Select OGC-Lernprojekt'],
      [
        'Klicke auf den Beispielpfad. Die Auswahl wird markiert und die Bestätigung freigegeben. In der echten Ordnerauswahl entsprechen Darstellung und Bedienung deinem Betriebssystem.',
        'Click the sample path. It becomes selected and enables confirmation. The real picker uses your operating system’s appearance and controls.',
      ],
      choice,
      { prepare: recipe({}, [add]), completion: element(`${choice}[aria-pressed="true"]`) },
    ),
    s(
      'confirm',
      ['Bestätige den Ordner', 'Confirm the folder'],
      [
        'Klicke Diesen Ordner wählen. Die App erkennt das vorhandene Repository und öffnet seinen Arbeitsbereich. Eine bereits gespeicherte Auswahl erzeugt keinen zweiten Katalogeintrag.',
        'Click Choose this folder. The app recognizes the repository and opens its workspace. Opening a saved path does not create a duplicate catalog entry.',
      ],
      choose,
      { prepare: recipe({}, [add, choice]), action: 'repo-opened' },
    ),
    s(
      'finish',
      ['Den geöffneten Arbeitsbereich erkennen', 'Recognize the opened workspace'],
      [
        'Der Projektname und der Dateiverlauf gehören wieder zum Lernprojekt. Deine Dateien wurden weder kopiert noch initialisiert. Über Lokale Repositories findest du den gespeicherten Pfad beim nächsten Wechsel wieder.',
        'The project name and history belong to the learning project again. Its files were neither copied nor initialized. Local repositories lets you find the saved path when switching later.',
      ],
      '[data-tutorial="primary"]',
      { area: 'repo' },
    ),
  ],
};
export const REPOSITORY_INIT_LESSON: TutorialChapter = {
  id: 'repository-init',
  section: 'localRepos',
  title: ['Neues Repository: README und Lizenzvorlagen', 'New repository: README and license templates'],
  description: [
    'Einen leeren Beispielordner initialisieren, README auswählen und die bedingten Lizenzfelder einzeln ausfüllen.',
    'Initialize an empty sample folder, choose a README and fill in conditional license fields individually.',
  ],
  question: ['Wie initialisiere ich einen Ordner mit README und Lizenz?', 'How do I initialize a folder with a README and license?'],
  keywords: 'init initialisieren neu new readme license lizenz copyright notice programm',
  steps: [
    s(
      'overview',
      ['Initialisieren beginnt ohne Commits', 'Initialization begins without commits'],
      [
        'Ein Ordner ohne Git-Geschichte kann mit git init zum Repository werden. Das legt die Verwaltungsstruktur an, speichert aber noch keinen Commit. In dieser Übung verwenden wir /tutorial/Neues-Projekt und erzeugen nur Beispieldaten.',
        'A folder without Git history can become a repository with git init. This creates Git metadata but no commit. Practice uses /tutorial/Neues-Projekt and creates sample data only.',
      ],
      undefined,
      { continue: false, prepare: recipe({ directory: 'empty' }) },
    ),
    s(
      'open',
      ['Wähle den leeren Beispielordner', 'Choose the empty sample folder'],
      [
        'Klicke Hinzufügen, markiere /tutorial/Neues-Projekt und bestätige die Ordnerauswahl. Weil dort noch kein Repository liegt, zeigt die App anschließend die Initialisierungsoptionen.',
        'Click Add, select /tutorial/Neues-Projekt and confirm the picker. Since it is not a repository yet, the app then shows initialization options.',
      ],
      add,
      { prepare: recipe({ directory: 'empty' }), completion: element(f('createReadme')) },
    ),
    init(
      'options',
      ['Optionen vor dem Anlegen lesen', 'Read the options before creating'],
      [
        'Die README und eine Lizenz sind optional. Die App überschreibt dabei keine vorhandenen Dateien. Erst die untere Bestätigung initialisiert Git. Wir gehen die angebotenen Angaben einzeln durch.',
        'A README and license are optional. Existing files are not overwritten. Only the final confirmation initializes Git. We will go through the available fields one by one.',
      ],
      '[role="dialog"]',
    ),
    init(
      'readme',
      ['Aktiviere die README-Vorlage', 'Enable the README template'],
      [
        'Setze das Häkchen bei README.md. Sie beschreibt das Projekt und bietet einen Einstieg für andere. Die App verwendet ihre gebündelte Vorlage; dieser Schritt erstellt noch keinen Commit.',
        'Check README.md. A README introduces the project to others. The app uses its bundled template; this step does not create a commit.',
      ],
      f('createReadme'),
      0,
      { completion: value(`${f('createReadme')} input`, ['true', 'true']) },
    ),
    init(
      'license',
      ['Probiere die Lizenzvorlage GPL-3.0-only', 'Try the GPL-3.0-only template'],
      [
        'Die Liste enthält gebündelte Vorlagen und Keine Lizenz. Wähle für diese Übung GPL-3.0-only, damit du auch die zusätzlichen Felder kennenlernst. Bei eigenen Projekten richtet sich diese Auswahl nach deren Lizenzvorgaben.',
        'The list contains bundled templates and No license. Choose GPL-3.0-only for this exercise to see the additional fields. In your own projects, follow their licensing requirements.',
      ],
      f('license'),
      1,
      { completion: value(`${f('license')} select`, ['GPL-3.0-only', 'GPL-3.0-only']) },
    ),
    init(
      'holder',
      ['Gib den Beispielnamen ein', 'Enter the sample name'],
      [
        'Trage Alex Beispiel als Urheberrechtsinhaber ein. Welche Angaben erforderlich sind, hängt von der gewählten Vorlage ab. Fehlende Pflichtangaben halten die Bestätigung gesperrt.',
        'Enter Alex Beispiel as Copyright holder. Required fields depend on the selected template. Missing required information keeps confirmation disabled.',
      ],
      f('copyrightHolder'),
      2,
      { completion: value(`${f('copyrightHolder')} input`, ['Alex Beispiel', 'Alex Beispiel']) },
    ),
    init(
      'program',
      ['Passe den Programmnamen an', 'Set the program name'],
      [
        'GNU-Vorlagen verwenden zusätzlich einen Anwendungsnachweis. Ändere den vorgeschlagenen Programmnamen in OGC-Testprogramm. Das benennt nicht den Projektordner um.',
        'GNU templates also use an application notice. Change the suggested Program name to OGC-Testprogramm. This does not rename the project folder.',
      ],
      f('programName'),
      3,
      { completion: value(`${f('programName')} input`, ['OGC-Testprogramm', 'OGC-Testprogramm']) },
    ),
    init(
      'description',
      ['Beschreibe das Beispielprogramm', 'Describe the sample program'],
      [
        'Trage Ein Lernprojekt in Kurze Programmbeschreibung ein. Diese Angabe gehört zum Anwendungshinweis der ausgewählten Vorlage. Andere Lizenzvorlagen können dieses Feld ausblenden.',
        'Enter A learning project in Short program description. This information belongs to the selected template’s application notice. Other templates may hide the field.',
      ],
      f('programDescription'),
      4,
      { completion: value(`${f('programDescription')} input`, ['Ein Lernprojekt', 'A learning project']) },
    ),
    init(
      'review',
      ['Prüfe die Initialisierung', 'Review initialization'],
      [
        'Prüfe den Zielordner, README, Lizenz und die ausgefüllten Angaben. Die App legt Git-Metadaten sowie die fehlenden gewählten Dateien an. Für diese Vorlage kommen LICENSE und NOTICE hinzu. Es wird nichts veröffentlicht.',
        'Review the folder, README, license and entered fields. The app creates Git metadata and the missing selected files. This template adds LICENSE and NOTICE. Nothing is published.',
      ],
      '[role="dialog"]',
      5,
    ),
    init(
      'initialize',
      ['Initialisiere jetzt das Beispielprojekt', 'Initialize the sample project now'],
      [
        'Klicke unten Repository initialisieren. Danach öffnet sich der neue Arbeitsbereich. Die erzeugten Dateien liegen zunächst unversioniert im Arbeitsordner und müssen für einen ersten Commit vorgemerkt werden.',
        'Click Initialize repository below. The new workspace then opens. Generated files start untracked and must be staged before the first commit.',
      ],
      '.dialog-btn-primary',
      5,
      { action: 'repo-initialized' },
    ),
    s(
      'finish',
      ['Neue Dateien sind noch kein Commit', 'New files are not a commit'],
      [
        'Im neuen Projekt siehst du README.md, LICENSE und NOTICE als neue Dateien. Der Verlauf ist noch leer. Die Staging- und Commit-Lektionen zeigen, wie daraus der erste gespeicherte Stand entsteht.',
        'The new project lists README.md, LICENSE and NOTICE as untracked files. History is still empty. The staging and commit lessons show how to create the first saved snapshot.',
      ],
      '[data-tutorial="untracked-files"]',
      { area: 'repo', prepare: recipe({ initialized: true, active: 'new' }) },
    ),
  ],
};
