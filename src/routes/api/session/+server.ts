import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

// POST - Create new scheduling session
export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.SESSIONS) {
		return json({ error: 'SESSIONS binding not available' }, { status: 500 });
	}

	try {
		const body = (await request.json()) as { title: string; createdBy: string; description?: string };

		if (!body.title || !body.createdBy) {
			return json({ error: 'Title and createdBy are required' }, { status: 400 });
		}

		// Generate a random session code that will be used as the DO name
		const sessionCode = generateSessionCode();

		// Get Durable Object instance for this session
		const id = platform.env.SESSIONS.idFromName(sessionCode);
		const stub = platform.env.SESSIONS.get(id);

		// Create the session in the DO
		const response = await stub.fetch('http://do/session', {
			method: 'POST',
			body: JSON.stringify(body)
		});

		const session = await response.json();

		return json({ ...session, sessionCode }, { status: 201 });
	} catch (error) {
		console.error('Failed to create session:', error);
		return json(
			{
				error: 'Failed to create session',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};

// GET - Get session by code
export const GET: RequestHandler = async ({ url, platform }) => {
	if (!platform?.env?.SESSIONS) {
		return json({ error: 'SESSIONS binding not available' }, { status: 500 });
	}

	try {
		const sessionCode = url.searchParams.get('code');

		if (!sessionCode) {
			return json({ error: 'Session code is required' }, { status: 400 });
		}

		// Get Durable Object instance for this session
		const id = platform.env.SESSIONS.idFromName(sessionCode);
		const stub = platform.env.SESSIONS.get(id);

		// Get session data
		const response = await stub.fetch('http://do/session');

		if (!response.ok) {
			return json({ error: 'Session not found' }, { status: 404 });
		}

		const session = await response.json();

		return json({ ...session, sessionCode });
	} catch (error) {
		console.error('Failed to get session:', error);
		return json(
			{
				error: 'Failed to get session',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};

function generateSessionCode(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let code = '';
	for (let i = 0; i < 6; i++) {
		code += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return code;
}
