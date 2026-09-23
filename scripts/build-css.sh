#!/usr/bin/env sh
# Rebuild app/static/css/site.css from the Jinja templates. Run after changing Tailwind classes.
set -eu
cd "$(dirname "$0")/.."
npx --yes tailwindcss@3 -c tailwind.config.js -i app/static/src/site.css -o app/static/css/site.css --minify "$@"
