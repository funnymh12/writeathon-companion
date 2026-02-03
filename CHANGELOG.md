# Changelog

## [1.0.3] - 2026-02-03

### Added
- **Image Hosting**: Added support for Qiniu Cloud (七牛云) as an image storage provider. You can now configure AK/SK/Bucket in Settings.
- **Clipper**: Reinforced logic to automatically split long content (over 4000 chars) into multiple cards.

## [1.0.2] - 2026-02-03

### Added
- **Clipper (剪藏)**:
  - Added a "Refresh" button to re-fetch content, link info, or images without switching modes.
  - Refactored internal logic to use shared image upload utility.

## [1.0.1] - 2026-02-03

### Optimized
- **Memo (速记)**:
  - Removed styling borders and outlines from input fields for a cleaner writing experience.
  - Made the Quote block editable using a textarea.
  - Enabled pasting images directly into the content area (automatically uploads to ImgBB).
  - Implemented auto-resizing for both content and quote textareas.
  - Improved visual feedback during image uploads.

## [1.0.0] - 2026-02-03

### Added
- Initial UI Refactor Release.
- Modernized Clipper with Page, Link, and Image modes.
- Conversational AI Chat interface.
- Organized Settings page with AI provider selection.
- Refined Prompt library with tags and pinning.
