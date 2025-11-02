# cf_ai_group_scheduler

An AI-powered **collaborative group scheduling** application built on Cloudflare's platform. Multiple participants can join a scheduling session, share their availability through natural conversation (chat or voice), and let the AI find the perfect meeting time for everyone.

## Overview

This application demonstrates a complete AI-powered collaborative scheduling solution using:

- **LLM**: Llama 3.3 70B via Cloudflare Workers AI
- **Workflow/Coordination**: SvelteKit + Cloudflare Workers + Durable Objects
- **User Input**: Chat and Voice (Web Speech API with speech-to-text and text-to-speech)
- **Memory/State**: Session-based Durable Objects for multi-user coordination and conversation history

**📝 Development Documentation**: See [USER_PROMPTS.md](./USER_PROMPTS.md) for all AI prompts used during development and [PROMPTS.md](./PROMPTS.md) for runtime AI system prompts and architectural decisions.

## Features

### Core Functionality
- 👥 **Collaborative Scheduling**: Multiple people join a single session to coordinate meeting times
- 🔗 **Shareable Session Codes**: Create a session and share a 6-character code (e.g., "ABC123") with participants
- 🤖 **AI Coordinator**: Llama 3.3 analyzes everyone's availability and suggests optimal meeting times
- 💬 **Individual Chat Interfaces**: Each participant has their own conversation with the AI
- 🎯 **Ranked Time Proposals**: AI provides multiple suggestions scored by participant availability (0-100%)
- 📧 **Email Collection**: Optional email collection for calendar invites
- 📅 **Google Calendar Export**: One-click export of any time proposal to Google Calendar
- 🎤 **Voice Input**: Speech-to-text for hands-free interaction
- 🔊 **Voice Output**: Text-to-speech AI responses
- 💾 **Persistent Sessions**: All conversations and proposals stored in SQLite-backed Durable Objects
- 🔄 **Session Persistence**: Automatically rejoin your session after refresh

### Technical Highlights
- Real-time AI responses via Cloudflare Workers AI
- Session-based architecture with multiple participants per Durable Object
- Serverless architecture with automatic scaling
- Low-latency edge computing
- Per-session isolated state using SQLite-backed Durable Objects
- Automatic post-build script to export Durable Objects
- Session persistence via browser localStorage
- Free tier compatible (uses SQLite storage backend)

## Running Instructions

### Prerequisites
- Node.js 20.19+ or 22.12+ (Vite requires these versions)
- A Cloudflare account (for deployment)

### Local Development

1. **Install dependencies**:
```bash
npm install
```

2. **Start the development server**:
```bash
npm run dev:wrangler
```
This will build the app and start Wrangler Pages dev server with all Cloudflare bindings (AI, Durable Objects, Assets).

3. **Open your browser**:
Navigate to the URL provided by Wrangler (typically `http://localhost:8788`)

**Alternative**: Use `npm run preview` (same as `dev:wrangler`)

**For UI-only development** (faster, but no AI/Durable Objects):
```bash
npm run dev
```

**Note**: Workers AI always accesses your Cloudflare account to run AI models, even in local development, which may incur usage charges.

### Deployment to Cloudflare

1. **Login to Cloudflare**:
```bash
npx wrangler login
```

2. **Deploy the application**:
```bash
npm run deploy
```

3. **Access your deployed app**:
After deployment, Wrangler will provide a URL like `https://cf_ai_group_scheduler.your-subdomain.pages.dev`

## How to Use

### Creating a Session

1. **Click "Create Session"** on the welcome screen
2. **Enter a meeting title** (e.g., "Team Planning Meeting")
3. **Share the generated session code** with other participants (e.g., "ABC123")
4. **Enter your name and email** (email is optional, used for calendar invites)
5. **Start sharing your availability** with the AI

### Joining a Session

1. **Click "Join Session"** on the welcome screen
2. **Enter the session code** shared by the session creator
3. **Enter your name and email** (email is optional, used for calendar invites)
4. **Start chatting with the AI** to share your availability

### Sharing Availability

Once in a session, have a natural conversation with the AI:

**Examples:**
- "I'm available Monday and Tuesday afternoons"
- "I can only do mornings this week, preferably Wednesday or Thursday"
- "I'm free all day Friday except between 2-4pm"
- "Any weekday after 3pm works for me"

The AI will:
- Acknowledge your availability
- Ask clarifying questions if needed
- Encourage other participants to share their availability
- Automatically analyze overlaps when everyone has responded

### Time Proposals

When all participants have shared their availability, the AI will:

1. **Generate ranked time proposals** with scores (0-100%)
2. **Show which participants are available/unavailable** for each time
3. **Provide reasoning** for each suggestion
4. **Allow one-click export to Google Calendar**

