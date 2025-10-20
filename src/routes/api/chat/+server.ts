import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.AI) {
		return json({ error: 'AI binding not available' }, { status: 500 });
	}

	try {
		const body = (await request.json()) as { prompt?: string };
		const { prompt } = body;

		if (!prompt) {
			return json({ error: 'Prompt is required' }, { status: 400 });
		}

		// Use Llama 3.3 70B model via Cloudflare AI
		const response = await platform.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
			messages: [
				{
					role: 'user',
					content: prompt
				}
			]
		});

		return json({ response });
	} catch (error) {
		console.error('AI request failed:', error);
		return json(
			{ error: 'Failed to process AI request', details: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
};