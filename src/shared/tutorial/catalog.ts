import { TUTORIAL_OVERVIEW } from './catalogOverview';
import { TUTORIAL_SUBMODULES_NAVIGATION } from './catalogSubmodulesNavigation';
import { TUTORIAL_SUBMODULES_INITIALIZE, TUTORIAL_SUBMODULES_UPDATE } from './catalogSubmodulesUpdate';
import { TUTORIAL_SUBMODULES_SYNC } from './catalogSubmodulesSync';
import { TUTORIAL_CHANGES_LESSON } from './catalogChanges';
import { TUTORIAL_STAGING_SCOPE } from './catalogStagingScope';
import { TUTORIAL_STAGING_DISCARD } from './catalogStagingDiscard';
import { TUTORIAL_STAGING_DELETE } from './catalogStagingDelete';
import { TUTORIAL_STAGING_IGNORE } from './catalogStagingIgnore';
import { TUTORIAL_STAGING_IGNORE_FOLDERS } from './catalogStagingIgnoreFolders';
import { TUTORIAL_DIFF_HUNKS } from './catalogDiffHunks';
import { TUTORIAL_DIFF_DISCARD } from './catalogDiffDiscard';
import { TUTORIAL_DIFF_LINES } from './catalogDiffLines';
import { TUTORIAL_FILES_NAVIGATION } from './catalogFilesNavigation';
import { TUTORIAL_FILES_EDIT } from './catalogFilesEdit';
import { TUTORIAL_FILES_DRAFTS } from './catalogFilesDrafts';
import { TUTORIAL_FILES_INDEX } from './catalogFilesIndex';
import { TUTORIAL_FILES_MARKDOWN } from './catalogFilesMarkdown';
import { TUTORIAL_FILES_HTML } from './catalogFilesHtml';
import { TUTORIAL_FILES_CSV } from './catalogFilesCsv';
import { TUTORIAL_EDITOR_ENCODING } from './catalogEditorEncoding';
import { TUTORIAL_EDITOR_LINE_ENDINGS } from './catalogEditorLineEndings';
import { TUTORIAL_EDITOR_LINES } from './catalogEditorLines';
import { TUTORIAL_TEXT_AFFIXES } from './catalogTextAffixes';
import { TUTORIAL_CODECS_DOCUMENT } from './catalogCodecsDocument';
import { TUTORIAL_CODECS_SELECTION } from './catalogCodecsSelection';
import { TUTORIAL_HASHES_FILE } from './catalogHashesFile';
import { TUTORIAL_JSON_FORMAT } from './catalogJsonFormat';
import { TUTORIAL_JSON_PATHS } from './catalogJsonPaths';
import { TUTORIAL_JSON_SCHEMA } from './catalogJsonSchema';
import { TUTORIAL_JSON_YAML } from './catalogJsonYaml';
import { TUTORIAL_YAML_TOOLS } from './catalogYamlTools';
import { TUTORIAL_YAML_JSON } from './catalogYamlJson';
import { TUTORIAL_JSON_ERRORS } from './catalogJsonErrors';
import { TUTORIAL_MARKUP_HTML } from './catalogMarkupHtml';
import { TUTORIAL_MARKUP_XML } from './catalogMarkupXml';
import { TUTORIAL_TREE_CREATE } from './catalogTreeCreate';
import { TUTORIAL_TREE_RENAME } from './catalogTreeRename';
import { TUTORIAL_TREE_COPY } from './catalogTreeCopy';
import { TUTORIAL_TREE_REPLACE } from './catalogTreeReplace';
import { TUTORIAL_TREE_MOVE } from './catalogTreeMove';
import { TUTORIAL_TREE_DELETE } from './catalogTreeDelete';
import { TUTORIAL_SEARCH_NAMES } from './catalogSearchNames';
import { TUTORIAL_SEARCH_CONTENT } from './catalogSearchContent';
import { TUTORIAL_SEARCH_ONE } from './catalogSearchOne';
import { TUTORIAL_SEARCH_ALL } from './catalogSearchAll';
import { TUTORIAL_HISTORY_GRAPH } from './catalogHistoryGraph';
import { TUTORIAL_HISTORY_FILES } from './catalogHistoryFiles';
import { TUTORIAL_HISTORY_BLAME } from './catalogHistoryBlame';
import { TUTORIAL_HISTORY_SOURCES } from './catalogHistorySources';
import { TUTORIAL_HISTORY_SEARCH } from './catalogHistorySearch';
import { TUTORIAL_FORENSIC_STRING } from './catalogForensicString';
import { TUTORIAL_FORENSIC_LINES } from './catalogForensicLines';
import { TUTORIAL_FORENSIC_REGEX } from './catalogForensicRegex';
import { TUTORIAL_BRANCHES } from './catalogBranches';
import { TUTORIAL_BRANCHES_SWITCH } from './catalogBranchesSwitch';
import { TUTORIAL_BRANCHES_MANAGE } from './catalogBranchesManage';
import { TUTORIAL_BRANCHES_UNMERGED } from './catalogBranchesUnmerged';
import { TUTORIAL_BRANCHES_CLEANUP } from './catalogBranchesCleanup';
import { TUTORIAL_BRANCHES_CLEANUP_PROTECTION } from './catalogBranchesCleanupProtection';
import { TUTORIAL_BRANCHES_CLEANUP_UNMERGED } from './catalogBranchesCleanupUnmerged';
import { TUTORIAL_BRANCHES_CARRY_REVIEW } from './catalogBranchesCarryReview';
import { TUTORIAL_BRANCHES_CARRY } from './catalogBranchesCarry';
import { TUTORIAL_BRANCHES_PARK } from './catalogBranchesPark';
import { TUTORIAL_BRANCHES_PARK_RESTORE } from './catalogBranchesParkRestore';
import { TUTORIAL_MERGE_REVIEW } from './catalogMergeReview';
import { TUTORIAL_MERGE_FAST_FORWARD } from './catalogMergeFastForward';
import { TUTORIAL_MERGE_COMMIT } from './catalogMergeCommit';
import { TUTORIAL_MERGE_SQUASH } from './catalogMergeSquash';
import { TUTORIAL_MERGE_OUTWARD } from './catalogMergeOutward';
import { TUTORIAL_MERGE_DIVERGED } from './catalogMergeDiverged';
import { TUTORIAL_MERGE_GUARD } from './catalogMergeGuard';
import { TUTORIAL_MERGE_SQUASH_DIVERGED } from './catalogMergeSquashDiverged';
import { TUTORIAL_TAGS_NAVIGATION } from './catalogTagsNavigation';
import { TUTORIAL_TAGS_LIGHTWEIGHT, TUTORIAL_TAGS_ANNOTATED } from './catalogTagsCreate';
import { TUTORIAL_TAGS_DELETE } from './catalogTagsDelete';
import { TUTORIAL_STASH_FILE } from './catalogStashFile';
import { TUTORIAL_STASH_ALL } from './catalogStashAll';
import { TUTORIAL_STASH_FILES } from './catalogStashFiles';
import { TUTORIAL_STASH_BRANCH } from './catalogStashBranch';
import { TUTORIAL_CONFLICTS } from './catalogConflicts';
import { TUTORIAL_CONFLICT_CHOICES } from './catalogConflictChoices';
import { TUTORIAL_CONFLICT_MANUAL } from './catalogConflictManual';
import { TUTORIAL_CONFLICT_ABORT } from './catalogConflictAbort';
import { TUTORIAL_CONFLICT_MULTIPLE } from './catalogConflictMultiple';
import { TUTORIAL_CONFLICT_DELETION } from './catalogConflictDeletion';
import { TUTORIAL_COMMIT_LESSON } from './catalogCommit';
import { TUTORIAL_AMEND_MESSAGE, TUTORIAL_AMEND_FILES } from './catalogAmend';
import { TUTORIAL_REWORD } from './catalogReword';
import { TUTORIAL_REWORD_PROTECTED, TUTORIAL_REWORD_REFERENCED } from './catalogRewordProtection';
import { REPOSITORY_CATALOG_LESSON } from './catalogRepositoryCatalog';
import { REPOSITORY_OPEN_LESSON, REPOSITORY_INIT_LESSON } from './catalogRepositoryCreate';
import { REPOSITORY_CLONE_LESSON } from './catalogRepositoryClone';
import { REPOSITORY_MANAGE_LESSON } from './catalogRepositoryManage';
import { REPOSITORY_APPEARANCE_LESSON } from './catalogRepositoryAppearance';
import { REPOSITORY_SHORTCUTS_LESSON } from './catalogRepositoryShortcuts';
import type { TutorialChapter, TutorialLaunchRequest } from './types';
import { TUTORIAL_RECOVERY } from './catalogRecovery';
import { TUTORIAL_RECOVERY_MESSAGE } from './catalogRecoveryMessage';
import { TUTORIAL_RECOVERY_INSPECT } from './catalogRecoveryInspect';
import { TUTORIAL_RECOVERY_RESET } from './catalogRecoveryReset';
import { TUTORIAL_CHERRY_PICK } from './catalogCherryPick';
import { TUTORIAL_CHERRY_PICK_CONFLICT } from './catalogCherryPickConflict';
import { TUTORIAL_CHERRY_PICK_ABORT } from './catalogCherryPickAbort';
import { TUTORIAL_REVERT } from './catalogRevert';
import { TUTORIAL_RESET_SOFT, TUTORIAL_RESET_MIXED, TUTORIAL_RESET_HARD } from './catalogResetModes';
import { TUTORIAL_MERGE_REVERT } from './catalogMergeRevert';
import { TUTORIAL_REBASE_LESSONS } from './catalogInteractiveRebase';
import { TUTORIAL_REBASE_PAUSES } from './catalogRebasePauses';
import { TUTORIAL_REBASE_GUARDS } from './catalogRebaseGuards';
import { TUTORIAL_TOPIC_CHAPTERS } from './catalogTopics';

