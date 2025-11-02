<script lang="ts">
	import { onMount } from 'svelte';

	interface Message {
		role: 'user' | 'assistant';
		content: string;
	}

	interface Participant {
		userId: string;
		name: string;
		email?: string;
		joinedAt: string;
		lastActive: string;
	}

	interface TimeProposal {
		id: string;
		dateTime: string;
		duration: number;
		score: number;
		availableParticipants: string[];
		unavailableParticipants: string[];
		reasoning: string;
	}

	// Session state
	let sessionCode = $state('');
	let sessionTitle = $state('');
	let joinCode = $state('');
	let userName = $state('');
	let userEmail = $state('');
	let userId = $state('');
	let inSession = $state(false);
	let isCreator = $state(false);

	// Chat state
	let prompt = $state('');
	let messages = $state<Message[]>([]);
	let participants = $state<Participant[]>([]);
	let proposals = $state<TimeProposal[]>([]);
	let loading = $state(false);
	let error = $state('');

	// Voice state
	let isListening = $state(false);
	let isSpeaking = $state(false);
	let voiceEnabled = $state(false);
	let speechToTextEnabled = $state(true);
	let textToSpeechEnabled = $state(true);
	let recognition: any = null;
	let synthesis: SpeechSynthesis | null = null;

	// UI state
	let view = $state<'welcome' | 'create' | 'join' | 'session'>('welcome');

	onMount(() => {
		// Check if user already has a session
		const storedSessionCode = localStorage.getItem('cf_ai_scheduler_sessionCode');
		const storedUserId = localStorage.getItem('cf_ai_scheduler_userId');
		const storedUserName = localStorage.getItem('cf_ai_scheduler_userName');
		const storedUserEmail = localStorage.getItem('cf_ai_scheduler_userEmail');

		if (storedSessionCode && storedUserId && storedUserName) {
			sessionCode = storedSessionCode;
			userId = storedUserId;
			userName = storedUserName;
			userEmail = storedUserEmail || '';
			rejoinSession();
		}

		// Initialize Web Speech API
		if (typeof window !== 'undefined') {
			// Speech Recognition
			const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
			if (SpeechRecognition) {
				recognition = new SpeechRecognition();
				recognition.continuous = false;
				recognition.interimResults = false;
				recognition.lang = 'en-US';

				recognition.onresult = (event: any) => {
					const transcript = event.results[0][0].transcript;
					prompt = transcript;
					isListening = false;
					// Auto-send on voice input
					sendMessage();
				};

				recognition.onerror = (event: any) => {
					console.error('Speech recognition error:', event.error);
					isListening = false;
					error = 'Voice recognition error: ' + event.error;
				};

				recognition.onend = () => {
					isListening = false;
				};

				voiceEnabled = true;
			}

			// Text-to-Speech
			if ('speechSynthesis' in window) {
				synthesis = window.speechSynthesis;
			}
		}
	});

	async function createSession() {
		if (!sessionTitle.trim() || loading) return;

		loading = true;
		error = '';

		try {
			// Generate userId for creator
			userId = 'user-' + Math.random().toString(36).substring(7);

			const res = await fetch('/api/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: sessionTitle,
					createdBy: userId,
					description: 'AI-powered collaborative scheduling session'
				})
			});

			if (!res.ok) {
				const data = await res.json();
				error = data.error || 'Failed to create session';
				return;
			}

			const data = await res.json();
			sessionCode = data.sessionCode;
			isCreator = true;

			// Store session info
			localStorage.setItem('cf_ai_scheduler_sessionCode', sessionCode);
			localStorage.setItem('cf_ai_scheduler_userId', userId);

			// Show prompt for creator name
			view = 'session';
			inSession = false; // Will prompt for name next
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create session';
		} finally {
			loading = false;
		}
	}

	async function joinSession() {
		if (!joinCode.trim() || !userName.trim() || loading) return;

		loading = true;
		error = '';

		try {
			// Generate userId for participant
			userId = 'user-' + Math.random().toString(36).substring(7);

			const res = await fetch('/api/session/join', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionCode: joinCode,
					userId,
					name: userName,
					email: userEmail || undefined
				})
			});

			if (!res.ok) {
				const data = await res.json();
				error = data.error || 'Failed to join session';
				return;
			}

			const data = await res.json();
			sessionCode = joinCode;
			inSession = true;

			// Store session info
			localStorage.setItem('cf_ai_scheduler_sessionCode', sessionCode);
			localStorage.setItem('cf_ai_scheduler_userId', userId);
			localStorage.setItem('cf_ai_scheduler_userName', userName);
			if (userEmail) localStorage.setItem('cf_ai_scheduler_userEmail', userEmail);

			view = 'session';
			loadSessionData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to join session';
		} finally {
			loading = false;
		}
	}

	async function joinAsCreator() {
		if (!userName.trim() || loading) return;

		loading = true;
		error = '';

		try {
			const res = await fetch('/api/session/join', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionCode,
					userId,
					name: userName,
					email: userEmail || undefined
				})
			});

			if (!res.ok) {
				const data = await res.json();
				error = data.error || 'Failed to join session';
				return;
			}

			inSession = true;
			localStorage.setItem('cf_ai_scheduler_userName', userName);
			if (userEmail) localStorage.setItem('cf_ai_scheduler_userEmail', userEmail);
			loadSessionData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to join session';
		} finally {
			loading = false;
		}
	}

	async function rejoinSession() {
		loading = true;
		error = '';

		try {
			// Verify session still exists
			const res = await fetch(`/api/session?code=${sessionCode}`);

			if (!res.ok) {
				// Session doesn't exist, clear storage
				leaveSession();
				return;
			}

			inSession = true;
			view = 'session';
			loadSessionData();
		} catch (err) {
			console.error('Failed to rejoin session:', err);
			leaveSession();
		} finally {
			loading = false;
		}
	}

	async function loadSessionData() {
		try {
			// Load session data (includes participants and proposals)
			const sessionRes = await fetch(`/api/session?code=${sessionCode}`);
			if (sessionRes.ok) {
				const sessionData = await sessionRes.json();

				// Load session title
				if (sessionData.title) {
					sessionTitle = sessionData.title;
				}

				// Convert participants object to array
				if (sessionData.participants) {
					participants = Object.values(sessionData.participants);
				}

				// Load proposals if they exist
				if (sessionData.proposedTimes) {
					proposals = sessionData.proposedTimes;
				}
			}
		} catch (err) {
			console.error('Failed to load session data:', err);
		}
	}

	async function sendMessage() {
		if (!prompt.trim() || loading || !inSession) return;

		const userMessage: Message = {
			role: 'user',
			content: prompt
		};

		messages.push(userMessage);
		messages = messages;

		loading = true;
		error = '';
		const currentPrompt = prompt;
		prompt = '';

		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionCode,
					userId,
					prompt: currentPrompt
				})
			});

			if (!res.ok) {
				const data = await res.json();
				error = data.error || 'Failed to get response';
				return;
			}

			const data = await res.json();

			const assistantMessage: Message = {
				role: 'assistant',
				content: data.response || 'No response'
			};

			messages.push(assistantMessage);
			messages = messages;

			// Speak the response if text-to-speech is enabled
			if (textToSpeechEnabled && synthesis) {
				speakText(assistantMessage.content);
			}

			// Update proposals if analysis was created
			if (data.analysis && data.analysis.proposals) {
				proposals = data.analysis.proposals;
			}

			// Reload participants count
			loadSessionData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
		} finally {
			loading = false;
		}
	}

	function startListening() {
		if (!recognition || isListening) return;

		error = '';
		isListening = true;
		recognition.start();
	}

	function stopListening() {
		if (!recognition || !isListening) return;

		recognition.stop();
		isListening = false;
	}

	function speakText(text: string) {
		if (!synthesis) return;

		synthesis.cancel();

		const utterance = new SpeechSynthesisUtterance(text);
		utterance.rate = 1.0;
		utterance.pitch = 1.0;
		utterance.volume = 1.0;

		utterance.onstart = () => {
			isSpeaking = true;
		};

		utterance.onend = () => {
			isSpeaking = false;
		};

		utterance.onerror = () => {
			isSpeaking = false;
		};

		synthesis.speak(utterance);
	}

	function stopSpeaking() {
		if (synthesis) {
			synthesis.cancel();
			isSpeaking = false;
		}
	}

	function formatDateTime(dateTime: string) {
		return new Date(dateTime).toLocaleString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			timeZoneName: 'short'
		});
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function copySessionCode() {
		navigator.clipboard.writeText(sessionCode);
	}

	function leaveSession() {
		localStorage.removeItem('cf_ai_scheduler_sessionCode');
		localStorage.removeItem('cf_ai_scheduler_userId');
		localStorage.removeItem('cf_ai_scheduler_userName');
		localStorage.removeItem('cf_ai_scheduler_userEmail');
		window.location.reload();
	}

	function exportToGoogleCalendar(proposal: TimeProposal, sessionTitle: string) {
		// Get emails of participants who are AVAILABLE for this time
		const availableParticipantsWithEmails = participants
			.filter(p => {
				// Include if they have an email AND are in the available list for this proposal
				return p.email && proposal.availableParticipants.includes(p.name);
			});

		const emailList = availableParticipantsWithEmails.map(p => p.email).join(',');

		// Format dates for Google Calendar (YYYYMMDDTHHmmssZ format)
		const startDate = new Date(proposal.dateTime);
		const endDate = new Date(startDate.getTime() + proposal.duration * 60000); // Add duration in milliseconds

		const formatGoogleDate = (date: Date) => {
			return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
		};

		// Build description with availability details and email list
		let description = `AI-Powered Group Scheduling\n\n`;
		description += `Match Score: ${proposal.score}%\n\n`;
		description += `Reasoning: ${proposal.reasoning}\n\n`;

		if (proposal.availableParticipants.length > 0) {
			description += `✓ Available Participants:\n`;
			proposal.availableParticipants.forEach(name => {
				const participant = participants.find(p => p.name === name);
				if (participant?.email) {
					description += `  - ${name} (${participant.email})\n`;
				} else {
					description += `  - ${name}\n`;
				}
			});
			description += '\n';
		}

		if (proposal.unavailableParticipants.length > 0) {
			description += `✗ Unavailable:\n${proposal.unavailableParticipants.map(name => `  - ${name}`).join('\n')}\n\n`;
		}

		if (availableParticipantsWithEmails.length > 0) {
			description += `Participant Emails (copy to add as guests):\n${emailList}\n\n`;
		}

		description += `Created via cf_ai_group_scheduler`;

		// Build Google Calendar URL
		const params = new URLSearchParams({
			action: 'TEMPLATE',
			text: sessionTitle || 'Scheduled Meeting',
			dates: `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`,
			details: description,
		});

		// Note: Google Calendar's URL template doesn't reliably add guests automatically
		// The emails are included in the description for easy copying
		if (emailList) {
			params.append('add', emailList);
		}

		const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
		window.open(url, '_blank');

		// Show helpful message if there are emails
		if (availableParticipantsWithEmails.length > 0) {
			setTimeout(() => {
				alert(`📋 Tip: If guests aren't auto-added, you can copy their emails from the event description:\n\n${emailList}`);
			}, 500);
		}
	}
