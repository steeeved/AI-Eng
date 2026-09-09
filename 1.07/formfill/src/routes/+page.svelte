<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import rawCases from '$lib/fixtures/cases.json';
	import type { FieldSpec, FieldType, FillFormResponse } from '$lib/contracts/fill-form';

	type EvalCase = {
		id: string;
		description: string;
		request: { fields: FieldSpec[]; source: string };
		expected: Record<string, string>;
	};

	/** Bring-your-own-credentials, held only in this browser. Never sent anywhere but this deployment's own /api/fill-form. */
	type ClientSettings = {
		anthropicApiKey: string;
		anthropicModel: string;
		langsmithApiKey: string;
		langsmithProject: string;
		langsmithTracing: boolean;
	};

	const SETTINGS_KEY = 'formfill:client-settings';
	const EMPTY_SETTINGS: ClientSettings = {
		anthropicApiKey: '',
		anthropicModel: '',
		langsmithApiKey: '',
		langsmithProject: '',
		langsmithTracing: false
	};

	const cases = rawCases as unknown as EvalCase[];
	const FIELD_TYPES: FieldType[] = ['text', 'email', 'number', 'date', 'select'];

	let fields = $state<FieldSpec[]>(structuredClone(cases[0].request.fields));
	let source = $state(cases[0].request.source);
	let result = $state<FillFormResponse | null>(null);
	let loading = $state(false);
	/** The deployment's fallback provider, read once from GET /api/fill-form. */
	let defaultProvider = $state('checking…');
	/** '' means "use the deployment default" — omitted from the request body entirely. */
	let selectedProvider = $state<'' | 'mock' | 'anthropic'>('');

	let settingsOpen = $state(false);
	let settings = $state<ClientSettings>({ ...EMPTY_SETTINGS });
	/** Draft copy so Cancel doesn't clobber saved settings mid-edit. */
	let settingsDraft = $state<ClientSettings>({ ...EMPTY_SETTINGS });

	const filled = $derived(new Map((result?.fields ?? []).map((f) => [f.id, f])));
	const hasOwnKey = $derived(settings.anthropicApiKey.trim().length > 0);

	onMount(async () => {
		try {
			const res = await fetch('/api/fill-form');
			defaultProvider = (await res.json()).provider ?? 'unknown';
		} catch {
			defaultProvider = 'unreachable';
		}

		try {
			const stored = localStorage.getItem(SETTINGS_KEY);
			if (stored) settings = { ...EMPTY_SETTINGS, ...JSON.parse(stored) };
		} catch {
			// localStorage unavailable (private window, blocked site data) — settings just stay empty.
		}
	});

	function openSettings() {
		settingsDraft = { ...settings };
		settingsOpen = true;
	}

	function saveSettings() {
		settings = { ...settingsDraft };
		try {
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
		} catch {
			toast.error("couldn't save settings locally", {
				description: 'they will still be used for this session, just not remembered next visit'
			});
		}
		// A visitor who just pasted in their own key almost certainly wants it used.
		if (settings.anthropicApiKey.trim() && selectedProvider === '') {
			selectedProvider = 'anthropic';
		}
		settingsOpen = false;
	}

	function clearSettings() {
		settingsDraft = { ...EMPTY_SETTINGS };
	}

	function loadCase(evalCase: EvalCase) {
		fields = structuredClone(evalCase.request.fields);
		source = evalCase.request.source;
		result = null;
	}

	function addField() {
		fields.push({ id: `field_${fields.length + 1}`, label: '', type: 'text' });
	}

	function removeField(index: number) {
		fields.splice(index, 1);
	}

	/** Only set a header when there's something to say — an empty header still overrides the server default with "". */
	function settingsHeaders(): HeadersInit {
		const headers: Record<string, string> = { 'content-type': 'application/json' };
		if (settings.anthropicApiKey.trim()) headers['x-anthropic-api-key'] = settings.anthropicApiKey.trim();
		if (settings.anthropicModel.trim()) headers['x-anthropic-model'] = settings.anthropicModel.trim();
		if (settings.langsmithApiKey.trim()) headers['x-langsmith-api-key'] = settings.langsmithApiKey.trim();
		if (settings.langsmithProject.trim()) headers['x-langsmith-project'] = settings.langsmithProject.trim();
		if (settings.langsmithApiKey.trim()) {
			headers['x-langsmith-tracing'] = settings.langsmithTracing ? 'true' : 'false';
		}
		return headers;
	}

	async function fill() {
		loading = true;
		result = null;
		try {
			const res = await fetch('/api/fill-form', {
				method: 'POST',
				headers: settingsHeaders(),
				// snapshot: `fields` is a reactive proxy, and we want the plain value
				body: JSON.stringify({
					fields: $state.snapshot(fields),
					source,
					...(selectedProvider ? { provider: selectedProvider } : {})
				})
			});
			const body = await res.json();

			if (!res.ok) {
				toast.error(body.title ?? body.message ?? `request failed (${res.status})`, {
					description:
						body.detail ??
						body.errors?.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join('\n')
				});
				return;
			}
			result = body as FillFormResponse;
		} catch (error) {
			toast.error('network error', { description: String(error) });
		} finally {
			loading = false;
		}
	}
</script>

