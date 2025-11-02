import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

interface Message {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

// Generate system prompt with current date/time and participant context
function getCollaborativeSystemPrompt(participantNames: string[], participantCount: number): string {
	const now = new Date();
	const dateStr = now.toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
	const timeStr = now.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		timeZoneName: 'short'
	});

	return `You are an AI scheduling coordinator helping ${participantCount} people find a time to meet.

CURRENT DATE AND TIME: ${dateStr} at ${timeStr}

PARTICIPANTS IN THIS SESSION:
${participantNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}

YOUR ROLE:
1. Have a natural conversation with each participant to understand their availability
2. Extract time constraints from their messages (e.g., "I'm free Mon-Wed 2-5pm", "Only Tuesday afternoon works")
3. Ask clarifying questions if their availability is unclear
4. When you have gathered availability from ALL participants, analyze the overlaps

AVAILABILITY EXTRACTION:
When a participant shares their availability, acknowledge it and store it mentally. Examples:
- "I'm free Monday and Tuesday afternoons"
- "I can only do mornings this week"
- "Wednesday at 2pm works for me"
- "I'm busy all day Thursday"

IMPORTANT: When you have availability from ALL ${participantCount} participants, respond with a JSON object:
{
  "action": "analyze_availability",
  "analysis": {
    "participantAvailability": {
      "ParticipantName1": "their availability description",
      "ParticipantName2": "their availability description"
    },
    "proposals": [
      {
        "dateTime": "2025-10-25T14:00:00Z",
        "duration": 60,
        "score": 100,
        "availableParticipants": ["ParticipantName1", "ParticipantName2"],
        "unavailableParticipants": [],
        "reasoning": "Both participants are available at this time"
      }
    ]
  },
  "message": "I've found the following times that work for everyone..."
}

If not everyone has shared availability yet, respond normally and encourage others to share their availability.

For dateTime, always use ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ) in UTC.
Score proposals from 0-100 based on how many participants can attend (100 = everyone, 0 = nobody).
Provide at least 3 ranked time proposals if possible.`;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.AI || !platform?.env?.SESSIONS) {
		return json({ error: 'Required bindings not available' }, { status: 500 });
	}

	try {
		const body = (await request.json()) as {
			sessionCode: string;
			userId: string;
			prompt: string;
		};

		const { sessionCode, userId, prompt } = body;

		if (!sessionCode || !userId || !prompt) {
			return json({ error: 'sessionCode, userId, and prompt are required' }, { status: 400 });
		}

		// Get Durable Object instance for this session
		const id = platform.env.SESSIONS.idFromName(sessionCode);
		const stub = platform.env.SESSIONS.get(id);

		// Get session info
		const sessionResponse = await stub.fetch('http://do/session');
		const session = await sessionResponse.json() as any;

		// Get participant's conversation history
		const historyResponse = await stub.fetch(`http://do/participant/${userId}/history`);
		const participantHistory = (await historyResponse.json()) as Message[];

		// Add user message to participant's history
		await stub.fetch(`http://do/participant/${userId}`, {
			method: 'POST',
			body: JSON.stringify({ role: 'user', content: prompt })
		});

		// Get all participants' names for context
		const participantsResponse = await stub.fetch('http://do/session/participants');
		const participants = await participantsResponse.json() as any[];
		const participantNames = participants.map(p => p.name);

		// Build messages array for AI with collaborative context
		const messages: Message[] = [
			{ role: 'system', content: getCollaborativeSystemPrompt(participantNames, participants.length) },
			...participantHistory.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
			{ role: 'user', content: prompt }
		];

		// Call Llama 3.3
		const aiResponse = await platform.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
			messages
		});

		// Parse AI response - handle various response formats
		let responseText = '';
		if (typeof aiResponse === 'string') {
			responseText = aiResponse;
		} else if (typeof aiResponse === 'object' && aiResponse !== null) {
			if ('response' in aiResponse && typeof aiResponse.response === 'string') {
				responseText = aiResponse.response;
			} else if ('text' in aiResponse && typeof aiResponse.text === 'string') {
				responseText = aiResponse.text;
			} else if ('content' in aiResponse && typeof aiResponse.content === 'string') {
				responseText = aiResponse.content;
			} else if ('message' in aiResponse && typeof aiResponse.message === 'string') {
				responseText = aiResponse.message;
			} else {
				console.error('Unexpected AI response format:', aiResponse);
				responseText = 'I apologize, but I received an unexpected response format. Please try again.';
			}
		} else {
			responseText = String(aiResponse);
		}

		// Check if AI wants to analyze availability
		let analysisCreated = null;
		try {
			const jsonMatch = responseText.match(/\{[\s\S]*"action":\s*"analyze_availability"[\s\S]*\}/);
			if (jsonMatch) {
				const actionData = JSON.parse(jsonMatch[0]);
				if (actionData.action === 'analyze_availability' && actionData.analysis) {
					// Store the analysis in the session
					await stub.fetch('http://do/analyze', {
						method: 'POST',
						body: JSON.stringify({ proposals: actionData.analysis.proposals || [] })
					});
					analysisCreated = actionData.analysis;
					responseText = actionData.message || "I've analyzed everyone's availability!";
				}
			}
		} catch (e) {
			// Not an analysis request, continue normally
		}

		// Add assistant response to participant's history
		await stub.fetch(`http://do/participant/${userId}`, {
			method: 'POST',
			body: JSON.stringify({ role: 'assistant', content: responseText })
		});

		return json({
			response: responseText,
			analysis: analysisCreated,
			session: {
				code: sessionCode,
				participants: participants.length,
				status: session.status
			}
		});
	} catch (error) {
		console.error('AI request failed:', error);
		return json(
			{
				error: 'Failed to process AI request',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