Each proposal shows:
- Date and time
- Duration
- Match score (% of participants available)
- List of available participants
- List of unavailable participants
- AI's reasoning
- **"Add to Google Calendar" button** - Creates a calendar event with participant emails included in the description. Google Calendar may not automatically add guests via URL parameters, but emails are provided for easy copying

### Voice Interface

1. **Enable Voice Input**: Check the "Voice Input" toggle (appears if your browser supports it)
2. **Click the 🎤 button** to start listening
3. **Speak your availability**, for example:
   - "I'm available Monday through Wednesday afternoons"
   - "I can only meet on Friday mornings"
4. **Enable Voice Output**: Check the "Voice Output" toggle to have the AI read responses aloud

### Session Management

**Data Persistence**:
- Your session code, user ID, name, and email are stored in browser localStorage
- All conversations and proposals persist across page refreshes
- Each session is stored in its own Durable Object

**Rejoining Sessions**:
- If you refresh the page, you'll automatically rejoin your last session
- You can leave a session and start/join a different one

**Email Privacy**:
- Emails are only used for Google Calendar invites
- Only participants who provided emails will be added to calendar events
- Emails are stored in the session's Durable Object

**Important**: If you clear your browser's localStorage or switch browsers, you'll need to rejoin using the session code.

## Project Structure

```
cf_ai_group_scheduler/
├── src/
│   ├── routes/
│   │   ├── +page.svelte              # Main UI (welcome, create, join, session views)
│   │   ├── +layout.svelte            # Layout wrapper
│   │   └── api/
│   │       ├── chat/+server.ts       # Chat API with collaborative AI logic
│   │       ├── session/+server.ts    # Session creation and retrieval
│   │       └── session/join/+server.ts # Join session endpoint
│   ├── lib/
│   │   ├── durable-objects/
│   │   │   └── MeetingScheduler.ts   # Durable Object for session state
│   │   └── index.ts
│   ├── hooks.server.ts               # Durable Object exports
│   └── app.d.ts                      # TypeScript definitions
├── scripts/
│   └── fix-worker-exports.js         # Post-build script for DO exports
├── wrangler.jsonc                    # Cloudflare Workers config
├── package.json
├── README.md                         # This file
├── PROMPTS.md                        # AI prompts documentation (runtime)
└── USER_PROMPTS.md                   # Development prompts used to build this app
```

## Architecture

### Components

1. **Frontend (SvelteKit)**:
   - Welcome screen with create/join options
   - Session creation and joining flows
   - Chat UI with message history for each participant
   - Voice input/output controls (Web Speech API)
   - Participants list display
   - Time proposals display with scoring
   - Built with Svelte 5 and Tailwind CSS
   - Session persistence via localStorage

2. **Backend (Cloudflare Workers)**:
   - API routes for chat, session creation, and joining
   - Integration with Workers AI (Llama 3.3)
   - Durable Objects coordination for multi-user sessions
   - Post-build script for worker exports

3. **Storage (SQLite-backed Durable Objects)**:
   - **Session-based storage**: One Durable Object per scheduling session
   - **Multiple participants per session**: Each with their own conversation history
   - **Time proposals storage**: Ranked suggestions generated by AI
   - **SQLite backend** for free tier compatibility
   - **Async KV API** for data access
   - **Session identification**: Using 6-character codes (e.g., "ABC123")

4. **AI (Workers AI)**:
   - Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
   - Collaborative scheduling coordinator
   - Context-aware responses with participant information
   - Availability extraction from natural language
   - JSON-based action detection for creating proposals
   - Current date/time awareness for relative date understanding

### Data Model

**Session**:
```typescript
{
  sessionCode: string;           // e.g., "ABC123"
  title: string;                 // e.g., "Team Planning Meeting"
  status: 'collecting' | 'analyzing' | 'finalized';
  participants: {
    [userId]: {
      userId: string;
      name: string;
      email?: string;            // Optional, for calendar invites
      availability: string;      // Extracted from conversation
      conversationHistory: Message[];
      joinedAt: string;
      lastActive: string;
    }
  };
  proposedTimes: TimeProposal[];
  finalizedTime?: TimeProposal;
}
```

**TimeProposal**:
```typescript
{
  id: string;
  dateTime: string;              // ISO 8601 format
  duration: number;              // minutes
  score: number;                 // 0-100 (% of participants available)
  availableParticipants: string[];
  unavailableParticipants: string[];
  reasoning: string;
}
```

### Data Flow

