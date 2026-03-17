---
name: Group membership API — create, add, invite
description: createGroup signatures, addMembers variants, invite link pattern, and identifier kinds for Node.js and agent-sdk
type: reference
---

## Key line ranges

- `xmtp:8400-8500` — `createGroup` full section (Browser + Node signatures, React Native `newGroup` with options, `newGroupWithIdentities` for mobile only)
- `xmtp:8500-8600` — Optimistic group creation (`createGroupOptimistic`, `addMembers`, `publishMessages`)
- `xmtp:16264-16310` — Agent SDK group creation helpers (`createGroupWithAddresses`, `createGroup` by inbox ID, `createDmWithAddress`)
- `xmtp:16480-16520` — Agent SDK member management (`addMembersWithAddresses`, `removeMembersWithAddresses`, `group.addMembers`)
- `xmtp:10003-10003` — `addMembers` by inbox ID (all platforms)
- `xmtp:10029-10029` — `addMembersByIdentity` (React Native, Kotlin, Swift only — NOT Node)
- `xmtp:11319-11467` — Group invite link pattern (POST /groupInvite, GET /groupInvite/:id, POST /groupJoinRequest, manual approval flow)

## Node.js method signatures

```js
// Create group — node-sdk
const group = await client.conversations.createGroup(
  [inboxId1, inboxId2],   // inboxId[] — NOT typed identifier objects
  createGroupOptions       // optional
);

// Create group — agent-sdk helper (resolves addresses internally)
const group = await agent.createGroupWithAddresses(
  [address1, address2],
  createGroupOptions
);

// Add members
await group.addMembers([inboxId]);                          // by inbox ID
await ctx.addMembersWithAddresses(group, [address1]);       // by address (agent SDK)

// Remove members
await group.removeMembers([inboxId]);
await ctx.removeMembersWithAddresses(group, [address1]);
```

## Key facts

- `createGroupWithIdentifiers` does NOT exist in Node.js SDK
- `newGroupWithIdentities` exists for React Native/Kotlin/Swift only
- `addMembersByIdentity` exists for React Native/Kotlin/Swift only — not Node
- Node takes inbox ID strings throughout; address resolution happens via agent helpers
- Max group size: 250 members
- `IdentifierKind` enum (Ethereum=0, Passkey=1) is for the Signer interface, not group member lists

## Invite link pattern (no native XMTP URL scheme)

No `xmtp://` scheme exists. Invite links are app-hosted:

```
https://converse.xyz/invite/abcdefg   ← Converse example
https://app.xyz/invite/abcdefg        ← generic pattern
```

The invite ID is backend-generated and opaque. The backend does NOT need the XMTP group ID — the client stores the mapping locally. Flow:

1. `POST /groupInvite` → returns `{ id, linkUrl }`
2. `GET /groupInvite/:id` → returns metadata for landing page (groupName, groupImage, createdBy InboxId)
3. `POST /groupJoinRequest` → invitee submits request
4. Push notification to link creator → manual approve/reject
5. On approval, creator calls `group.addMembers([inviteeInboxId])`
