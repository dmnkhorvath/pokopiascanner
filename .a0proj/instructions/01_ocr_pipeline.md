# OCR Pipeline Technical Details

## Frame Processing
1. Video is loaded into an HTML5 video element
2. Frames are extracted at configurable intervals using canvas
3. Each frame is cropped to the text region (configurable presets: Auto, Full, Right Half, Custom)
4. Preprocessing: convert to grayscale → apply threshold (B&W at 128) → remove artifacts
5. Processed frame sent to Tesseract.js worker

## Text Matching
1. OCR text is split into lines
2. Each line is first checked for exact match against ocrLookup.json keys
3. If no exact match, fuzzy matching (Levenshtein distance) is applied
4. Configurable tolerance (0-3 character distance)
5. Matched items are categorized by type: pokemon, item, habitat, recipe

## Performance Notes
- All processing is client-side (browser JavaScript)
- Tesseract.js v5 with English language pack
- Frame skip setting helps balance speed vs accuracy
- Pre-built lookup structure for efficient fuzzy matching
