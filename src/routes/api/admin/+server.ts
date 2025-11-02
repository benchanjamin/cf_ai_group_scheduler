import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

/**
 * Admin API for viewing session data
 * WARNING: In production, add authentication to this endpoint!
 */

export const GET: RequestHandler = async ({ url, platform }) => {
	if (!platform?.env?.SESSIONS) {
		return json({ error: 'SESSIONS binding not available' }, { status: 500 });
	}

	const sessionCode = url.searchParams.get('code');

	if (!sessionCode) {
		return json(
			{
				error: 'Missing session code',
				usage: 'GET /api/admin?code=ABC123'
			},
			{ status: 400 }
		);
	}

	try {
		// Get Durable Object instance for this session
		const id = platform.env.SESSIONS.idFromName(sessionCode);
		const stub = platform.env.SESSIONS.get(id);

		// Fetch session data
		const sessionResponse = await stub.fetch('http://do/session');

		if (!sessionResponse.ok) {
			return json({ error: 'Session not found' }, { status: 404 });
		}

		const sessionData = await sessionResponse.json();

		// Return formatted session data
		return json(
			{
				session: sessionData,
				metadata: {
					sessionCode,
					durableObjectId: id.toString(),
					retrievedAt: new Date().toISOString()
				}
			},
			{
				headers: {
					'Content-Type': 'application/json; charset=utf-8'
				}
			}
		);
	} catch (error) {
		return json(
			{
				error: 'Failed to retrieve session data',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
