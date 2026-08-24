# RayFox Private Results and Server Copy Design

## Goal

Keep Slash Command results private without creating DM spam, and make every official RayName Discord channel easy to scan and act on.

## Approved behavior

- Immediate Slash Command results remain Discord ephemeral responses (`flags: 64`), visible only to the invoking member.
- Important delayed verification outcomes are sent as direct messages by RayFox.
- A failed DM must never undo an approved or rejected verification result.
- Renewal and VIP notifications are not invented before a truthful provider-backed event source exists.
- Official channel topics, pinned guidance, and RayName-authored starter messages may be improved.
- Member conversations, support questions, showcases, reactions, and bot history are out of scope.

## Copy system

- Use native, young, official English.
- Start official guidance with a short heading.
- Bold the main action and safety-critical phrases.
- Use channel mentions for internal navigation.
- Use masked Markdown links for external destinations.
- Keep each channel purpose-specific; do not paste an identical template everywhere.

## Validation

- Automated tests prove immediate results stay ephemeral and approval/rejection outcomes use the DM REST flow.
- Browser inspection proves each edited channel still exists, contains the intended official guidance, and preserves member content.

