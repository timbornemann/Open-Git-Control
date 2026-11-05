import type { TutorialChapter, TutorialStep } from './types';
import { repoStep as s, repoControl as c, dialogField as f, recipe, lessonValue as value, lessonElement as element } from './repositoryLessonHelpers';

const url = 'https://git.example.invalid/lernen/OGC-Kopie.git';
const picker = '.tutorial-directory-picker';
const choice = `${picker} .tutorial-directory-choice`;
const confirm = `${picker} .dialog-btn-primary`;
const progress = '.git-transfer-modal';
const cloneRecipe = (stage = 0): TutorialStep['prepare'] => ({
  ...recipe(
    {},
    [c('clone')],
    stage > 0
      ? [
          { selector: `${f('cloneSource')} input`, value: [url, url] },
          ...(stage > 1 ? [{ selector: `${f('targetName')} input`, value: ['OGC-Kopie', 'OGC-Kopie'] as const }] : []),
        ]
      : [],
  ),
  ...(stage > 2 ? { submit: '.dialog-btn-primary', ready: picker } : {}),
  ...(stage > 3 ? { after: [choice, confirm], ready: progress } : {}),
});
export const REPOSITORY_CLONE_LESSON: TutorialChapter = {
  id: 'repository-clone',
  section: 'localRepos',
  title: ['Klonen: Quelle, Zielordner und Fortschritt', 'Clone: source, destination and progress'],
  description: ['Den Klon-Dialog Feld für Feld bedienen und eine simulierte Kopie öffnen.', 'Use each clone-dialog field and open a simulated copy.'],
  question: ['Wie klone ich ein Repository?', 'How do I clone a repository?'],
  keywords: 'clone klonen url ssh https konto account zielordner destination fortschritt progress',
  steps: [
    s(
      'overview',
      ['Eine lokale Kopie anlegen', 'Create a local copy'],
      [
        'Klonen übernimmt die Geschichte eines entfernten Repositories in einen neuen lokalen Ordner. Spätere Änderungen gehen erst durch einen Push zurück zum Hosting. Die Übung simuliert diesen Ablauf vollständig offline.',
        'Cloning copies a remote repository’s history into a new local folder. Later changes reach hosting only through a push. Practice simulates the entire flow offline.',
      ],
      undefined,
      { continue: false },
    ),
    s(
      'open',
      ['Öffne Klonen', 'Open Clone'],
      [
        'Klicke Klonen in der Werkzeugleiste. Hier gibst du zuerst die Quelle an; der lokale übergeordnete Zielordner folgt später.',
        'Click Clone in the toolbar. First you enter the source; you choose the local parent folder later.',
      ],
      c('clone'),
      { completion: element(f('cloneSource')) },
    ),
    s(
      'source-explained',
      ['Die Quelle ist eine Git-Adresse', 'The source is a Git address'],
      [
        'Das erste Feld erwartet eine HTTPS- oder SSH-Adresse, keine lokale Dateisuche. Die Übungsadresse steht im nächsten Schritt. Ihre Domain ist ein reserviertes Beispiel; es wird keine Verbindung aufgebaut.',
        'The first field expects an HTTPS or SSH address, not a local file search. The next step provides the practice address. Its domain is a reserved example; no connection is made.',
      ],
      f('cloneSource'),
      { prepare: cloneRecipe() },
    ),
    s(
      'source',
      ['Trage die Beispieladresse ein', 'Enter the sample address'],
      [
        `Trage genau ${url} ein. Die Eingabeprüfung erkennt die Form einer Git-Adresse. Eine passende Form bestätigt noch keine Erreichbarkeit oder Berechtigung.`,
        `Enter exactly ${url}. Validation recognizes the shape of a Git address. A valid shape does not yet confirm availability or access.`,
      ],
      f('cloneSource'),
      { prepare: cloneRecipe(), completion: value(`${f('cloneSource')} input`, [url, url]) },
    ),
    s(
      'account',
      ['Konto und Systemzugang unterscheiden', 'Distinguish account and system access'],
      [
        'Die Kontoauswahl kann ein verbundenes Hosting-Konto verwenden. Ohne Konto nutzt der normale Betrieb SSH beziehungsweise die Git-Zugangsdaten des Systems. Lass die Vorgabe für diese Übung unverändert. Es werden keine echten Zugangsdaten gelesen.',
        'The account selector can use a connected hosting account. Without one, normal operation uses SSH or system Git credentials. Leave the default for this exercise. No real credentials are read.',
      ],
      f('connectionId'),
      { prepare: cloneRecipe(1) },
    ),
    s(
      'name',
      ['Benenne den Zielordner', 'Name the destination folder'],
      [
        'Der optionale Ordnername wird normalerweise aus der Quelle abgeleitet. Trage hier OGC-Kopie ein. Der Name bezeichnet den neuen lokalen Ordner und benennt das entfernte Repository nicht um.',
        'The optional folder name normally comes from the source. Enter OGC-Kopie here. This names the new local folder and does not rename the remote repository.',
      ],
      f('targetName'),
      { prepare: cloneRecipe(1), completion: value(`${f('targetName')} input`, ['OGC-Kopie', 'OGC-Kopie']) },
    ),
    s(
      'destination',
      ['Bestätige die Angaben', 'Confirm the details'],
      [
        'Prüfe Quelle und Ordnername und bestätige den Dialog. Danach wählst du den übergeordneten Ordner, in dem OGC-Kopie liegen soll. Noch nicht den späteren Projektordner selbst auswählen.',
        'Review the source and folder name and confirm the dialog. Next you choose the parent folder that will contain OGC-Kopie. Do not select the future project folder itself.',
      ],
      '.dialog-btn-primary',
      { prepare: cloneRecipe(2), completion: element(picker) },
    ),
    s(
      'choose-parent',
      ['Markiere den Beispielordner /tutorial', 'Select the sample parent /tutorial'],
      [
        'Wähle /tutorial aus. Zusammen mit dem Ordnernamen entsteht /tutorial/OGC-Kopie. Ein Abbruch an dieser Stelle führt zur App zurück, ohne eine Kopie anzulegen.',
        'Select /tutorial. With the folder name this becomes /tutorial/OGC-Kopie. Canceling here returns to the app without creating a copy.',
      ],
      choice,
      { prepare: cloneRecipe(3), completion: element(`${choice}[aria-pressed="true"]`) },
    ),
    s(
      'clone',
      ['Starte die simulierte Kopie', 'Start the simulated copy'],
      [
        'Bestätige den gewählten Ordner. Die App zeigt den Übertragungsfortschritt und öffnet nach Erfolg das geklonte Repository. Die Übung erzeugt nur Daten im Speicher.',
        'Confirm the chosen folder. The app shows transfer progress and opens the cloned repository on success. Practice creates in-memory data only.',
      ],
      confirm,
      { prepare: { ...cloneRecipe(3), after: [choice], ready: `${choice}[aria-pressed="true"]` }, action: 'repo-cloned' },
    ),
    s(
      'progress',
      ['Die Ausgabe lesen', 'Read the output'],
      [
        'Der Fortschrittsdialog zeigt die einzelnen Übertragungsschritte und den Abschluss. In einem echten Lauf helfen Fehlermeldungen etwa bei einer falschen Adresse oder fehlenden Berechtigung. Hier siehst du die fest vorbereitete Beispielausgabe.',
        'The progress dialog shows transfer steps and completion. In a real run, errors can reveal a wrong address or missing access. Here the output is a fixed sample.',
      ],
      progress,
      { prepare: cloneRecipe(4) },
    ),
    s(
      'close',
      ['Schließe den Fortschrittsdialog', 'Close the progress dialog'],
      [
        'Klicke unten im abgeschlossenen Dialog auf Schließen. Das bereits geöffnete Repository bleibt im Arbeitsbereich und ist im Katalog gespeichert.',
        'Click Close at the bottom of the completed dialog. The opened repository stays in the workspace and remains saved in the catalog.',
      ],
      '.git-transfer-close-button',
      { prepare: cloneRecipe(4), completion: { kind: 'absent', selector: progress } },
    ),
    s(
      'finish',
      ['Kopie und Ursprung erkennen', 'Recognize the copy and its origin'],
      [
        'Der Arbeitsbereich zeigt OGC-Kopie mit einer Beispielgeschichte. Über Lokale Repositories kannst du zwischen Kopie und Lernprojekt wechseln. Spätere Lektionen erklären Fetch, Pull und Push einzeln.',
        'The workspace shows OGC-Kopie with a sample history. Local repositories lets you switch between the copy and learning project. Later lessons explain Fetch, Pull and Push individually.',
      ],
      '[data-tutorial="primary"]',
      { area: 'repo', prepare: recipe({ cloned: true, active: 'clone' }) },
    ),
  ],
};
