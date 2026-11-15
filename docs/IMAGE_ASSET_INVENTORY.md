# Image asset inventory

Images are referenced by key (`mobile/src/assets/images.ts`, `ProductImage`). **Replacing a file with the same name changes the picture without touching any product logic.** Every image has a placeholder while loading and a fallback icon on error.

## Cakes — current state (NOT acceptable for launch)
| Asset | Used by | Source | Real size | Status |
|---|---|---|---|---|
| `cake-chocolate.jpg` | Chocolate Truffle, Birthday Special Chocolate, Special Occasion | AI-generated (Canva) | 200×200 preview, upscaled to 640 | **LOW-RES, SHARED** |
| `cake-black-forest.jpg` | Black Forest | AI-generated | 200×200 → 640 | LOW-RES |
| `cake-white-forest.jpg` | White Forest, Fresh Berry Cream | AI-generated | 200×200 → 640 | LOW-RES, SHARED |
| `cake-red-velvet.jpg` | Red Velvet, Signature Designer | AI-generated | 200×200 → 640 | LOW-RES, SHARED |
| `cake-butterscotch.jpg` | Butterscotch Crunch | AI-generated | 200×200 → 640 | LOW-RES |

The generator originals are 1264×1264, but the available tools only exposed a 200 px preview and Canva's image quota ran out after 5 images. **The files are upscaled previews, not original-quality exports** — do not present them as final photography.

## Still needed (unique, high-resolution, 1:1, ≥1200×1200, JPEG/WebP ≤ 300 KB after optimisation)
| # | Product | Needs |
|---|---|---|
| 1 | Chocolate Truffle Cake | own photo (+ 2–3 angles for the gallery) |
| 2 | Birthday Special Chocolate Cake | own photo (birthday styling) |
| 3 | Black Forest Cake | hi-res of existing subject |
| 4 | White Forest Cake | hi-res of existing subject |
| 5 | Red Velvet Cake | hi-res of existing subject |
| 6 | Butterscotch Crunch Cake | hi-res of existing subject |
| 7 | Fresh Berry Cream Cake | own photo |
| 8 | Signature Designer Cake | own photo (must match the claim "custom decoration") |
| 9 | Special Occasion Cake | own photo |
Plus real category tile images for the 9 cake subcategories.

## Sweets and snacks
Cropped from the client's supplied design mockups (demo only). Replace with approved product photography.

## How to complete
- Supply files (approved photography preferred), or export the Canva originals at full size and drop them into `mobile/assets/images/products/` using the filenames above (or add keys in `images.ts`).
- For production, serve images from object storage/CDN and store the URL in `ProductImage.url` (backend column exists).
