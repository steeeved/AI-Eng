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

	const cases = rawCases as unknown as EvalCase[];
	const FIELD_TYPES: FieldType[] = ['text', 'email', 'number', 'date', 'select'];

	let fields = $state<FieldSpec[]>(structuredClone(cases[0].request.fields));
	let source = $state(cases[0].request.source);
	let result = $state<FillFormResponse | null>(null);
	let loading = $state(false);
	let provider = $state('checking…');

	const filled = $derived(new Map((result?.fields ?? []).map((f) => [f.id, f])));

	onMount(async () => {
		try {
			const res = await fetch('/api/fill-form');
			provider = (await res.json()).provider ?? 'unknown';
		} catch {
			provider = 'unreachable';
		}
	});

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

	async function fill() {
		loading = true;
		result = null;
		try {
			const res = await fetch('/api/fill-form', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				// snapshot: `fields` is a reactive proxy, and we want the plain value
				body: JSON.stringify({ fields: $state.snapshot(fields), source })
			});
			const body = await res.json();

			if (!res.ok) {
				toast.error(body.message ?? `request failed (${res.status})`, {
					description: body.issues
						?.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`)
						.join('\n')
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
			<Badge variant="outline">provider: {provider}</Badge>
			{#if result}
				<Badge variant={result.meta.mock ? 'secondary' : 'default'}>
					{result.meta.mock ? 'MOCK' : 'LIVE'}
				</Badge>
			{/if}
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
