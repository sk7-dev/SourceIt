Design a full User Portal for SourceIT, matching the same visual system as my existing login/register page and Publisher Dashboard.

Platform context:
SourceIT is a blockchain-based news verification platform. The Publisher side already exists and includes article publishing, status tracking, version history, edit transparency, media/evidence management, and blockchain history. Now create the User side for ordinary readers who want to verify news articles, inspect trust signals, compare versions, and decide whether to trust or share content.

Visual style:
- Match the exact style of my current SourceIT product
- Light grey-blue background
- White rounded cards
- Minimal, polished, trustworthy startup feel
- Soft shadows, subtle borders
- Strong but clean typography
- Professional and transparent, not flashy
- Desktop-first responsive dashboard layout

Main goal of the User Portal:
This is not a content management dashboard. It is a verification and trust portal for readers.
The UI should help users:
- verify an article
- see whether it is authentic, updated, disputed, or not found
- inspect publisher credibility
- compare article versions
- review supporting media/evidence
- view blockchain-backed integrity details in a reader-friendly way
- save articles and track updates

Overall structure:
Create a left sidebar + top header + main dashboard layout.

Sidebar navigation:
Include:
- SourceIT logo / product name
- small role badge: Reader or User
- nav items:
  - Dashboard
  - Verify Article
  - Saved Articles
  - Updates & Alerts
  - Trusted Publishers
  - Profile
  - Settings
- highlight Dashboard as active
- logout button at the bottom

Top header:
Include:
- welcome text, such as:
  “Welcome back, Sarah”
- subtitle:
  “Verify article authenticity, inspect updates, and follow trusted publishers”
- optional notification bell
- user profile avatar
- optional primary button:
  “Verify New Article”

Main dashboard content:
Build the dashboard around these major sections:

1. Hero verification section
This is the most important section on the page.
Create a large, prominent card called:
- Verify Article

Include multiple verification methods:
- Search by title
- Paste article URL
- Paste article text
- Optional future action: Upload screenshot

Design this as a premium verification input module with:
- segmented tabs or input mode selector
- large input field
- Verify Now button
- subtle helper text like:
  “Check whether an article is authentic, updated, disputed, or missing from the registry.”

Optional note:
- “Every registered version is preserved with transparent change history.”

2. Quick trust result preview cards
Below the hero section, create 3 or 4 compact cards that preview possible trust results.
Examples:
- Authentic
- Authentic, Updated
- Disputed
- Not Found

Each card should have:
- icon
- status label
- short explanation
- subtle status color coding
Keep the design elegant and easy to scan.

3. Recently viewed / saved articles
Create a section called:
- Recently Viewed
or
- Recently Verified

Show article cards or a compact list with:
- article title
- publisher
- trust status badge
- last checked date
- credibility score
- save/bookmark icon

Use realistic example content.

4. Articles with recent changes
Create a section called:
- Articles with Recent Updates

This should highlight articles that were edited after publication.
Each item can include:
- title
- publisher
- old version → new version
- short change note
- last updated timestamp
- action button: Compare Changes

This section is very important because the product is about transparency over edits.

5. Trusted publishers section
Create a card or horizontal list called:
- Trusted Publishers

Each publisher card should show:
- publisher name
- verified badge
- credibility score
- coverage categories
- transparency level
- follow button

This should help users evaluate the source behind the article.

6. Learning / explainer card
Create a compact educational card such as:
- How SourceIT Works
or
- Before You Share

Content can explain:
- check if the article was updated
- review publisher credibility
- inspect supporting evidence
- view disputes or reviewer notes
- compare versions before sharing

This section should feel helpful and trust-building.

7. Personal verification stats
Add a smaller card showing user-side activity, such as:
- Articles Verified
- Saved Articles
- Updates Followed
- Trusted Publishers Followed

Keep this lightweight compared to the publisher analytics.

Create a second major screen in the same design system:
VERIFICATION RESULT PAGE

This is the most important user-facing detail page.
Design a full page that appears after the user verifies a specific article.

Page title example:
- Verification Result

Main article header:
Show:
- article title
- publisher name
- published date
- last updated date
- current version
- trust status badge
- optional dispute/update badge
- save/bookmark button
- share button

Example trust statuses:
- Authentic
- Authentic, Updated
- Authentic, Under Review
- Disputed
- Publisher Unverified
- Not Found

Trust summary card:
Create a prominent result card that explains the outcome in plain language.

Example:
- Status: Authentic, Updated
- Explanation:
  “This article is registered in SourceIT, currently matches version 2.0, and has transparent edit history. The publisher is verified and supporting evidence is attached.”

Add a section called:
- Why this result?

Include bullet-style trust reasons such as:
- Article exists in SourceIT registry
- Current version matches registered record
- Original and updated versions are preserved
- Publisher is verified
- 3 supporting files attached
- 1 reviewer note available

Version history section:
Create a section called:
- Version History

Show:
- v1.0 Original
- v1.1 Minor correction
- v2.0 Current

Each version item should include:
- timestamp
- short change summary
- compare button
- view version button

Comparison section:
Create a side-by-side version comparison area called:
- Compare Changes

Show:
- Previous version on the left
- Current version on the right
- changed text highlighted
- reader-friendly note explaining what changed

Example note:
- “2 major changes detected: source year updated and temperature figures revised using newer evidence.”

Evidence & media section:
Create a section called:
- Supporting Evidence

Include:
- PDFs
- screenshots
- source documents
- images/videos
- file type labels
- small notes like:
  - Added in v2.0
  - Archived
  - Reviewer referenced
- action buttons like View File or Open Evidence

Make this reader-friendly and organized, not overly technical.

Publisher credibility card:
Create a right-side or secondary card called:
- Publisher Credibility

Show:
- publisher name
- verified status
- credibility score
- transparency level
- categories covered
- correction history summary
- follow publisher button

Reviewer notes / community review section:
Create a card called:
- Reviewer Notes
or
- Independent Review

Show:
- reviewer status labels
- short comments
- dispute note if present
- fact-check summary if available

Reader-friendly blockchain section:
Create a section called:
- Integrity Record

Do not make it too technical at first.
Show:
- Registered on-chain
- Last update recorded
- Version trail preserved
- Proof available

Then include an expandable or secondary area with:
- current hash
- previous hash
- timestamp
- chain confirmation state
- button: View Full Blockchain Proof

Create a third optional screen in the same style:
SAVED ARTICLES / WATCHLIST PAGE

Include:
- Saved Articles
- Followed publishers
- Articles with new updates
- alert badges
- filter by trust status
- remove from saved list
- compare newly updated version

Recommended UI tone:
The reader side should feel:
- informative
- reassuring
- transparent
- easy to understand
- verification-first
- less technical than the publisher dashboard
- focused on trust decisions, not content management

Design priorities:
- Verification input should be the main hero feature
- Trust result should be easy for normal users to understand
- Version comparison and update transparency should be central
- Evidence and publisher credibility should be visible
- Blockchain proof should be available but not overwhelming
- Keep the experience elegant and highly scannable

Important distinction:
This should not feel like a newsroom dashboard or admin system.
It should feel like:
- a news verification center
- a trust and transparency portal
- a reader-facing authenticity checker
- a blockchain-backed accountability interface

Output:
Generate a cohesive multi-screen User Portal UI in Figma style, consistent with the SourceIT login and Publisher dashboard already built.