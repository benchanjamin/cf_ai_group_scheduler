export interface Participant {
	userId: string;
	name: string;
	email?: string;
	availability: string; // Natural language description extracted by AI
	conversationHistory: Message[];
	joinedAt: string;
	lastActive: string;
}

export interface Message {
	role: 'user' | 'assistant';
	content: string;
	timestamp: string;
}

export interface TimeProposal {
	id: string;
	dateTime: string;
	duration: number;
	score: number; // 0-100, how many participants can attend
	availableParticipants: string[]; // userIds who can attend
	unavailableParticipants: string[]; // userIds who can't attend
	reasoning: string; // AI's explanation
}

export interface SchedulingSession {
	sessionCode: string;
	title: string;
	description?: string;
	createdBy: string;
	createdAt: string;
	lastActivityAt: string; // Track last activity for auto-cleanup
	status: 'collecting' | 'analyzing' | 'finalized';
	participants: Record<string, Participant>; // userId -> Participant
	proposedTimes: TimeProposal[];
	finalizedTime?: TimeProposal;
}

export class MeetingScheduler {
	private readonly state: DurableObjectState;
	private static readonly INACTIVITY_DAYS = 30;
	private static readonly INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

	constructor(state: DurableObjectState, _env: any) {
		this.state = state;
	}

	get ctx() {
		return this.state;
	}

	/**
	 * Alarm handler - called when the alarm fires
	 * Checks if session has been inactive for 30+ days and deletes it
	 */
	async alarm() {
		const session = await this.ctx.storage.kv.get('session') as SchedulingSession | undefined;

		if (!session) {
			// Session already deleted, nothing to do
			return;
		}

		const lastActivity = new Date(session.lastActivityAt);
		const now = new Date();
		const daysSinceActivity = (now.getTime() - lastActivity.getTime()) / (24 * 60 * 60 * 1000);

		if (daysSinceActivity >= MeetingScheduler.INACTIVITY_DAYS) {
			// Delete all session data
			await this.ctx.storage.kv.delete('session');
			console.log(`Deleted inactive session: ${session.sessionCode} (last activity: ${daysSinceActivity.toFixed(1)} days ago)`);
		} else {
			// Not inactive enough yet, schedule another check
			const nextCheckIn = MeetingScheduler.INACTIVITY_MS - (now.getTime() - lastActivity.getTime());
			await this.scheduleCleanupAlarm(nextCheckIn);
		}
	}

	/**
	 * Schedule an alarm to check for session cleanup
	 */
	private async scheduleCleanupAlarm(delayMs: number = MeetingScheduler.INACTIVITY_MS) {
		const alarmTime = Date.now() + delayMs;
		await this.ctx.storage.setAlarm(alarmTime);
	}

