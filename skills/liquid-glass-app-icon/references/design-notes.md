# Design notes

Read this before drawing concepts and again before showing a round to the user.
These come from three shipped icons.

## Choosing a concept

- One idea per icon. If the glyph needs explaining, it is too busy.
- Check each concept against well-known icons. A white rounded rectangle with a play
  triangle reads as YouTube; change the proportions or add a second element.
- Ask the user for reference images early. A photo of the real object changed the
  concept more than three rounds of abstract options did.
- A third-party logo is usually a trademark. Say so when you propose it, and note the
  owner in `Icon/README.md`.

## Making it read at small sizes

- Judge the contact sheet at small size too. Details thinner than about 60 units on the
  1024 canvas disappear at 32 px.
- Size the main object so its label (letters in a lens, for example) is readable at 64 px.
- A detailed backdrop works when one large object sits on top of it. Code lines turned
  into texture at 32 px while the magnifying glass over them still read clearly.
- A chain reads best as face-on link, edge-on link (a plain bar), face-on link. Two
  overlapping face-on links merge into a blob.
- A shape that overflows a disc must contrast with the tile as well as with the disc.

## Color and glass

- A light-to-dark top-to-bottom gradient in the brand hue gives the glass something to refract.
- The tile shape is set by the system: a rounded square on macOS and iOS, a circle only
  on watchOS. For a round look, draw a disc layer inside the tile.

## Running a round with the user

- Show every round as a contact sheet with a recommendation and a short list of choices.
- Give the reason for the recommendation in one sentence.
- Offer "apply and finish" beside "apply and show me again", so a happy user can stop.
