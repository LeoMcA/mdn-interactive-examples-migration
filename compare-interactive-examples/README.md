# Compare interactive examples

This compares two versions of the built site for differences in the console part of interactive javascript examples.

## Preparations

- Install dependencies via `npm i`.
- Have the old and new URLs for the site comparison ready.
- Have a checked out mdn `content` and `translated_content` ready. This will be used to extract slugs from content to build the URLs to compare.

## Running the script

- Create a `.env` file or copy `.env-dist` to `.env`.
- Fill in the variables defined in `.env-dist` by editing `.env`
- Run `npm run gather_slugs` to extract slugs from content that contain interactive examples.

At this point, the file `compare-slugs.json` has been written, containing a list of slugs to compare.

- Run `npm run fetch_results` to fetch the console output of the interactive examples for the slugs listed in `compare-slugs`.

After a successful fetch, a JSON file `compare-results.json` has been written. This file contains the raw comparison results from the script run, without any interpretation.

- Run `npm run emit_diffs compare-results.json`

This will output a JSON file containing differences worth looking at: `compare-diffs.json`.

This file will probably contain some false positives: to fetch the console output for the slugs within it again:

- Run `npm run fetch_results_from_diff`

This will output another results file at `compare-results-from-diff.json`. We can then diff this raw file again:

- Run `npm run emit_diffs compare-results-from-diff.json`

The new diff will be in `compare-diffs.json`. This process can be repeated as many times as necessary, until there's a small enough number of false positives to manually check.