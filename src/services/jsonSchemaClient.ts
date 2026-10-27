import type { JsonSchemaValidationRequest } from '@/shared/ipc/jsonSchemaValidation';
import { requireElectronAppApi } from './electronApi';

export const jsonSchemaClient = {
  validate(request: JsonSchemaValidationRequest) {
    return requireElectronAppApi().validateJsonSchema(request);
  },
};
