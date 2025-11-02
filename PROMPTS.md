# AI Prompts Documentation

This document describes all AI prompts used in the cf_ai_group_scheduler application, including both **runtime system prompts** (prompts the app uses) and **development prompts** (prompts used to build the app).

**📝 For User Development Prompts**: See [USER_PROMPTS.md](./USER_PROMPTS.md) for the complete list of prompts I used with Claude Code to build this application.

## Table of Contents
1. [User Development Prompts](./USER_PROMPTS.md) - **Required Reading: How This App Was Built**
2. [Runtime System Prompts](#runtime-system-prompts) - Prompts the app uses
3. [Prompt Engineering Decisions](#prompt-engineering-decisions) - Design choices

---

## Runtime System Prompts

### Collaborative Scheduling Coordinator System Prompt

**Location**: `src/routes/api/chat/+server.ts` → `getCollaborativeSystemPrompt()`

**Purpose**: Instructs the AI on how to coordinate scheduling among multiple participants

**Dynamic Components**:
1. Current date and time (formatted in user's locale)
2. List of all participants in the session (names)
3. Total participant count

**Full Prompt**:
```javascript
You are an AI scheduling coordinator helping ${participantCount} people find a time to meet.

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
Provide at least 3 ranked time proposals if possible.
```

**Design Rationale**:
- **Context Awareness**: Includes current date/time and all participant names
- **Collaborative Coordinator**: AI understands it's mediating between multiple people
- **Progressive Information Gathering**: Collects availability from each participant individually
- **Transparency**: Clearly shows who's available/unavailable in proposals
- **Ranked Suggestions**: Scores help participants make informed decisions
- **JSON-based Actions**: Structured output for reliable proposal creation
- **Flexibility**: Can have individual conversations while maintaining session context

---

## Prompt Engineering Decisions

### Why This Collaborative Approach?

**1. Session-Based Architecture**
- **Decision**: One Durable Object per scheduling session, not per user
- **Reasoning**: Enables true collaboration, all participants share same session state
- **Trade-off**: More complex than single-user, requires session management

**2. Individual Conversation Histories**
- **Decision**: Each participant has their own conversation with the AI
- **Reasoning**: Privacy, personalization, easier for AI to track who said what
- **Implementation**: Durable Object stores separate history per participant

**3. Context-Rich System Prompt**
- **Decision**: Include all participant names and count in every prompt
- **Reasoning**: AI needs full context to coordinate effectively
- **Dynamic Generation**: System prompt generated fresh on each request with current date/time

**4. JSON Action Format for Proposals**
- **Decision**: Use JSON objects embedded in responses for creating time proposals
- **Reasoning**: Reliable detection, structured data for UI display, easy to parse
- **Alternative Considered**: Function calling API (not available in Workers AI yet)
- **Implementation**: Regex pattern matching to extract JSON from response

**5. Progressive Availability Collection**
- **Decision**: Wait for ALL participants before generating proposals
- **Reasoning**: Can't analyze overlaps without everyone's input
- **AI Behavior**: Encourages quiet participants, acknowledges each person's input

**6. Transparent Scoring System**
- **Decision**: Score proposals 0-100% based on participant availability
- **Reasoning**: Users can see trade-offs (100% = everyone, 66% = 2 of 3)
- **UI Impact**: Color-coded badges (green=100%, yellow=75-99%, red=<75%)

**7. Shareable Session Codes**
- **Decision**: 6-character alphanumeric codes (e.g., "ABC123")
- **Reasoning**: Easy to share verbally, memorable, sufficient uniqueness
- **Implementation**: Random generation using Math.random()

### Handling Edge Cases

**1. Not All Participants Responded**
- AI tracks who has/hasn't shared availability
- Encourages quiet participants: "We're still waiting to hear from Bob..."
- Doesn't create proposals until everyone responds

**2. No Common Availability**
- AI still generates proposals with lower scores
- Shows which participants are available for each option
- Allows for negotiation and flexibility

**3. Ambiguous Availability**
- AI asks clarifying questions: "Do you mean this Monday or next Monday?"
- Uses current date/time context for better understanding
- Relies on Llama 3.3's reasoning capabilities

**4. Session Rejoining**
- localStorage stores sessionCode, userId, userName, userEmail
- Automatic rejoin on page refresh
- Validates session still exists before rejoining

**5. JSON Parsing Errors**
- Regex pattern matching with try-catch
- Falls back to text response if JSON invalid
- Continues conversation naturally without breaking

---

## Example Prompt-Response Flows

### Example 1: Three-Person Scheduling

**Alice (Creator)**:
```
User: I'm free Monday and Tuesday afternoons
AI: Thanks, Alice! I've noted that you're available Monday and Tuesday afternoons.
    We're still waiting to hear from Bob and Charlie about their availability.
```

**Bob**:
```
User: I can only do Tuesday after 2pm
AI: Got it, Bob! Tuesday after 2pm works for you.
    We're still waiting to hear from Charlie.
```

**Charlie**:
```
User: Monday and Tuesday both work, prefer mornings
AI: Perfect! Now that everyone has shared their availability, let me analyze the overlaps...

[AI generates JSON with proposals]:
{
  "action": "analyze_availability",
  "analysis": {
    "participantAvailability": {
      "Alice": "Monday and Tuesday afternoons",
      "Bob": "Tuesday after 2pm",
      "Charlie": "Monday and Tuesday, prefer mornings"
    },
    "proposals": [
      {
        "dateTime": "2025-10-22T14:00:00Z",
        "duration": 60,
        "score": 100,
        "availableParticipants": ["Alice", "Bob", "Charlie"],
        "unavailableParticipants": [],
        "reasoning": "Tuesday afternoon works for everyone - Alice and Charlie are available afternoons, and Bob can do Tuesday after 2pm"
      },
      {
        "dateTime": "2025-10-21T13:00:00Z",
        "duration": 60,
        "score": 66,
        "availableParticipants": ["Alice", "Charlie"],
        "unavailableParticipants": ["Bob"],
        "reasoning": "Monday afternoon works for Alice and Charlie, but Bob is not available"
      }
    ]
  },
  "message": "I've found the following times that work for everyone..."
}
```

### Example 2: Clarifying Questions

**Participant**:
```
User: I'm available next week
AI: Thanks for sharing! Could you be more specific about which days next week work best for you?
    Are there particular times of day that are better?
```

**Participant**:
```
User: Monday through Wednesday, preferably mornings
AI: Perfect! So you're available Monday, Tuesday, and Wednesday mornings next week.
    I've noted that down. Thanks!
```

---

## Architecture Evolution

### Version 1: Single-User Scheduler (Original)
- **Prompt**: "You are an AI meeting scheduler assistant"
- **Architecture**: One Durable Object per user
- **Use Case**: Personal meeting management
- **Data Model**: User → Meetings

### Version 2: Collaborative Scheduler (Current)
- **Prompt**: "You are an AI scheduling coordinator helping X people find a time to meet"
- **Architecture**: One Durable Object per scheduling session
- **Use Case**: Group coordination and collaboration
- **Data Model**: Session → Participants → Availability → Proposals

**Key Changes**:
1. System prompt now includes participant context
2. AI acts as coordinator, not personal assistant
3. Tracks multiple users' availability simultaneously
4. Generates scored proposals instead of creating meetings directly
5. Session-based persistence instead of user-based

---

## Implemented Improvements

### Features Added During Development

1. **✅ Collaborative Architecture**
   - **Problem**: Originally single-user, needed multi-participant
   - **Solution**: Complete redesign to session-based model
   - **Impact**: True collaborative scheduling

2. **✅ Session Management**
   - **Feature**: Create/join flows with shareable codes
   - **Purpose**: Multiple people join same scheduling session
   - **Implementation**: 6-character session codes

3. **✅ Individual Conversation Histories**
   - **Feature**: Each participant has their own chat with AI
   - **Purpose**: Privacy and personalization
   - **Storage**: Per-participant history in Durable Object

4. **✅ Ranked Time Proposals**
   - **Feature**: Scored suggestions (0-100%)
   - **Purpose**: Transparency about availability overlaps
   - **UI**: Color-coded badges, available/unavailable lists

5. **✅ Session Persistence**
   - **Problem**: Data lost on page refresh
   - **Solution**: localStorage-based session info persistence
   - **Impact**: Users can refresh without losing session

6. **✅ SQLite Backend**
   - **Problem**: Free tier compatibility
   - **Solution**: Migrated to `new_sqlite_classes`
   - **Impact**: Works on Cloudflare free plan

7. **✅ Durable Object Export Fix**
   - **Problem**: SvelteKit doesn't re-export Durable Objects
   - **Solution**: Post-build script automation
   - **Impact**: Reliable builds every time

8. **✅ Response Parsing Fix**
   - **Problem**: "[object Object]" appearing instead of AI responses
   - **Solution**: Enhanced response parsing with multiple format fallbacks
   - **Impact**: Reliable text extraction from all response types

9. **✅ Date Context for AI**
   - **Problem**: AI doesn't understand "tomorrow" or relative dates
   - **Solution**: Dynamic system prompt generation with current date/time
   - **Impact**: AI correctly interprets relative dates

10. **✅ Email Collection**
    - **Feature**: Optional email field during session creation/join
    - **Purpose**: Enable calendar invites for meeting participants
    - **Storage**: Emails stored in participant data within Durable Object

11. **✅ Google Calendar Export**
    - **Feature**: One-click "Add to Google Calendar" button for each proposal
    - **Implementation**: Generates Google Calendar URL with event details, participant emails, and reasoning
    - **Limitation**: Emails included in description for easy copying (URL parameters don't reliably auto-add guests)
    - **Smart Filtering**: Only includes emails of available participants for that specific time slot

## Known Issues & Future Improvements

### Current Known Issues

**None at this time!** All reported issues have been resolved.

### Potential Future Enhancements

1. **Time Zone Awareness**
   - Add each participant's time zone to system prompt
   - Handle time zone conversions explicitly
   - Display times in each person's local time zone

2. **Real-time Updates**
   - Notify participants when someone shares availability
   - Live updates when proposals are generated
   - Use Server-Sent Events or WebSockets

3. **Proposal Negotiation**
   - Allow participants to vote on proposals
   - AI suggests alternatives if top choice doesn't work
   - Interactive proposal refinement

4. **Enhanced Calendar Integration**
   - Support for Outlook, Apple Calendar, and other calendar formats
   - Import existing calendar to detect conflicts
   - Automatic conflict detection
   - Automatic guest addition (improve beyond current URL-based approach)

5. **Meeting Templates**
   - Remember common meeting patterns (e.g., "weekly standup")
   - Suggest durations/locations based on meeting type
   - Quick rescheduling for recurring meetings

6. **User Authentication**
   - Replace localStorage userId with proper auth
   - Enable cross-device session sync
   - Persistent user profiles

7. **Advanced AI Features**
   - Suggest optimal meeting times based on patterns
   - Learn from past scheduling decisions
   - Detect urgency and prioritize accordingly

8. **Participant Notifications**
   - Email/SMS when session is created
   - Reminders to share availability
   - Notifications when proposals are ready

---

## Conclusion

The prompts in this application were designed to create a natural, collaborative interface for group scheduling while maintaining reliability through structured outputs. The **collaborative system prompt** is the core of the AI's behavior, dynamically incorporating participant context and current date/time to enable intelligent coordination.

The evolution from a single-user scheduler to a collaborative coordinator demonstrates the importance of:
- **Clear role definition** in system prompts
- **Dynamic context injection** (participants, dates)
- **Structured output formats** (JSON for actions)
- **Progressive information gathering** (collect from all before analyzing)
- **Transparency in proposals** (who's available, who's not)

All prompts were iteratively developed and tested to ensure:
- Natural conversation flow
- Reliable action detection
- Graceful error handling
- Context awareness across multiple participants
- Clear user feedback
- Collaborative coordination effectiveness