<main class="mx-auto max-w-6xl space-y-6 p-6">
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">FormFill</h1>
			<p class="text-muted-foreground text-sm">
				Extract structured fields from unstructured text.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<label class="text-muted-foreground flex items-center gap-1.5 text-sm">
				provider:
				<select
					bind:value={selectedProvider}
					class="border-input bg-background h-8 rounded-md border px-2 text-sm"
				>
					<option value="">default ({defaultProvider})</option>
					<option value="mock">mock</option>
					<option value="anthropic">anthropic</option>
				</select>
			</label>
			{#if result}
				<Badge variant={result.meta.mock ? 'secondary' : 'default'}>
					{result.meta.mock ? 'MOCK' : 'LIVE'} · {result.meta.provider}
				</Badge>
			{/if}
			<Button variant="outline" size="sm" onclick={openSettings}>
				⚙ Settings{hasOwnKey ? ' •' : ''}
			</Button>
		</div>
	</header>

	<div class="grid gap-6 md:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Source</Card.Title>
				<Card.Description>The unstructured text to extract from.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<Textarea bind:value={source} rows={18} class="font-mono text-xs" />
				<div class="flex flex-wrap gap-2">
					{#each cases as evalCase (evalCase.id)}
						<Button variant="outline" size="sm" onclick={() => loadCase(evalCase)}>
							{evalCase.id}
						</Button>
					{/each}
					<Button
						variant="ghost"
						size="sm"
						onclick={() => (source = `${source}\n__fail`)}
						title="Appends the __fail sentinel so the mock throws — exercises the 502 path"
					>
						break it
					</Button>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Fields</Card.Title>
				<Card.Description>The schema you want back. Ids are snake_case.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-2">
				{#each fields as field, index (index)}
					<div class="flex items-center gap-2">
						<Input bind:value={field.id} placeholder="id" class="w-40 font-mono text-xs" />
						<Input bind:value={field.label} placeholder="label" class="flex-1" />
						<select
							bind:value={field.type}
							class="border-input bg-background h-9 rounded-md border px-2 text-sm"
						>
							{#each FIELD_TYPES as fieldType (fieldType)}
								<option value={fieldType}>{fieldType}</option>
							{/each}
						</select>
						<Button variant="ghost" size="sm" onclick={() => removeField(index)}>×</Button>
					</div>
				{/each}
				<Button variant="outline" size="sm" onclick={addField}>Add field</Button>
			</Card.Content>
			<Card.Footer>
				<Button onclick={fill} disabled={loading || fields.length === 0} class="w-full">
					{loading ? 'Filling…' : 'Fill form'}
				</Button>
			</Card.Footer>
		</Card.Root>
	</div>

	{#if result}
		<Card.Root>
			<Card.Header>
				<Card.Title>Result</Card.Title>
				<Card.Description>
					{result.meta.model} · {result.meta.latencyMs}ms
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-1">
				{#each fields as field (field.id)}
					{@const hit = filled.get(field.id)}
					<div class="grid grid-cols-[12rem_1fr_5rem] items-center gap-3 border-b py-2 text-sm">
						<span class="text-muted-foreground truncate">{field.label || field.id}</span>
						{#if hit?.value}
							<span class="font-medium">{hit.value}</span>
						{:else}
							<span class="text-muted-foreground italic">not found</span>
						{/if}
						<div class="flex items-center gap-2">
							<div class="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
								<div
									class="bg-foreground h-full rounded-full transition-all"
									style="width: {(hit?.confidence ?? 0) * 100}%"
								></div>
							</div>
							<span class="text-muted-foreground w-8 text-right text-xs tabular-nums">
								{Math.round((hit?.confidence ?? 0) * 100)}
							</span>
						</div>
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}
</main>

{#if settingsOpen}
	<!-- Hand-rolled modal: no Dialog primitive in this scaffold yet, and this is the only place that needs one. -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="settings-title"
	>
		<button
			class="absolute inset-0 cursor-default"
			aria-label="Close settings"
			onclick={() => (settingsOpen = false)}
		></button>
		<Card.Root class="relative z-10 w-full max-w-md">
			<Card.Header>
				<Card.Title id="settings-title">Settings</Card.Title>
				<Card.Description>
					Bring your own keys — stored only in this browser's local storage, sent only to this
					deployment's own /api/fill-form, never to the deployer.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<div class="space-y-1">
					<label class="text-sm font-medium" for="anthropic-key">Anthropic API key</label>
					<Input
						id="anthropic-key"
						type="password"
						bind:value={settingsDraft.anthropicApiKey}
						placeholder="sk-ant-…"
						autocomplete="off"
					/>
				</div>
				<div class="space-y-1">
					<label class="text-sm font-medium" for="anthropic-model">Anthropic model</label>
					<Input
						id="anthropic-model"
						bind:value={settingsDraft.anthropicModel}
						placeholder="claude-haiku-4-5-20251001 (default)"
					/>
				</div>
				<div class="space-y-1">
					<label class="text-sm font-medium" for="langsmith-key">LangSmith API key</label>
					<Input
						id="langsmith-key"
						type="password"
						bind:value={settingsDraft.langsmithApiKey}
						placeholder="lsv2_… (optional)"
						autocomplete="off"
					/>
				</div>
				<div class="space-y-1">
					<label class="text-sm font-medium" for="langsmith-project">LangSmith project</label>
					<Input
						id="langsmith-project"
						bind:value={settingsDraft.langsmithProject}
						placeholder="formfill (default)"
					/>
				</div>
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" bind:checked={settingsDraft.langsmithTracing} />
					Trace my requests to LangSmith
				</label>
			</Card.Content>
			<Card.Footer class="flex justify-between gap-2">
				<Button variant="ghost" size="sm" onclick={clearSettings}>Clear</Button>
				<div class="flex gap-2">
					<Button variant="outline" size="sm" onclick={() => (settingsOpen = false)}>Cancel</Button>
					<Button size="sm" onclick={saveSettings}>Save</Button>
				</div>
			</Card.Footer>
		</Card.Root>
	</div>
{/if}