export const TUTORIAL_CHAPTERS: readonly TutorialChapter[] = [
  TUTORIAL_OVERVIEW,
  TUTORIAL_CHANGES_LESSON,
  TUTORIAL_COMMIT_LESSON,
  TUTORIAL_AMEND_MESSAGE,
  TUTORIAL_AMEND_FILES,
  TUTORIAL_REWORD,
  TUTORIAL_REWORD_PROTECTED,
  TUTORIAL_REWORD_REFERENCED,
  ...TUTORIAL_REBASE_LESSONS,
  ...TUTORIAL_REBASE_PAUSES,
  ...TUTORIAL_REBASE_GUARDS,
  TUTORIAL_STAGING_SCOPE,
  TUTORIAL_STAGING_DISCARD,
  TUTORIAL_STAGING_DELETE,
  TUTORIAL_STAGING_IGNORE,
  TUTORIAL_STAGING_IGNORE_FOLDERS,
  TUTORIAL_DIFF_HUNKS,
  TUTORIAL_DIFF_DISCARD,
  TUTORIAL_DIFF_LINES,
  TUTORIAL_FILES_NAVIGATION,
  TUTORIAL_FILES_EDIT,
  TUTORIAL_FILES_DRAFTS,
  TUTORIAL_FILES_INDEX,
  TUTORIAL_TREE_CREATE,
  TUTORIAL_TREE_RENAME,
  TUTORIAL_TREE_COPY,
  TUTORIAL_TREE_REPLACE,
  TUTORIAL_TREE_MOVE,
  TUTORIAL_TREE_DELETE,
  TUTORIAL_SEARCH_NAMES,
  TUTORIAL_SEARCH_CONTENT,
  TUTORIAL_SEARCH_ONE,
  TUTORIAL_SEARCH_ALL,
  TUTORIAL_FILES_MARKDOWN,
  TUTORIAL_FILES_HTML,
  TUTORIAL_FILES_CSV,
  TUTORIAL_EDITOR_ENCODING,
  TUTORIAL_EDITOR_LINE_ENDINGS,
  TUTORIAL_EDITOR_LINES,
  TUTORIAL_TEXT_AFFIXES,
  TUTORIAL_CODECS_DOCUMENT,
  TUTORIAL_CODECS_SELECTION,
  TUTORIAL_HASHES_FILE,
  TUTORIAL_JSON_FORMAT,
  TUTORIAL_JSON_PATHS,
  TUTORIAL_JSON_SCHEMA,
  TUTORIAL_JSON_YAML,
  TUTORIAL_YAML_TOOLS,
  TUTORIAL_YAML_JSON,
  TUTORIAL_JSON_ERRORS,
  TUTORIAL_MARKUP_HTML,
  TUTORIAL_MARKUP_XML,
  REPOSITORY_CATALOG_LESSON,
  REPOSITORY_OPEN_LESSON,
  REPOSITORY_INIT_LESSON,
  REPOSITORY_CLONE_LESSON,
  REPOSITORY_MANAGE_LESSON,
  REPOSITORY_APPEARANCE_LESSON,
  REPOSITORY_SHORTCUTS_LESSON,
  TUTORIAL_HISTORY_GRAPH,
  TUTORIAL_HISTORY_FILES,
  TUTORIAL_HISTORY_BLAME,
  TUTORIAL_HISTORY_SOURCES,
  TUTORIAL_HISTORY_SEARCH,
  TUTORIAL_FORENSIC_STRING,
  TUTORIAL_FORENSIC_LINES,
  TUTORIAL_FORENSIC_REGEX,
  TUTORIAL_BRANCHES,
  TUTORIAL_BRANCHES_SWITCH,
  TUTORIAL_BRANCHES_MANAGE,
  TUTORIAL_BRANCHES_UNMERGED,
  TUTORIAL_BRANCHES_CLEANUP,
  TUTORIAL_BRANCHES_CLEANUP_PROTECTION,
  TUTORIAL_BRANCHES_CLEANUP_UNMERGED,
  TUTORIAL_BRANCHES_CARRY_REVIEW,
  TUTORIAL_BRANCHES_CARRY,
  TUTORIAL_BRANCHES_PARK,
  TUTORIAL_BRANCHES_PARK_RESTORE,
  TUTORIAL_MERGE_REVIEW,
  TUTORIAL_MERGE_FAST_FORWARD,
  TUTORIAL_MERGE_COMMIT,
  TUTORIAL_MERGE_SQUASH,
  TUTORIAL_MERGE_OUTWARD,
  TUTORIAL_MERGE_DIVERGED,
  TUTORIAL_MERGE_GUARD,
  TUTORIAL_MERGE_SQUASH_DIVERGED,
  TUTORIAL_CHERRY_PICK,
  TUTORIAL_CHERRY_PICK_CONFLICT,
  TUTORIAL_CHERRY_PICK_ABORT,
  TUTORIAL_REVERT,
  TUTORIAL_MERGE_REVERT,
  TUTORIAL_RESET_SOFT,
  TUTORIAL_RESET_MIXED,
  TUTORIAL_RESET_HARD,
  TUTORIAL_TAGS_NAVIGATION,
  TUTORIAL_TAGS_LIGHTWEIGHT,
  TUTORIAL_TAGS_ANNOTATED,
  TUTORIAL_TAGS_DELETE,
  TUTORIAL_SUBMODULES_NAVIGATION,
  TUTORIAL_SUBMODULES_INITIALIZE,
  TUTORIAL_SUBMODULES_UPDATE,
  TUTORIAL_SUBMODULES_SYNC,
  TUTORIAL_STASH_FILE,
  TUTORIAL_STASH_ALL,
  TUTORIAL_STASH_FILES,
  TUTORIAL_STASH_BRANCH,
  TUTORIAL_CONFLICTS,
  TUTORIAL_CONFLICT_CHOICES,
  TUTORIAL_CONFLICT_MANUAL,
  TUTORIAL_CONFLICT_ABORT,
  TUTORIAL_CONFLICT_MULTIPLE,
  TUTORIAL_CONFLICT_DELETION,
  TUTORIAL_RECOVERY,
  TUTORIAL_RECOVERY_MESSAGE,
  TUTORIAL_RECOVERY_INSPECT,
  TUTORIAL_RECOVERY_RESET,
  ...TUTORIAL_TOPIC_CHAPTERS,
];

export function resolveTutorialRequest(input: unknown): TutorialLaunchRequest {
  if (!input || typeof input !== 'object') throw new Error('Invalid tutorial request.');
  const { chapterId, stepId } = input as TutorialLaunchRequest;
  const chapter = TUTORIAL_CHAPTERS.find((item) => item.id === chapterId);
  if (!chapter || (stepId !== undefined && !chapter.steps.some((item) => item.id === stepId))) throw new Error('Unknown tutorial chapter or step.');
  return { chapterId, ...(stepId === undefined ? {} : { stepId }) };
}
