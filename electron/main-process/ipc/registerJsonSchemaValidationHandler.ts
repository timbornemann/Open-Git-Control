import { ipcMain } from 'electron';
import { IpcChannel } from '../../../src/types/ipcContract';
import { JsonSchemaValidationService } from '../../validation/JsonSchemaValidationService';

export function registerJsonSchemaValidationHandler(service = new JsonSchemaValidationService()): void {
  ipcMain.handle(IpcChannel.AppValidateJsonSchema, async (event, request: unknown) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (event.sender.isDestroyed()) cancel();
    else event.sender.once('destroyed', cancel);
    try {
      return await service.validate(request, controller.signal);
    } finally {
      event.sender.removeListener('destroyed', cancel);
    }
  });
}
