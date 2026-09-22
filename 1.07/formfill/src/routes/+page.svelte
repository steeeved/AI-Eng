<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import rawCases from '$lib/fixtures/cases.json';
	import type { FieldSpec, FieldType, FillFormResponse, FillFormStreamEvent } from '$lib/contracts/fill-form';

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

	/**
	 * The full 1.09 lifecycle. 'working' covers both 'connecting' and
	 * 'generating' progress sub-stages (see progressStage) — those are a
	 * detail for the status line, not a separate top-level state, since
	 * every UI decision (show Stop? show spinner?) is the same for both.
	 */
	type FillPhase = 'idle' | 'working' | 'complete' | 'cancelled' | 'failed';
	type FillError = { title: string; detail?: string };

	let result = $state<FillFormResponse | null>(null);
	let phase = $state<FillPhase>('idle');
	let progressStage = $state<'connecting' | 'generating' | null>(null);
	/**
	 * Raw partial provider output while phase === 'working'. Provisional and
	 * read-only: a structurally complete JSON fragment is not a validated
	 * answer, so this is only ever displayed as a "still working" indicator,
	 * never parsed into a field value. See StreamPreviewEvent.
	 */
	let preview = $state('');
	let fillError = $state<FillError | null>(null);
	let loading = $derived(phase === 'working');

	/**
	 * Bumped on every submit(). A stream event whose generation doesn't match
	 * the current one is from a superseded request (e.g. the user hit Stop
	 * and immediately clicked Fill again) and must be ignored, even if the
	 * old reader is still delivering buffered chunks.
	 */
	let generation = 0;
	let activeAbort: AbortController | null = null;
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
		phase = 'idle';
		preview = '';
		fillError = null;
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

	/**
	 * Parses the SSE body one chunk at a time. `data: <json>\n\n` frames can
	 * arrive split across chunk boundaries (TCP doesn't respect our framing),
	 * so incomplete text is held in `buffer` until a full `\n\n` shows up.
	 */
	function parseSseFrames(buffer: string): { events: FillFormStreamEvent[]; rest: string } {
		const events: FillFormStreamEvent[] = [];
		const parts = buffer.split('\n\n');
		const rest = parts.pop() ?? '';
		for (const part of parts) {
			const line = part.split('\n').find((l) => l.startsWith('data: '));
			if (!line) continue;
			try {
				events.push(JSON.parse(line.slice('data: '.length)) as FillFormStreamEvent);
			} catch {
				// A frame that isn't valid JSON is a bug in the route, not
				// something to crash the tab over — drop it and keep reading.
			}
		}
		return { events, rest };
	}

	/** Wired to the Stop button. Cancellation cannot undo work already performed upstream — see 1.09. */
	function stop() {
		activeAbort?.abort();
	}

	async function submit() {
		const myGeneration = ++generation;
		activeAbort?.abort(); // a stray earlier run, if any, should not keep running
		const controller = new AbortController();
		activeAbort = controller;

		phase = 'working';
		progressStage = 'connecting';
		preview = '';
		result = null;
		fillError = null;

		const isCurrent = () => myGeneration === generation;

		try {
			const res = await fetch('/api/fill-form', {
				method: 'POST',
				headers: settingsHeaders(),
				// snapshot: `fields` is a reactive proxy, and we want the plain value
				body: JSON.stringify({
					fields: $state.snapshot(fields),
					source,
					...(selectedProvider ? { provider: selectedProvider } : {})
				}),
				signal: controller.signal
			});

			if (!res.ok || !res.body) {
				// Only pre-stream failures (bad JSON, contract validation) still
				// come back as a plain problem+json response — everything past
				// that point is an 'error' event inside the stream instead.
				const body = await res.json().catch(() => ({}));
				if (!isCurrent()) return;
				phase = 'failed';
				fillError = {
					title: body.title ?? body.message ?? `request failed (${res.status})`,
					detail:
						body.detail ??
						body.errors
							?.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`)
							.join('\n')
				};
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (!isCurrent()) return; // superseded mid-read — stop applying its events entirely
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const { events, rest } = parseSseFrames(buffer);
				buffer = rest;

				for (const event of events) {
					if (!isCurrent()) return;
					switch (event.type) {
						case 'progress':
							progressStage = event.stage;
							break;
						case 'preview':
							preview = event.partial;
							break;
						case 'result':
							result = event.data;
							phase = 'complete';
							break;
						case 'error':
							fillError = { title: event.problem.title, detail: event.problem.detail };
							phase = 'failed';
							break;
						case 'cancelled':
							phase = 'cancelled';
							break;
					}
				}
			}

			// The stream closed without ever sending a terminal event — a
			// dropped connection or a stalled upstream, not a clean finish.
			// Do NOT leave phase at 'working' forever, and do not treat a
			// silent close as success.
			if (isCurrent() && phase === 'working') {
				phase = 'failed';
				fillError = { title: 'Connection ended before a result arrived', detail: 'stream closed with no terminal event' };
			}
		} catch (error) {
			if (!isCurrent()) return;
			if (controller.signal.aborted) {
				phase = 'cancelled';
			} else {
				phase = 'failed';
				fillError = { title: 'network error', detail: String(error) };
			}
		} finally {
			if (activeAbort === controller) activeAbort = null;
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
			<Card.Footer class="gap-2">
				<Button onclick={submit} disabled={loading || fields.length === 0} class="flex-1">
					{loading ? (progressStage === 'connecting' ? 'Connecting…' : 'Filling…') : 'Fill form'}
				</Button>
				{#if loading}
					<Button variant="destructive" onclick={stop}>Stop</Button>
				{/if}
			</Card.Footer>
		</Card.Root>
	</div>

	{#if phase === 'working'}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<span class="bg-foreground inline-block h-2 w-2 animate-pulse rounded-full"></span>
					{progressStage === 'connecting' ? 'Connecting…' : 'Generating…'}
				</Card.Title>
				<Card.Description>
					Provisional output only — not yet validated, may still change or fail.
				</Card.Description>
			</Card.Header>
			{#if preview}
				<Card.Content>
					<pre class="bg-muted overflow-x-auto rounded-md p-3 text-xs">{preview}</pre>
				</Card.Content>
			{/if}
		</Card.Root>
	{:else if phase === 'cancelled'}
		<Card.Root>
			<Card.Header>
				<Card.Title>Cancelled</Card.Title>
				<Card.Description>
					Stopped by you. Work already performed upstream cannot be undone — this only stops
					waiting on more of it.
				</Card.Description>
			</Card.Header>
			<Card.Footer>
				<Button variant="outline" size="sm" onclick={submit}>Try again</Button>
			</Card.Footer>
		</Card.Root>
	{:else if phase === 'failed'}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-destructive">{fillError?.title ?? 'Failed'}</Card.Title>
				{#if fillError?.detail}
					<Card.Description>{fillError.detail}</Card.Description>
				{/if}
			</Card.Header>
			<Card.Footer>
				<!-- Explicit retry only — 1.09 is clear that a request which may
				     still be running upstream must never be auto-replayed. -->
				<Button variant="outline" size="sm" onclick={submit}>Retry</Button>
			</Card.Footer>
		</Card.Root>
	{:else if phase === 'complete' && result}
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
