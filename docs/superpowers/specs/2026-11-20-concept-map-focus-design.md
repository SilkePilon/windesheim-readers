# Concept map: focus redesign

Date: 2026-11-20. Size: small change (one student component). Follows `2026-11-20-reader-learning-design.md`.

## Why
The owner's verdict on the first version (v1.2.0) was that it is "not really usable or understandable". Three things go wrong:
- every link is drawn at once, so the map is a web of crossing lines;
- labels are cut off ("Subnetmask…", "VL…");
- there is no grouping beyond the week, so related ideas aren't visibly together.

## Approach (picked by the owner): focus map
Two other directions were considered and rejected: an outline with no drawing at all, and a single-concept "journey" view.

The focus map works like this:
- **Structure.** Week sections. Inside each week there is one compact card per lesson, with the lesson code and title and a mastery dot. Inside each lesson card, the concepts are chips that wrap onto new lines.
  - Labels are never truncated; a long label wraps to two lines.
  - Chips are coloured by the lesson's mastery, as now.
- **No lines by default.** The map at rest is a tidy grouped overview.
- **Focus on tap.** Tapping a concept selects it:
  - Its directly linked concepts get a highlight ring, and every other chip dims to about 35% opacity.
  - Only the selected concept's links are drawn: soft curves in an SVG overlay, computed from the chips' on-screen positions and recomputed on resize, scroll-into-view and selection.
  - Tapping the selected chip again, tapping empty space, or pressing Escape clears the focus.
- **Focus panel.** The panel is non-modal, so the map stays visible and scrollable:
  - **On phones** it is fixed at the bottom, above the floating dock, with a max height of about 45% of the screen and its own scrolling.
  - **On desktop** (md and up) it is a sticky panel beside the map.
  - **Contents:**
    - the concept label, its lesson ("Les 2.3 · IP-adressering") and its description;
    - its links as readable sentences, outgoing first: "→ *is nodig voor* **Routering**". Incoming links read "← **Netwerklaag** *verdeelt*".
    - "Open les 2.3", and a close button.
  - Tapping a related concept in the panel moves the focus to it and scrolls it into view.
- **Kept from v1.2.0:**
  - the week filter (above 40 concepts);
  - the mastery legend;
  - the always-present screen-reader list;
  - the data API.
  The Drawer/Dialog detail sheet is replaced by the panel.

## Constraints
- No new dependencies and no API changes.
- Mobile-first, light and dark themes, nl and en.
- AI and admin text is rendered only as text nodes.
- The map stays lazy-loaded inside the reader page chunk.
- The pure helpers are unit-tested:
  - grouping (week → lesson → concepts, in lesson position order);
  - the neighbour/relations list for a concept, with outgoing before incoming and no duplicates;
  - the curve path between two rects.

## Left to the builder
Exact spacing, the panel's animation, and the dim/ring styling within the design language.