```
User Creates/Joins Session
    ↓
Generate/Retrieve Session Code
    ↓
Store in Durable Object (one per session)
    ↓
User Shares Availability (Chat/Voice)
    ↓
SvelteKit Frontend
    ↓
API Route (/api/chat)
    ↓
Durable Object (fetch participant history)
    ↓
Llama 3.3 AI (with all participants' context)
    ↓
AI Response + Availability Extraction
    ↓
Store in Participant's History
    ↓
Check if all participants responded
    ↓
Generate Time Proposals (JSON)
    ↓
Store Proposals in Durable Object
    ↓
Return Response + Proposals to UI
    ↓
Display + Speak (if enabled)
```

## Example Session Flow

### Session Creator (Alice):
1. Alice clicks "Create Session"
2. Enters title: "Sprint Planning"
3. Gets session code: "XYZ789"
4. Shares code with Bob and Charlie
5. Enters her name and availability: "I'm free Monday and Tuesday afternoons"

### Participant 1 (Bob):
1. Bob receives code "XYZ789" from Alice
2. Clicks "Join Session"
3. Enters code and name
4. Shares availability: "I can only do Tuesday after 2pm"

### Participant 2 (Charlie):
1. Charlie receives code "XYZ789" from Alice
2. Clicks "Join Session"
3. Enters code and name
4. Shares availability: "Monday and Tuesday both work, prefer mornings"

### AI Analysis:
Once all three participants have shared their availability:
1. AI detects everyone has responded
2. Analyzes overlaps:
   - Tuesday 2-5pm: All available (100% match)
   - Monday afternoon: Alice + Charlie (66% match)
   - Tuesday morning: Alice + Charlie (66% match)
3. Generates ranked proposals
4. Participants can export any time slot to Google Calendar

## Browser Compatibility

### Voice Features
- **Chrome/Edge**: Full support (recommended)
- **Safari**: Speech recognition support varies
- **Firefox**: Limited speech recognition support

If voice features aren't available, the app gracefully falls back to text-only mode.

## Troubleshooting

### "AI binding not available" or AI errors
- Workers AI requires real Cloudflare infrastructure
- **Solution**: Use Wrangler dev with proper bindings (see Running Instructions)
- Or deploy to Cloudflare: `npm run deploy`

### "SESSIONS binding not available"
- Durable Objects require Cloudflare Workers environment
- **Solution**: Ensure you built first (`npm run build`), then use Wrangler dev
- Ensure the post-build script ran successfully (check build output)

### "Durable Object class not exported"
- The post-build script should automatically fix this
- **Solution**: Run `npm run build` to trigger the fix script
- Check that `scripts/fix-worker-exports.js` exists

### Voice not working
- **"network" error**:
  - Requires HTTPS (localhost or deployed URL work)
  - Requires stable internet connection (uses Google's servers)
  - Grant microphone permissions when prompted
- **Browser compatibility**: Use Chrome or Edge for best support
- **Safari/Firefox**: Limited speech recognition support

### Can't rejoin session after refresh
- Session info is stored in browser localStorage
- **If session disappeared**: Check that localStorage isn't being cleared
- **Different browser/device**: You'll need to rejoin using the session code
- **Solution**: Use the same browser and don't clear localStorage
- **Manual rejoin**: Click "Leave Session" then use the session code to join again

### Session code not working
- Session codes are 6 alphanumeric characters (e.g., "ABC123")
- Codes are case-insensitive
- **Solution**: Verify you entered the correct code
- **If session doesn't exist**: The creator may have cleared their browser data, or the Durable Object may have been reset

### Free tier / SQLite migration errors
- Ensure `wrangler.jsonc` uses `new_sqlite_classes` not `new_classes`
- SQLite-backed Durable Objects are required for free tier

## Development Notes

- The app uses Svelte 5 with runes (`$state`, `$derived`, etc.)
- Tailwind CSS 4 for styling
- TypeScript for type safety
- Web Standards (Web Speech API) for voice features
- SQLite-backed Durable Objects (free tier compatible)
- Post-build script automatically exports Durable Objects
- Session-based architecture (multiple users per Durable Object)
- Session persistence via localStorage (browser-based)
- Each build runs `scripts/fix-worker-exports.js` automatically

## Collaborative Scheduling Workflow

The AI acts as a coordinator, not a participant. It:

1. **Greets each participant** individually as they join
2. **Asks for availability** in a natural, conversational way
3. **Acknowledges each person's input** and stores it mentally
4. **Tracks who has/hasn't shared** their availability
5. **Encourages quiet participants** to contribute
6. **Analyzes overlaps** only when everyone has responded
7. **Proposes multiple ranked options** with transparency about who's available
8. **Allows collaborative decision-making** through the UI

## License

MIT

## Additional Resources

- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [SvelteKit](https://kit.svelte.dev/)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
