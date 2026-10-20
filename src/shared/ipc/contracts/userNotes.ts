import type { UserNoteDto, UserNoteIdentity, UserNotesStatusDto } from '../../userNotes';
import type { IpcResult } from '../../../types/ipc';

export interface ElectronUserNotesAPI {
  getUserNotesStatus: () => Promise<UserNotesStatusDto>;
  getUserNote: (identity: UserNoteIdentity) => Promise<IpcResult<UserNoteDto>>;
  checkUserNotes: () => Promise<{ success: boolean; error?: string }>;
  acknowledgeUserNotes: (identities: UserNoteIdentity[]) => Promise<{ success: boolean; error?: string }>;
  onUserNotesChanged: (callback: (status: UserNotesStatusDto) => void) => () => void;
}
