import { hostingClient } from '@/services/hostingClient';
import { getElectronApi } from '@/services/electronApi';
import { requestBranchChange } from '@/components/branch-change/branchChangeDialogState';
import type { HostingOperations } from '@/shared/ipc/contracts/hosting';

export async function checkoutHostedChange(input: HostingOperations['checkoutChangeRequest']['input']) {
  if (!getElectronApi()?.git?.inspectBranchChange) return hostingClient.request('checkoutChangeRequest', input);
  const target = await hostingClient.request('prepareChangeRequestCheckout', input);
  const result = await requestBranchChange(input.repoPath, target);
  return Boolean(result?.switched && (!result.error || result.restored));
}
