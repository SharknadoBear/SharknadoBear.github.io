---
permalink: false
eleventyExcludeFromCollections: true
---

# Bear portrait provenance

- **File:** `bear-avatar.png`
- **Updated:** October 20, 2026
- **Source:** Bear's supplied screenshot, preserved in `references/avatar-screenshot-source.png` in the source package.
- **Processing:** OpenAI image editing removed the screenshot interface and reconstructed a square, higher-resolution portrait from the small reference. It preserves the source's brown bear, black glasses, open-mouth expression, and tan check shirt. Reconstructed detail is generated, not recovered original photographic detail.
- **Site setting:** `avatarTemporary: false` in `src/_data/site.json`. To replace the portrait later, update `avatar` and `avatarAlt` there.
- **Earlier artwork:** The unused temporary watercolor stand-in is preserved in `references/bear-avatar-placeholder.png`; it is not published.

## Editing prompt

```text
Edit the provided small screenshot into a clean square website avatar portrait. Keep this SAME brown bear, same round head and facial features, same slightly open mouth and expression, same black rectangular eyeglasses, same tan Burberry-style check shirt (black, cream, red plaid). Preserve the photographic character and tight head-and-shoulders composition. Remove screenshot UI only: remove the dark app surround, blue circular border, and gray pencil/edit button at top-right. Reconstruct the tiny obscured patch naturally. Extend the circular portrait corners to a plain warm cream backdrop so the final image is a full square image without a circle or frame. Gently improve clarity from the low-resolution source without redesigning the character or inventing accessories. No text, logos, watermarks, drawn border, or interface elements. Do not turn into a plush toy or illustration. Aim for faithful cleanup of the source bear portrait.
```
