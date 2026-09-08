import type { FillFormRequest } from '$lib/contracts/fill-form';
import { NotImplementedError, type FillFormProvider, type ProviderResult } from './types';

/**
 * The seam. Deliberately unimplemented — it exists today so the import path,
 * the env switch and the 501 error path are already wired and tested.
 *
 * When this lands: parse with FilledField[] as the structured-output schema,
 * keep the returned `model` honest (the actual model id, not a constant), and
 * leave `mock: false` so the smoke test starts passing on its own.
 */
export const openaiProvider: FillFormProvider = {
	name: 'openai',

	async fill(_req: FillFormRequest): Promise<ProviderResult> {
		throw new NotImplementedError(
			'the openai provider is not implemented yet — set FILL_FORM_PROVIDER=mock'
		);
	}
};
