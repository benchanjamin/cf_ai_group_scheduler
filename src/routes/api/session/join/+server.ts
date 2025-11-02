import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

// POST - Join existing session
export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.SESSIONS) {
		return json({ error: 'SESSIONS binding not available' }, { status: 500 });
	}

	try {
		const body = (await request.json()) as { sessionCode: string; userId: string; name: string };

		if (!body.sessionCode || !body.userId || !body.name) {
			return json({ error: 'sessionCode, userId, and name are required' }, { status: 400 });
		}

		// Get Durable Object instance for this session
		const id = platform.env.SESSIONS.idFromName(body.sessionCode);
		const stub = platform.env.SESSIONS.get(id);

		// Join the session
		const response = await stub.fetch('http://do/session/join', {
			method: 'POST',
			body: JSON.stringify({ userId: body.userId, name: body.name })
		});

		if (!response.ok) {
			const error = await response.text();
			return json({ error }, { status: response.status });
		}

		const participant = await response.json();

		return json({ participant, sessionCode: body.sessionCode });
	} catch (error) {
		console.error('Failed to join session:', error);
		return json(
			{
				error: 'Failed to join session',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