</script>

<div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
	<div class="container mx-auto max-w-7xl p-4 md:p-8">
		{#if view === 'welcome'}
			<!-- Welcome Screen -->
			<div class="flex items-center justify-center min-h-[80vh]">
				<div class="bg-white rounded-2xl shadow-2xl p-12 max-w-2xl w-full">
					<div class="text-center mb-8">
						<h1 class="text-5xl font-bold text-gray-900 mb-4">AI Group Scheduler</h1>
						<p class="text-xl text-gray-600">Collaborate with others to find the perfect meeting time using AI</p>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<button
							onclick={() => view = 'create'}
							class="p-8 border-2 border-blue-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
						>
							<div class="text-5xl mb-4">➕</div>
							<h3 class="text-2xl font-semibold mb-2 group-hover:text-blue-600">Create Session</h3>
							<p class="text-gray-600">Start a new scheduling session and invite others</p>
						</button>

						<button
							onclick={() => view = 'join'}
							class="p-8 border-2 border-green-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all group"
						>
							<div class="text-5xl mb-4">🔗</div>
							<h3 class="text-2xl font-semibold mb-2 group-hover:text-green-600">Join Session</h3>
							<p class="text-gray-600">Join an existing session with a code</p>
						</button>
					</div>

					<div class="mt-8 p-6 bg-blue-50 rounded-xl">
						<h4 class="font-semibold text-gray-900 mb-2">How it works:</h4>
						<ol class="text-sm text-gray-700 space-y-2">
							<li>1. Create or join a scheduling session</li>
							<li>2. Share your availability through natural conversation</li>
							<li>3. AI analyzes everyone's availability and suggests times</li>
							<li>4. Finalize a time that works for everyone</li>
						</ol>
					</div>
				</div>
			</div>

		{:else if view === 'create'}
			<!-- Create Session -->
			<div class="flex items-center justify-center min-h-[80vh]">
				<div class="bg-white rounded-2xl shadow-2xl p-12 max-w-xl w-full">
					<button
						onclick={() => view = 'welcome'}
						class="text-gray-600 hover:text-gray-900 mb-6"
					>
						← Back
					</button>

					<h2 class="text-3xl font-bold mb-8">Create Scheduling Session</h2>

					{#if error}
						<div class="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
							{error}
						</div>
					{/if}

					<div class="space-y-6">
						<div>
							<label for="sessionTitle" class="block text-sm font-medium text-gray-700 mb-2">
								Meeting Title
							</label>
							<input
								id="sessionTitle"
								type="text"
								bind:value={sessionTitle}
								placeholder="e.g., Team Planning Meeting"
								class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
							/>
						</div>

						<button
							onclick={createSession}
							disabled={loading || !sessionTitle.trim()}
							class="w-full py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold text-lg"
						>
							{loading ? 'Creating...' : 'Create Session'}
						</button>
					</div>
				</div>
			</div>

		{:else if view === 'join'}
			<!-- Join Session -->
			<div class="flex items-center justify-center min-h-[80vh]">
				<div class="bg-white rounded-2xl shadow-2xl p-12 max-w-xl w-full">
					<button
						onclick={() => view = 'welcome'}
						class="text-gray-600 hover:text-gray-900 mb-6"
					>
						← Back
					</button>

					<h2 class="text-3xl font-bold mb-8">Join Scheduling Session</h2>

					{#if error}
						<div class="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
							{error}
						</div>
					{/if}

					<div class="space-y-6">
						<div>
							<label for="joinCode" class="block text-sm font-medium text-gray-700 mb-2">
								Session Code
							</label>
							<input
								id="joinCode"
								type="text"
								bind:value={joinCode}
								placeholder="e.g., ABC123"
								class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent uppercase"
								style="text-transform: uppercase"
							/>
						</div>

						<div>
							<label for="userName" class="block text-sm font-medium text-gray-700 mb-2">
								Your Name
							</label>
							<input
								id="userName"
								type="text"
								bind:value={userName}
								placeholder="e.g., John Doe"
								class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
							/>
						</div>

						<div>
							<label for="userEmail" class="block text-sm font-medium text-gray-700 mb-2">
								Your Email <span class="text-gray-500 text-xs">(optional, for calendar invites)</span>
							</label>
							<input
								id="userEmail"
								type="email"
								bind:value={userEmail}
								placeholder="e.g., john@example.com"
								class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
							/>
						</div>

						<button
							onclick={joinSession}
							disabled={loading || !joinCode.trim() || !userName.trim()}
							class="w-full py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold text-lg"
						>
							{loading ? 'Joining...' : 'Join Session'}
						</button>
					</div>
				</div>
			</div>

		{:else if view === 'session' && !inSession && isCreator}
			<!-- Creator Name Input -->
			<div class="flex items-center justify-center min-h-[80vh]">
				<div class="bg-white rounded-2xl shadow-2xl p-12 max-w-xl w-full">
					<h2 class="text-3xl font-bold mb-4">Session Created!</h2>
					<p class="text-gray-600 mb-8">Your session code is:</p>

					<div class="flex items-center gap-4 mb-8">
						<div class="flex-1 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
							<p class="text-4xl font-mono font-bold text-center tracking-widest text-blue-600">
								{sessionCode}
							</p>
						</div>
						<button
							onclick={copySessionCode}
							class="px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
							title="Copy code"
						>
							📋 Copy
						</button>
					</div>

					<p class="text-sm text-gray-600 mb-6">Share this code with others to invite them to the session.</p>

					{#if error}
						<div class="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
							{error}
						</div>
					{/if}

					<div class="space-y-6">
						<div>
							<label for="creatorName" class="block text-sm font-medium text-gray-700 mb-2">
								Your Name
							</label>
							<input
								id="creatorName"
								type="text"
								bind:value={userName}
								placeholder="e.g., John Doe"
								class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
							/>
						</div>

						<div>
							<label for="creatorEmail" class="block text-sm font-medium text-gray-700 mb-2">
								Your Email <span class="text-gray-500 text-xs">(optional, for calendar invites)</span>
							</label>
							<input
								id="creatorEmail"
								type="email"
								bind:value={userEmail}
								placeholder="e.g., john@example.com"
								class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
							/>
						</div>

						<button
							onclick={joinAsCreator}
							disabled={loading || !userName.trim()}
							class="w-full py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold text-lg"
						>
							{loading ? 'Joining...' : 'Continue to Session'}
						</button>
					</div>
				</div>
			</div>

		{:else if view === 'session' && inSession}
			<!-- Main Session View -->
			<header class="mb-6">
				<div class="bg-white rounded-lg shadow p-6">
					<div class="flex justify-between items-start">
						<div>
							<h1 class="text-3xl font-bold text-gray-900 mb-2">
								Scheduling Session
							</h1>
							<div class="flex items-center gap-4 text-sm text-gray-600">
								<span>Code: <span class="font-mono font-bold text-blue-600">{sessionCode}</span></span>
								<button
									onclick={copySessionCode}
									class="text-blue-600 hover:text-blue-800"
									title="Copy session code"
								>
									📋 Copy
								</button>
								<span>|</span>
								<span>Logged in as: <span class="font-semibold">{userName}</span></span>
							</div>
						</div>
						<button
							onclick={leaveSession}
							class="px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
						>
							Leave Session
						</button>
					</div>
				</div>
			</header>

			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<!-- Chat Interface -->
				<div class="lg:col-span-2 bg-white rounded-lg shadow-lg p-6">
					<div class="flex justify-between items-center mb-4">
						<h2 class="text-2xl font-semibold">Conversation</h2>
						<div class="flex gap-2">
							{#if voiceEnabled}
								<label class="flex items-center gap-2 text-sm">
									<input type="checkbox" bind:checked={speechToTextEnabled} class="rounded" />
									Voice Input
								</label>
								<label class="flex items-center gap-2 text-sm">
									<input type="checkbox" bind:checked={textToSpeechEnabled} class="rounded" />
									Voice Output
								</label>
							{/if}
						</div>
					</div>

					<!-- Messages -->
					<div class="h-96 overflow-y-auto mb-4 space-y-4 p-4 bg-gray-50 rounded-lg">
						{#if messages.length === 0}
							<div class="text-center text-gray-500 py-8">
								<p class="mb-2">Share your availability with the AI</p>
								<p class="text-sm">Try: "I'm available Monday and Tuesday afternoons"</p>
							</div>
						{/if}

						{#each messages as message}
							<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
								<div class="max-w-[80%] {message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-gray-900 border'} rounded-lg px-4 py-2 shadow">
									<p class="text-sm font-medium mb-1">{message.role === 'user' ? userName : 'AI Coordinator'}</p>
									<p class="whitespace-pre-wrap">{message.content}</p>
								</div>
							</div>
						{/each}

						{#if loading}
							<div class="flex justify-start">
								<div class="bg-white text-gray-900 rounded-lg px-4 py-2 shadow border">
									<p class="text-sm font-medium mb-1">AI Coordinator</p>
									<p>Thinking...</p>
								</div>
							</div>
						{/if}
					</div>

					<!-- Error Display -->
					{#if error}
						<div class="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
							{error}
						</div>
					{/if}

					<!-- Input Area -->
					<div class="flex gap-2">
						<textarea
							bind:value={prompt}
							onkeypress={handleKeyPress}
							placeholder="Share your availability..."
							disabled={loading || isListening}
							class="flex-1 p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
							rows="2"
						></textarea>

						<div class="flex flex-col gap-2">
							{#if voiceEnabled && speechToTextEnabled}
								<button
									onclick={isListening ? stopListening : startListening}
									disabled={loading}
									class="px-4 py-2 {isListening ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
									title={isListening ? 'Stop listening' : 'Start voice input'}
								>
									{isListening ? '🔴' : '🎤'}
								</button>
							{/if}

							<button
								onclick={sendMessage}
								disabled={loading || !prompt.trim() || isListening}
								class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
							>
								Send
							</button>
						</div>
					</div>

					{#if isSpeaking}
						<div class="mt-2 flex items-center gap-2">
							<span class="text-sm text-gray-600">Speaking...</span>
							<button
								onclick={stopSpeaking}
								class="text-sm text-blue-600 hover:text-blue-800"
							>
								Stop
							</button>
						</div>
					{/if}
				</div>

				<!-- Sidebar: Participants & Proposals -->
				<div class="space-y-6">
					<!-- Participants -->
					<div class="bg-white rounded-lg shadow-lg p-6">
						<h2 class="text-xl font-semibold mb-4">Participants</h2>
						<div class="space-y-2">
							{#if participants.length === 0}
								<p class="text-gray-500 text-sm text-center py-4">Loading participants...</p>
							{:else}
								{#each participants as participant}
									<div class="p-3 bg-gray-50 rounded-lg">
										<p class="font-medium">{participant.name}</p>
										<p class="text-xs text-gray-500">Joined {new Date(participant.joinedAt).toLocaleTimeString()}</p>
									</div>
								{/each}
							{/if}
						</div>
					</div>

					<!-- Time Proposals -->
					<div class="bg-white rounded-lg shadow-lg p-6">
						<h2 class="text-xl font-semibold mb-4">Proposed Times</h2>
						<div class="space-y-3">
							{#if proposals.length === 0}
								<p class="text-gray-500 text-sm text-center py-4">
									No proposals yet. Share your availability to get started!
								</p>
							{:else}
								{#each proposals as proposal}
									<div class="border rounded-lg p-4 hover:shadow-md transition-shadow">
										<div class="flex justify-between items-start mb-2">
											<div>
												<p class="font-semibold">{formatDateTime(proposal.dateTime)}</p>
												<p class="text-sm text-gray-600">{proposal.duration} minutes</p>
											</div>
											<div class="text-right">
												<div class="inline-block px-2 py-1 rounded text-xs font-semibold {proposal.score === 100 ? 'bg-green-100 text-green-800' : proposal.score >= 75 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
													{proposal.score}% match
												</div>
											</div>
										</div>

										<p class="text-xs text-gray-600 mb-3">{proposal.reasoning}</p>

										{#if proposal.availableParticipants.length > 0}
											<div class="mb-2">
												<p class="text-xs font-medium text-green-700">✓ Available:</p>
												<p class="text-xs text-gray-600 ml-3">{proposal.availableParticipants.join(', ')}</p>
											</div>
										{/if}

										{#if proposal.unavailableParticipants.length > 0}
											<div class="mb-2">
												<p class="text-xs font-medium text-red-700">✗ Unavailable:</p>
												<p class="text-xs text-gray-600 ml-3">{proposal.unavailableParticipants.join(', ')}</p>
											</div>
										{/if}

										<div class="mt-3">
											<button
												onclick={() => exportToGoogleCalendar(proposal, sessionTitle)}
												class="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium flex items-center justify-center gap-2"
											>
												<span>📅</span>
												Add to Google Calendar
											</button>
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