	/**
	 * Update last activity timestamp and reschedule cleanup alarm
	 */
	private async touchSession(session: SchedulingSession) {
		session.lastActivityAt = new Date().toISOString();
		await this.ctx.storage.kv.put('session', session);

		// Schedule cleanup check for 30 days from now
		await this.scheduleCleanupAlarm();
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		try {
			// Session management
			if (path === '/session' && request.method === 'POST') {
				return this.createSession(request);
			} else if (path === '/session' && request.method === 'GET') {
				return this.getSession();
			} else if (path === '/session/join' && request.method === 'POST') {
				return this.joinSession(request);
			} else if (path === '/session/participants' && request.method === 'GET') {
				return this.getParticipants();
			}

			// Participant-specific conversation
			else if (path.startsWith('/participant/') && request.method === 'POST') {
				const userId = path.split('/')[2];
				return this.addParticipantMessage(userId, request);
			} else if (path.startsWith('/participant/') && path.endsWith('/history') && request.method === 'GET') {
				const userId = path.split('/')[2];
				return this.getParticipantHistory(userId);
			}

			// AI analysis and proposals
			else if (path === '/analyze' && request.method === 'POST') {
				return this.analyzeAvailability(request);
			} else if (path === '/proposals' && request.method === 'GET') {
				return this.getProposals();
			} else if (path === '/finalize' && request.method === 'POST') {
				return this.finalizeTime(request);
			}

			return new Response('Not found', { status: 404 });
		} catch (error) {
			return new Response(JSON.stringify({ error: String(error) }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	// Session Management

	private async createSession(request: Request): Promise<Response> {
		const body = (await request.json()) as { title: string; createdBy: string; description?: string };

		const now = new Date().toISOString();
		const session: SchedulingSession = {
			sessionCode: this.generateSessionCode(),
			title: body.title,
			description: body.description,
			createdBy: body.createdBy,
			createdAt: now,
			lastActivityAt: now, // Initialize last activity
			status: 'collecting',
			participants: {},
			proposedTimes: []
		};

		await this.ctx.storage.kv.put('session', session);

		// Schedule cleanup alarm for 30 days from now
		await this.scheduleCleanupAlarm();

		return new Response(JSON.stringify(session), {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	private async getSession(): Promise<Response> {
		const session = this.ctx.storage.kv.get('session') as SchedulingSession | undefined;

		if (!session) {
			return new Response('Session not found', { status: 404 });
		}

		return new Response(JSON.stringify(session), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	private async joinSession(request: Request): Promise<Response> {
		const body = (await request.json()) as { userId: string; name: string; email?: string };
		const session = this.ctx.storage.kv.get('session') as SchedulingSession | undefined;

		if (!session) {
			return new Response('Session not found', { status: 404 });
		}

		// Add participant if not already in session
		if (!session.participants[body.userId]) {
			session.participants[body.userId] = {
				userId: body.userId,
				name: body.name,
				email: body.email,
				availability: '',
				conversationHistory: [],
				joinedAt: new Date().toISOString(),
				lastActive: new Date().toISOString()
			};

			// Update last activity and reschedule alarm
			await this.touchSession(session);
		}

		return new Response(JSON.stringify(session.participants[body.userId]), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	private async getParticipants(): Promise<Response> {
		const session = this.ctx.storage.kv.get('session') as SchedulingSession | undefined;

		if (!session) {
			return new Response('Session not found', { status: 404 });
		}

		return new Response(JSON.stringify(Object.values(session.participants)), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Participant Conversations

	private async addParticipantMessage(userId: string, request: Request): Promise<Response> {
		const body = (await request.json()) as Message;
		const session = this.ctx.storage.kv.get('session') as SchedulingSession | undefined;

		if (!session) {
			return new Response('Session not found', { status: 404 });
		}

		const participant = session.participants[userId];
		if (!participant) {
			return new Response('Participant not found', { status: 404 });
		}

		body.timestamp = new Date().toISOString();
		participant.conversationHistory.push(body);
		participant.lastActive = new Date().toISOString();

		// Keep only last 50 messages per participant
		if (participant.conversationHistory.length > 50) {
			participant.conversationHistory = participant.conversationHistory.slice(-50);
		}

		// Update last activity and reschedule alarm
		await this.touchSession(session);

		return new Response(JSON.stringify(body), {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	private async getParticipantHistory(userId: string): Promise<Response> {
		const session = this.ctx.storage.kv.get('session') as SchedulingSession | undefined;

		if (!session) {
			return new Response('Session not found', { status: 404 });
		}

		const participant = session.participants[userId];
		if (!participant) {
			return new Response('Participant not found', { status: 404 });
		}

		return new Response(JSON.stringify(participant.conversationHistory), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// AI Analysis

	private async analyzeAvailability(request: Request): Promise<Response> {
		const body = (await request.json()) as { proposals: TimeProposal[] };
		const session = this.ctx.storage.kv.get('session') as SchedulingSession | undefined;

		if (!session) {
			return new Response('Session not found', { status: 404 });
		}

		session.proposedTimes = body.proposals;
		session.status = 'analyzing';

		// Update last activity and reschedule alarm
		await this.touchSession(session);

		return new Response(JSON.stringify(session), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	private async getProposals(): Promise<Response> {
		const session = this.ctx.storage.kv.get('session') as SchedulingSession | undefined;

		if (!session) {
			return new Response('Session not found', { status: 404 });
		}

		return new Response(JSON.stringify(session.proposedTimes), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	private async finalizeTime(request: Request): Promise<Response> {
		const body = (await request.json()) as { proposalId: string };
		const session = this.ctx.storage.kv.get('session') as SchedulingSession | undefined;

		if (!session) {
			return new Response('Session not found', { status: 404 });
		}

		const proposal = session.proposedTimes.find((p) => p.id === body.proposalId);
		if (!proposal) {
			return new Response('Proposal not found', { status: 404 });
		}

		session.finalizedTime = proposal;
		session.status = 'finalized';

		this.ctx.storage.kv.put('session', session);

		return new Response(JSON.stringify(session), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Utilities

	private generateSessionCode(): string {
		// Generate a 6-character alphanumeric code
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
		let code = '';
		for (let i = 0; i < 6; i++) {
			code += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return code;
	}
}