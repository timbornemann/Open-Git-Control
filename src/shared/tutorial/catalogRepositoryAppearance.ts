import type { TutorialChapter } from './types';
import { repoStep as s, repoRow, repoControl as c, repoMenu, recipe, lessonElement as element } from './repositoryLessonHelpers';
const dialog = '.repository-icon-dialog';
const candidate = '.repository-icon-candidate[title="assets/ogc.svg"]';
const control = (name: string) => c(`icon-${name}`);
const logoRecipe = (...click: string[]) => recipe({}, [repoMenu, c('action-icon'), ...click]);
export const REPOSITORY_APPEARANCE_LESSON: TutorialChapter = {
  id: 'repository-appearance',
  section: 'localRepos',
  title: ['Repository-Logo: Buchstaben und Projektbilder', 'Repository logo: initials and project images'],
  description: [
    'Die drei Anzeigemodi, Bildkandidaten, Dateiauswahl, erneute Suche und Speichern ausprobieren.',
    'Try the three display modes, image candidates, file selection, rescan and saving.',
  ],
  question: ['Wie ändere ich das Logo eines Repositories?', 'How do I change a repository logo?'],
  keywords: 'logo icon bild image initials buchstaben automatisch auto manuell manual rescan',
  steps: [
    s(
      'overview',
      ['Projekte am Logo unterscheiden', 'Distinguish projects by their logo'],
      [
        'Die App kann für ein Repository Buchstaben oder ein Bild aus seinem Projektordner anzeigen. Das Logo ist eine Anzeigeeinstellung der App. Wir ändern hier ausschließlich den Eintrag des Lernprojekts.',
        'The app can show initials or an image from a repository’s project folder. The logo is an app display preference. Practice changes the learning project’s entry only.',
      ],
      repoRow(),
      { continue: false },
    ),
    s(
      'open',
      ['Öffne Repository-Logo', 'Open Repository logo'],
      [
        'Öffne das Drei-Punkte-Menü des Lernprojekts und klicke Repository-Logo. Der Dialog zeigt die Anzeigemodi und passende Bilddateien.',
        'Open the learning project’s three-dot menu and click Repository logo. The dialog shows display modes and matching image files.',
      ],
      repoMenu,
      { completion: element(dialog) },
    ),
    s(
      'modes',
      ['Drei Arten der Anzeige', 'Three display modes'],
      [
        'Automatisch auswählen sucht ein geeignetes Projektbild. Bilddatei auswählen hält eine bestimmte Datei fest. Buchstaben verwenden zeigt die Initialen. Die Auswahl wird erst mit Speichern übernommen.',
        'Choose automatically finds a suitable project image. Choose image uses a specific file. Use initials shows letters. The selection is applied only when saved.',
      ],
      '.repository-icon-modes',
      { prepare: logoRecipe() },
    ),
    s(
      'cancel',
      ['Schließe ohne Speichern', 'Close without saving'],
      [
        'Klicke unten Abbrechen. Der Dialog schließt, ohne die Anzeigeeinstellung zu übernehmen. Wir öffnen ihn danach erneut und probieren die Modi einzeln aus.',
        'Click Cancel at the bottom. The dialog closes without applying a display preference. Next we reopen it and try each mode.',
      ],
      `${dialog} footer button:first-child`,
      { prepare: logoRecipe(), completion: { kind: 'absent', selector: dialog } },
    ),
    s(
      'reopen',
      ['Öffne die Logoauswahl erneut', 'Reopen logo selection'],
      [
        'Öffne erneut das Drei-Punkte-Menü und Repository-Logo. Deine abgebrochene Auswahl hat keinen gespeicherten Zustand verändert.',
        'Open the three-dot menu and Repository logo again. Canceling did not change the saved state.',
      ],
      repoMenu,
      { completion: element(dialog) },
    ),
    s(
      'auto',
      ['Wähle den automatischen Modus', 'Choose automatic mode'],
      [
        'Wähle Automatisch auswählen. Die App sucht geeignete Bilder innerhalb des Repositorys. Falls keines passt, kann sie Buchstaben anzeigen. Neue Suche aktualisiert die angebotenen Kandidaten.',
        'Select Choose automatically. The app searches for suitable images inside the repository. If none fits, it can show initials. Search again refreshes the candidates.',
      ],
      control('auto'),
      { prepare: logoRecipe(), completion: element(`${control('auto')} input:checked`) },
    ),
    s(
      'initials',
      ['Wechsle zu Buchstaben', 'Switch to initials'],
      [
        'Wähle Buchstaben verwenden. Damit wird kein Projektbild als Logo genutzt. Die Bildkandidaten verschwinden dadurch nicht aus deinem Repository.',
        'Select Use initials. This stops using a project image as the logo. Image candidates are not removed from the repository.',
      ],
      control('initials'),
      { prepare: logoRecipe(`${control('auto')} input`), completion: element(`${control('initials')} input:checked`) },
    ),
    s(
      'candidate',
      ['Wähle das vorbereitete Projektbild', 'Choose the prepared project image'],
      [
        'Klicke auf assets/ogc.svg in den Bildkandidaten. Die Datei wird markiert und Bilddatei auswählen aktiviert. Die Bildvorschau stammt hier aus gebündelten Beispieldaten.',
        'Click assets/ogc.svg among the candidates. It becomes selected and activates Choose image. The preview here comes from bundled sample data.',
      ],
      candidate,
      { prepare: logoRecipe(), completion: element(`${candidate}.is-selected`) },
    ),
    s(
      'selected',
      ['Die Auswahl kontrollieren', 'Check the selection'],
      [
        'Der Rahmen kennzeichnet die gewählte Datei. Die App verwendet ihren relativen Pfad innerhalb des Repositorys. Prüfe Bild und Modus, bevor du speicherst; die Projektdatei selbst wird dadurch nicht bearbeitet.',
        'The outline marks the selected file. The app uses its relative path inside the repository. Check the image and mode before saving; the project file itself is not edited.',
      ],
      candidate,
      { prepare: logoRecipe(candidate) },
    ),
    s(
      'browse',
      ['Probiere die alternative Dateiauswahl', 'Try selecting another file'],
      [
        'Klicke Andere Bilddatei im Repository auswählen. Normalerweise kannst du damit eine andere geeignete Projektdatei wählen. Die Übung liefert ausschließlich das vorbereitete Bild und öffnet keinen persönlichen Ordner.',
        'Click Choose another image in the repository. Normally this selects another suitable project file. Practice returns only the prepared image and never opens a personal folder.',
      ],
      control('browse'),
      { prepare: logoRecipe(candidate), action: 'repo-icon-browsed' },
    ),
    s(
      'rescan',
      ['Aktualisiere die Kandidaten', 'Refresh the candidates'],
      [
        'Klicke Neu suchen. Das aktualisiert die Suche nach Projektbildern. In der Übung bleibt der feste Kandidat assets/ogc.svg verfügbar. Die ausgewählte Datei muss weiterhin mit Speichern bestätigt werden.',
        'Click Search again. This refreshes the search for project images. In practice, the fixed candidate assets/ogc.svg remains available. You still need to save the selection.',
      ],
      control('rescan'),
      { prepare: logoRecipe(candidate), action: 'repo-icon-scanned' },
    ),
    s(
      'save',
      ['Speichere das Beispiellogo', 'Save the sample logo'],
      [
        'Kontrolliere Bilddatei auswählen und das markierte OGC-Bild. Klicke Speichern. Der Dialog schließt und die Anzeige der Repository-Zeile wird aktualisiert.',
        'Check Choose image and the selected OGC image. Click Save. The dialog closes and the repository row updates.',
      ],
      control('save'),
      { prepare: logoRecipe(candidate), action: 'repo-icon-saved' },
    ),
    s(
      'finish',
      ['Die neue Anzeige im Katalog', 'The new catalog display'],
      [
        'Das Lernprojekt verwendet jetzt das Beispielbild. Du kannst später jederzeit zu Automatisch oder Buchstaben zurückkehren. Dieser Durchlauf hat weder Projektdateien noch die Einstellungen deines normalen Arbeitsbereichs verändert.',
        'The learning project now uses the sample image. You can return to automatic selection or initials later. This session changed neither project files nor settings in your normal workspace.',
      ],
      repoRow(),
      { prepare: recipe({ iconMode: 'manual' }) },
    ),
  ],
};
