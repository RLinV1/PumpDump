## ADDED Requirements

### Requirement: Post snippets in the sentiment panel

The local live web view MAY show up to 5 post snippets per tone (at most 15 in total) from the top and latest samples. Each snippet is at most 140 characters and has a tone label, a possible-irony flag, its time and a link to the post on bsky.app. Tone count buttons filter the snippets by tone.

#### Scenario: Snippets are bounded
- **WHEN** a top or latest sample is returned
- **THEN** `posts` holds at most 5 snippets per tone, each at most 140 characters

#### Scenario: Author identifiers stay out
- **WHEN** a sample is returned or rendered
- **THEN** no author handle, display name, avatar or visible DID is present

#### Scenario: No text in mock or public deployments
- **WHEN** the API runs in mock mode or serves a public deployment
- **THEN** `posts` is empty and no post text is returned
