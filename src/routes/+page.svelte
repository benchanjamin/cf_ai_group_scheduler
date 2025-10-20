<script lang="ts">
	let prompt = $state('');
	let response = $state('');
	let loading = $state(false);
	let error = $state('');

	async function sendMessage() {
		if (!prompt.trim()) return;

		loading = true;
		error = '';
		response = '';

		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ prompt })
			});

			const data = (await res.json()) as { error?: string; response?: { response?: string } };

			if (!res.ok) {
				error = data.error || 'Failed to get response';
				return;
			}

			response = data.response?.response || JSON.stringify(data.response, null, 2);
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
		} finally {
			loading = false;
		}
	}
</script>

<div class="container mx-auto max-w-4xl p-8">
	<h1 class="text-4xl font-bold mb-8">Cloudflare AI with Llama 3</h1>

	<div class="space-y-6">
		<div>
			<label for="prompt" class="block text-sm font-medium mb-2">
				Enter your prompt:
			</label>
			<textarea
				id="prompt"
				bind:value={prompt}
				class="w-full p-3 border rounded-lg min-h-32"
				placeholder="Ask Llama 3 anything..."
				disabled={loading}
			></textarea>
		</div>

		<button
			onclick={sendMessage}
			disabled={loading || !prompt.trim()}
			class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
		>
			{loading ? 'Thinking...' : 'Send'}
		</button>

		{#if error}
			<div class="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
				<strong>Error:</strong> {error}
			</div>
		{/if}

		{#if response}
			<div class="mt-6">
				<h2 class="text-xl font-semibold mb-3">Response:</h2>
				<div class="p-4 bg-gray-100 rounded-lg whitespace-pre-wrap">
					{response}
				</div>
			</div>
		{/if}
	</div>
</div>
