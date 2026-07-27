import { spawnSync } from 'child_process';
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { GitService } from '../../../GitService';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { IpcChannel } from '../../../../src/types/ipcContract';

type WorkingDirectoryPathResolver = (repoPath: string, value: unknown, label: string, allowMissing?: boolean) => string;

type RegisterWorkingDirectoryFileCreationHandlerDeps = {
  gitService: GitService;
  workingDirectoryPath: WorkingDirectoryPathResolver;
};

const asRepositoryFilePath = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));

const createWindowsEntryWithExplicitAccess = (targetPath: string, kind: 'file' | 'folder'): void => {
  const encodedTargetPath = Buffer.from(targetPath, 'utf16le').toString('base64');
  const encodedScript = Buffer.from(
    `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$targetPath = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedTargetPath}'))

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class WorkingDirectoryEntryCreator
{
    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes
    {
        public int Length;
        public IntPtr SecurityDescriptor;
        public int InheritHandle;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateDirectoryW(string path, ref SecurityAttributes securityAttributes);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(
        string path,
        uint desiredAccess,
        uint shareMode,
        ref SecurityAttributes securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile);

    private static SecurityAttributes CreateSecurityAttributes(IntPtr securityDescriptor)
    {
        return new SecurityAttributes
        {
            Length = Marshal.SizeOf(typeof(SecurityAttributes)),
            SecurityDescriptor = securityDescriptor,
            InheritHandle = 0
        };
    }

    private static void ThrowCreateError(int error)
    {
        if (error == 80 || error == 183)
            throw new IOException("EEXIST: The file or directory already exists.");
        throw new Win32Exception(error);
    }

    public static void CreateDirectory(string path, byte[] descriptor)
    {
        var pinnedDescriptor = GCHandle.Alloc(descriptor, GCHandleType.Pinned);
        try
        {
            var securityAttributes = CreateSecurityAttributes(pinnedDescriptor.AddrOfPinnedObject());
            if (!CreateDirectoryW(path, ref securityAttributes))
                ThrowCreateError(Marshal.GetLastWin32Error());
        }
        finally
        {
            pinnedDescriptor.Free();
        }
    }

    public static void CreateFile(string path, byte[] descriptor)
    {
        var pinnedDescriptor = GCHandle.Alloc(descriptor, GCHandleType.Pinned);
        try
        {
            var securityAttributes = CreateSecurityAttributes(pinnedDescriptor.AddrOfPinnedObject());
            var fileHandle = CreateFileW(path, 0x40000000, 0, ref securityAttributes, 1, 0x80, IntPtr.Zero);
            var error = Marshal.GetLastWin32Error();
            if (fileHandle.IsInvalid)
            {
                fileHandle.Dispose();
                ThrowCreateError(error);
            }
            fileHandle.Dispose();
        }
        finally
        {
            pinnedDescriptor.Free();
        }
    }
}
'@

try {
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $system = [System.Security.Principal.SecurityIdentifier]::new([System.Security.Principal.WellKnownSidType]::LocalSystemSid, $null)
    $administrators = [System.Security.Principal.SecurityIdentifier]::new([System.Security.Principal.WellKnownSidType]::BuiltinAdministratorsSid, $null)
    $allow = [System.Security.AccessControl.AccessControlType]::Allow

    if ('${kind}' -eq 'folder') {
        $security = [System.Security.AccessControl.DirectorySecurity]::new()
        $security.SetAccessRuleProtection($true, $false)
        $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
        [void]$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($currentUser, [System.Security.AccessControl.FileSystemRights]::Modify, $inheritance, [System.Security.AccessControl.PropagationFlags]::None, $allow))
        [void]$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($system, [System.Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [System.Security.AccessControl.PropagationFlags]::None, $allow))
        [void]$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($administrators, [System.Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [System.Security.AccessControl.PropagationFlags]::None, $allow))
        [WorkingDirectoryEntryCreator]::CreateDirectory($targetPath, $security.GetSecurityDescriptorBinaryForm())
    } else {
        $security = [System.Security.AccessControl.FileSecurity]::new()
        $security.SetAccessRuleProtection($true, $false)
        [void]$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($currentUser, [System.Security.AccessControl.FileSystemRights]::Modify, $allow))
        [void]$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($system, [System.Security.AccessControl.FileSystemRights]::FullControl, $allow))
        [void]$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($administrators, [System.Security.AccessControl.FileSystemRights]::FullControl, $allow))
        [WorkingDirectoryEntryCreator]::CreateFile($targetPath, $security.GetSecurityDescriptorBinaryForm())
    }
} catch {
    $exception = $_.Exception
    while ($exception.InnerException) { $exception = $exception.InnerException }
    [Console]::Error.WriteLine($exception.Message)
    exit 1
}
`,
    'utf16le',
  ).toString('base64');
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(stderr || 'Could not create the working-directory entry.');
  }
};

export const assertWorkingDirectoryEntryAccess = (targetPath: string): void => {
  fs.accessSync(targetPath, fs.constants.R_OK | fs.constants.W_OK);
};

export const assertWindowsWorkingDirectoryAccess = (targetPath: string): void => {
  if (process.platform === 'win32') assertWorkingDirectoryEntryAccess(targetPath);
};

export const createWorkingDirectoryEntrySafely = (targetPath: string, kind: 'file' | 'folder'): void => {
  if (process.platform === 'win32') createWindowsEntryWithExplicitAccess(targetPath, kind);
  else if (kind === 'file') fs.writeFileSync(targetPath, '', { encoding: 'utf8', flag: 'wx' });
  else fs.mkdirSync(targetPath);
  try {
    assertWorkingDirectoryEntryAccess(targetPath);
  } catch (permissionError: unknown) {
    try {
      if (kind === 'file') fs.unlinkSync(targetPath);
      else fs.rmdirSync(targetPath);
    } catch {
      // Keep the original permission error; the recovery cleanup is best-effort.
    }
    throw permissionError;
  }
};

export function registerWorkingDirectoryFileCreationHandler({ gitService, workingDirectoryPath }: RegisterWorkingDirectoryFileCreationHandlerDeps): void {
  const createEntry = (kind: 'file' | 'folder') => async (_event: unknown, entryPath: unknown, requestedRepoPath?: unknown) => {
    try {
      const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath());
      const relativePath = asRepositoryFilePath(entryPath);
      const targetPath = workingDirectoryPath(repoPath, relativePath, kind === 'file' ? 'File path' : 'Folder path', true);
      if (!fs.statSync(path.dirname(targetPath)).isDirectory()) throw new Error('Target folder does not exist.');

      // Windows parent ACLs may not propagate usable access to new children.
      // Create with an explicit descriptor there so no inaccessible entry
      // exists even briefly. The native APIs retain exclusive creation.
      createWorkingDirectoryEntrySafely(targetPath, kind);
      return { success: true, targetPath: relativePath };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  ipcMain.handle(IpcChannel.GitCreateWorkingDirectoryFile, createEntry('file'));
  ipcMain.handle(IpcChannel.GitCreateWorkingDirectoryFolder, createEntry('folder'));
}
