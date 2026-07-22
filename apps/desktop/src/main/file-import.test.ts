import { describe, expect, it, vi } from 'vitest';

import {
  chooseMediaFileV1,
  chooseTranscriptFileV1,
  type FileImportDependencies,
} from './file-import.js';

function dependencies(): FileImportDependencies & {
  dialog: { showOpenDialog: ReturnType<typeof vi.fn> };
  fileSystem: {
    realpath: ReturnType<typeof vi.fn>;
    stat: ReturnType<typeof vi.fn>;
    verifyReadable: ReturnType<typeof vi.fn>;
  };
} {
  return {
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/chosen/input.mp4'] })),
    },
    fileSystem: {
      realpath: vi.fn(async () => '/canonical/private/input.mp4'),
      stat: vi.fn(async () => ({ isFile: true, byteSize: 1_024 })),
      verifyReadable: vi.fn(async () => undefined),
    },
  };
}

describe('main-owned native file import', () => {
  it('opens a parented single-file media dialog with frozen filters', async () => {
    const test = dependencies();
    const parentWindow = { id: 'window' };
    await expect(chooseMediaFileV1(parentWindow, test)).resolves.toEqual({
      status: 'selected',
      file: {
        absolutePath: '/canonical/private/input.mp4',
        displayName: 'input.mp4',
        byteSize: 1_024,
      },
    });
    expect(test.dialog.showOpenDialog).toHaveBeenCalledWith(parentWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v'] }],
    });
  });

  it('uses the JSON-only transcript filter without rejecting a zero-byte regular file', async () => {
    const test = dependencies();
    test.fileSystem.realpath.mockResolvedValue('/private/transcript.json');
    test.fileSystem.stat.mockResolvedValue({ isFile: true, byteSize: 0 });
    await expect(chooseTranscriptFileV1({}, test)).resolves.toMatchObject({
      status: 'selected',
      file: { displayName: 'transcript.json', byteSize: 0 },
    });
    expect(test.dialog.showOpenDialog).toHaveBeenCalledWith(
      {},
      {
        properties: ['openFile'],
        filters: [{ name: 'Timed transcript', extensions: ['json'] }],
      },
    );
  });

  it.each([
    [{ canceled: true, filePaths: ['/ignored'] }, 'cancelled'],
    [{ canceled: false, filePaths: [] }, 'cancelled'],
  ])('maps dialog cancellation before filesystem work', async (dialogResult, status) => {
    const test = dependencies();
    test.dialog.showOpenDialog.mockResolvedValue(dialogResult);
    await expect(chooseMediaFileV1({}, test)).resolves.toEqual({
      status,
      reason: 'DIALOG_CANCELLED',
    });
    expect(test.fileSystem.realpath).not.toHaveBeenCalled();
  });

  it.each(['realpath', 'stat', 'verifyReadable'] as const)(
    'maps %s failure to FILE_UNAVAILABLE without exposing the path',
    async (operation) => {
      const test = dependencies();
      test.fileSystem[operation].mockRejectedValue(new Error('/canonical/private/input.mp4'));
      const result = await chooseMediaFileV1({}, test);
      expect(result).toEqual({
        status: 'failed',
        error: { code: 'FILE_UNAVAILABLE', message: 'The selected file is unavailable.' },
      });
      expect(JSON.stringify(result)).not.toContain('/canonical');
    },
  );

  it('distinguishes a non-regular target before the media-empty check', async () => {
    const test = dependencies();
    test.fileSystem.stat.mockResolvedValue({ isFile: false, byteSize: 0 });
    await expect(chooseMediaFileV1({}, test)).resolves.toEqual({
      status: 'failed',
      error: { code: 'FILE_NOT_REGULAR', message: 'The selected target is not a regular file.' },
    });
    expect(test.fileSystem.verifyReadable).not.toHaveBeenCalled();
  });

  it('maps a zero-byte regular media file to MEDIA_EMPTY', async () => {
    const test = dependencies();
    test.fileSystem.stat.mockResolvedValue({ isFile: true, byteSize: 0 });
    await expect(chooseMediaFileV1({}, test)).resolves.toEqual({
      status: 'failed',
      error: { code: 'MEDIA_EMPTY', message: 'The selected media file is empty.' },
    });
  });

  it('sanitizes the display name and never returns a parent directory as display data', async () => {
    const test = dependencies();
    test.fileSystem.realpath.mockResolvedValue('/secret/folder/bad\nname.mov');
    const result = await chooseMediaFileV1({}, test);
    expect(result).toMatchObject({ status: 'selected', file: { displayName: 'bad�name.mov' } });
    if (result.status === 'selected') expect(result.file.displayName).not.toContain('/');
  });
});
