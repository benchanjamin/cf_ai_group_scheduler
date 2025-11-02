# User Development Prompts

This document contains all the prompts I (the user) provided to Claude Code during the development of this project. This is required documentation for the Cloudflare AI assignment.

---

## Initial Project Setup

**Prompt 1 - Starting the Assignment**:
```
Optional Assignment Instructions: We plan to fast track review of candidates who complete an assignment to build a type of AI-powered application on Cloudflare. An AI-powered application should include the following components:
LLM (recommend using Llama 3.3 on Workers AI), or an external LLM of your choice
Workflow / coordination (recommend using Workflows, Workers or Durable Objects)
User input via chat or voice (recommend using Pages or Realtime)
Memory or state
Find additional documentation here.

IMPORTANT NOTE:
To be considered, your repository name must be prefixed with cf_ai_, must include a README.md file with project documentation and clear running instructions to try out components (either locally or via deployed link). AI-assisted coding is encouraged, but you must include AI prompts used in PROMPTS.md

All work must be original; copying from other submissions is strictly prohibited. -- I already have cloudflare workers ai - please walk me through this step by step and I'll provide any relevant info
```

**AI Response**: Step-by-step guidance on building AI meeting scheduler with all required components

---

## Feature Clarification & Architecture Decisions

**Prompt 2 - Confirming Feature Choices**:
```
[When asked about meeting types and voice features]
- Meeting Type: "Both types" (one-on-one and group meetings)
- Voice Features: "Voice-to-text input, Text-to-speech output, Voice commands"
```

**Prompt 3 - Understanding Durable Objects**:
```
why in Wrote 2 lines to src/lib/server/durable-objects.ts
```
**Follow-up**: `1` (to delete unnecessary file)

---

## Bug Fixes & Issues

**Prompt 4 - Deployment Error**:
```
after running npm run deploy, it says In order to use Durable Objects with a free plan, you must create a namespace using a `new_sqlite_classes` migration. [code: 10097]
```

**Prompt 5 - Voice Recognition Issue**:
```
Voice recognition error: network when trying to use voice input --- "Voice recognition error: network"
```

**Prompt 6 - Session Persistence Issue**:
```
History doesn't persist when i refresh the page? why? I have no meetings when I refresh
```

---

## Understanding Technical Concepts

**Prompt 7 - Learning About Durable Objects**:
```
what is the purpose of http://do/history
```

**Prompt 8 - Understanding ID Parameter**:
```
what does id mean [referring to: const id = platform.env.MEETINGS.idFromName(userId);]
```

**Prompt 9 - Understanding get() Method**:
```
in platform.env.MEETINGS.get(id);
```

---

## Major Architecture Pivot

**Prompt 10 - Revealing True Requirements** (THE BIG PIVOT):
```
ok but this app should be a way for 2 or more people to collaborate on which times they should meet up using the Llama 3.3
```

**AI Clarification Questions**:
- How should users join a scheduling session? → **"Shareable link/code"**
- What should users input for availability? → **"The LLM will best figure out what times they are free using their prompts and ask more questions if not sufficient enough (or could give options within the chat)"**
- How should AI suggest meeting times? → **"Both 2 and 3, falls back on 3 when 2 is not sufficient"** (Ranked suggestions + Interactive negotiation)

**Prompt 11 - Confirming Full Rebuild**:
```
[When presented with options A/B/C for architecture redesign]
Option B (Full Migration)
```

**Prompt 12 - Testing Strategy**:
```
[When asked about incremental vs full implementation]
Option B (Build and test what we have so far, then continue)
```

---

## Documentation & Final Touches

**Prompt 13 - Pre-Deployment Fixes**:
```
yes [when asked: "Would you like me to fix those two issues mentioned ("[object Object]" and missing date context) before you deploy?"]
```

**Prompt 14 - Documentation Update**:
```
make sure README.md and PROMPTS.md are up to date
```

**Prompt 15 - This Documentation**:
```
AI-assisted coding is encouraged, but you must include AI prompts used in PROMPTS.md - can you help me include the prompts i used for this project?
```

---

## Development Flow Summary

### Phase 1: Single-User MVP (Initial Build)
1. Set up Cloudflare Workers AI with Llama 3.3
2. Created Durable Objects for state storage
3. Built chat interface with voice support
4. Implemented text-to-speech and speech-to-text
5. Added session persistence with localStorage

### Phase 2: Bug Fixes & Improvements
1. Fixed SQLite migration for free tier
2. Resolved voice recognition network errors
3. Fixed session persistence across page refreshes
4. Fixed "[object Object]" response parsing
5. Added current date/time context to AI

### Phase 3: Collaborative Architecture (Major Redesign)
1. Realized app should be collaborative, not single-user
2. Redesigned Durable Objects for session-based storage
3. Changed from user-isolated to session-shared model
4. Updated all API routes for collaboration
5. Building new UI for multi-user sessions (in progress)

---

## Key Learning Moments

### Understanding Durable Objects
**User Question**: "what is the purpose of http://do/history"
**Learned**: It's an internal routing convention, not an actual HTTP URL. The domain doesn't matter, only the path for routing within the Durable Object's fetch() method.

### Understanding Deterministic IDs
**User Question**: "what does id mean"
**Learned**: `idFromName()` creates deterministic Durable Object IDs - same input always produces same ID, ensuring same user/session always connects to same DO instance.

### The Collaborative Pivot
**User Statement**: "ok but this app should be a way for 2 or more people to collaborate"
**Impact**: Complete architecture redesign from single-user to collaborative multi-participant scheduling system.

---

## Prompt Patterns That Worked Well

1. **Starting Broad**: "walk me through this step by step"
2. **Asking Why**: "why in..." / "what does... mean"
3. **Confirming Direction**: Choosing between Option A/B/C
4. **Revealing Requirements Progressively**: Starting simple, then clarifying the real goal
5. **Requesting Documentation**: "make sure X and Y are up to date"

---

## Total Development Time Estimate

- **Initial MVP**: ~2-3 hours (guided by AI)
- **Bug Fixes**: ~1 hour
- **Collaborative Redesign**: ~2 hours (in progress)
- **Total**: ~5-6 hours with AI assistance

---

## Files Created/Modified During Development

### Created:
- `src/lib/durable-objects/MeetingScheduler.ts`
- `src/hooks.server.ts`
- `src/routes/api/chat/+server.ts`
- `src/routes/api/session/+server.ts`
- `src/routes/api/session/join/+server.ts`
- `scripts/fix-worker-exports.js`
- `README.md` (comprehensive)
- `PROMPTS.md` (this file)
- `USER_PROMPTS.md` (user prompts)

### Modified:
- `wrangler.jsonc` (Durable Objects config, migrations)
- `package.json` (post-build script)
- `tsconfig.json` (Cloudflare types)
- `src/app.d.ts` (TypeScript bindings)
- `src/routes/+page.svelte` (UI rebuild)

---

## Conclusion

This project was built entirely through conversational AI assistance (Claude Code). The development process involved:

1. **Iterative Requirements Gathering**: Starting with basic requirements and progressively clarifying
2. **Technical Learning**: Understanding Cloudflare-specific concepts through questioning
3. **Architecture Evolution**: From single-user to collaborative system
4. **Bug Fixing**: Addressing real deployment and runtime issues
5. **Documentation**: Maintaining comprehensive docs throughout

All prompts above represent the actual user input that led to this application's development.