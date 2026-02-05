---
description: Automatically update version, changelog, and package the extension
---

# Automated Release Workflow

Using the custom release script to handle versioning, logging, and packaging.

1.  **Execute Release Script**: Run the dedicated Node.js release script.
    
    \\\ash
    npm run release
    \\\

    This script automatically:
    - Bumps patch version in \package.json\ and \manifest.json\
    - Updates \CHANGELOG.md\
    - Appends to the daily developer log in \docs/\
    - Runs the build process
    - Creates a new zip file in \elease/\

