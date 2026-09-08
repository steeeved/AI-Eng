import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Pinned explicitly rather than adapter-auto: adapter-auto resolves at build
			// time and gives you nothing to configure. Per-route overrides go in
			// `export const config` in the route itself.
			adapter: adapter({
				runtime: 'nodejs22.x'
			})
		})
	]
});
