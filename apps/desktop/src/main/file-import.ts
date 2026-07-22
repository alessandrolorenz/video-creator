import type { BrowserWindow, OpenDialogOptions } from 'electron';
import { open, realpath, stat } from 'node:fs/promises';
import { basename } from 'node:path';

export interface PrivilegedSelectedFileV1 {
  readonly absolutePath: string;
  readonly displayName: string;
  readonly byteSize: number;
}

export type FileImportErrorCodeV1 = 'FILE_UNAVAILABLE' | 'FILE_NOT_REGULAR' | 'MEDIA_EMPTY';

export type FileSelectionResultV1 =
  | { readonly status: 'selected'; readonly file: PrivilegedSelectedFileV1 }
  | { readonly status: 'cancelled'; readonly reason: 'DIALOG_CANCELLED' }
  | {
      readonly status: 'failed';
      readonly error: { readonly code: FileImportErrorCodeV1; readonly message: string };
    };

export interface FileDialogOptionsV1 {
  readonly properties: readonly ['openFile'];
  readonly filters: readonly {
    readonly name: string;
    readonly extensions: readonly string[];
  }[];
}

export interface FileImportDependencies {
  readonly dialog: {
    showOpenDialog(
      parentWindow: unknown,
      options: FileDialogOptionsV1,
    ): Promise<{ readonly canceled: boolean; readonly filePaths: readonly string[] }>;
  };
  readonly fileSystem: {
    realpath(path: string): Promise<string>;
    stat(path: string): Promise<{ readonly isFile: boolean; readonly byteSize: number }>;
    verifyReadable(path: string): Promise<void>;
  };
}

const MEDIA_DIALOG_OPTIONS: FileDialogOptionsV1 = Object.freeze({
  properties: Object.freeze(['openFile'] as const),
  filters: Object.freeze([
    Object.freeze({ name: 'Video', extensions: Object.freeze(['mp4', 'mov', 'm4v']) }),
  ]),
});

const TRANSCRIPT_DIALOG_OPTIONS: FileDialogOptionsV1 = Object.freeze({
  properties: Object.freeze(['openFile'] as const),
  filters: Object.freeze([
    Object.freeze({ name: 'Timed transcript', extensions: Object.freeze(['json']) }),
  ]),
});

function failure(code: FileImportErrorCodeV1, message: string): FileSelectionResultV1 {
  return Object.freeze({ status: 'failed', error: Object.freeze({ code, message }) });
}

function safeDisplayName(absolutePath: string): string {
  const source = basename(absolutePath);
  let result = '';
  for (let index = 0; index < source.length && result.length < 1_024; index += 1) {
    const codeUnit = source.charCodeAt(index);
    result += codeUnit <= 0x1f || (codeUnit >= 0x7f && codeUnit <= 0x9f) ? '�' : source[index];
  }
  return result.length === 0 ? 'selected-file' : result;
}

async function chooseFile(
  parentWindow: unknown,
  dependencies: FileImportDependencies,
  options: FileDialogOptionsV1,
  rejectEmptyMedia: boolean,
): Promise<FileSelectionResultV1> {
  let dialogResult: { readonly canceled: boolean; readonly filePaths: readonly string[] };
  try {
    dialogResult = await dependencies.dialog.showOpenDialog(parentWindow, options);
  } catch {
    return failure('FILE_UNAVAILABLE', 'The selected file is unavailable.');
  }
  if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
    return Object.freeze({ status: 'cancelled', reason: 'DIALOG_CANCELLED' });
  }
  if (dialogResult.filePaths.length !== 1) {
    return failure('FILE_UNAVAILABLE', 'The selected file is unavailable.');
  }

  let absolutePath: string;
  let fileStat: { readonly isFile: boolean; readonly byteSize: number };
  try {
    absolutePath = await dependencies.fileSystem.realpath(dialogResult.filePaths[0]!);
    fileStat = await dependencies.fileSystem.stat(absolutePath);
  } catch {
    return failure('FILE_UNAVAILABLE', 'The selected file is unavailable.');
  }
  if (!fileStat.isFile) {
    return failure('FILE_NOT_REGULAR', 'The selected target is not a regular file.');
  }
  if (rejectEmptyMedia && fileStat.byteSize === 0) {
    return failure('MEDIA_EMPTY', 'The selected media file is empty.');
  }
  if (!Number.isSafeInteger(fileStat.byteSize) || fileStat.byteSize < 0) {
    return failure('FILE_UNAVAILABLE', 'The selected file is unavailable.');
  }
  try {
    await dependencies.fileSystem.verifyReadable(absolutePath);
  } catch {
    return failure('FILE_UNAVAILABLE', 'The selected file is unavailable.');
  }

  return Object.freeze({
    status: 'selected',
    file: Object.freeze({
      absolutePath,
      displayName: safeDisplayName(absolutePath),
      byteSize: fileStat.byteSize,
    }),
  });
}

export function chooseMediaFileV1(
  parentWindow: unknown,
  dependencies: FileImportDependencies,
): Promise<FileSelectionResultV1> {
  return chooseFile(parentWindow, dependencies, MEDIA_DIALOG_OPTIONS, true);
}

export function chooseTranscriptFileV1(
  parentWindow: unknown,
  dependencies: FileImportDependencies,
): Promise<FileSelectionResultV1> {
  return chooseFile(parentWindow, dependencies, TRANSCRIPT_DIALOG_OPTIONS, false);
}

export const electronFileDialogAdapter: FileImportDependencies['dialog'] = Object.freeze({
  async showOpenDialog(parentWindow, options) {
    const { dialog } = await import('electron');
    const electronOptions: OpenDialogOptions = {
      properties: ['openFile'],
      filters: options.filters.map((filter) => ({
        name: filter.name,
        extensions: [...filter.extensions],
      })),
    };
    const result = await dialog.showOpenDialog(parentWindow as BrowserWindow, electronOptions);
    return Object.freeze({ canceled: result.canceled, filePaths: Object.freeze(result.filePaths) });
  },
});

export const nodeFileSystemAdapter: FileImportDependencies['fileSystem'] = Object.freeze({
  realpath,
  async stat(path) {
    const result = await stat(path);
    return Object.freeze({ isFile: result.isFile(), byteSize: result.size });
  },
  async verifyReadable(path) {
    const handle = await open(path, 'r');
    await handle.close();
  },
});
