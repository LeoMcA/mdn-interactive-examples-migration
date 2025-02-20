# copy to root of content or translated-content and run

import re
import glob
import json
import os
import html

from lib import map_media

# Directory to search for all index.md files
input_files_pattern = "./files/**/index.md"
meta_files_pattern = "../interactive-examples/live-examples/wat-examples/**/meta.json"

interactive_examples_folder = "../interactive-examples"

meta_files = glob.glob(meta_files_pattern, recursive=True)
meta_map = {}

for meta_file in meta_files:
    with open(meta_file, "r") as file:
        data = json.load(file)
        for value in data["pages"].values():
            meta_map[value["fileName"]] = value

# Replace the macro with actual code blocks

def replace_macros(content, md_file):
    def replace_macro(match):
        built_path = match.group(1)
        if path_match := re.search(r"^pages\/wat\/(.*)$", built_path):
            filename = path_match.group(1)
            try:
                meta = meta_map[filename]
                wat_example_code_path = os.path.join(interactive_examples_folder,
                                                 meta["watExampleCode"])
            except KeyError:
                print(f"No such file: {filename}")
                return match.group(0)  # keep the macro unchanged

            try:
                js_example_code_path = os.path.join(interactive_examples_folder,
                                                   meta["jsExampleCode"])
            except KeyError:
                js_example_code_path = None

            with open(wat_example_code_path, "r") as file:
                wat_code = file.read()
                wat_code = map_media(wat_code)

            if js_example_code_path:
                with open(js_example_code_path, "r") as file:
                    js_code = file.read()
                    js_code = map_media(js_code)
            else:
                js_code = None

            other_args = match.group(2).lstrip(",").strip()
            suffix = match.group(3).strip()
            result = f"""{{{{InteractiveExample("{html.escape(meta["title"], quote=True)}"{f", {other_args}" if other_args else ""})}}}}

```wat interactive-example
{wat_code.strip()}
```

{f'''```js interactive-example
{js_code.rstrip()}
```''' if js_code else ""}{f'''

{suffix}''' if suffix and "interactive-examples" not in suffix else ""}"""

            return result

        return match.group(0)  # keep the macro unchanged

    # Search for EmbedInteractiveExample macros and replace them
    updated_content = re.sub(
        r'^{{EmbedInteractiveExample\("([^"]+)"([^}]*)\)}}(.*)$', replace_macro, content, 0, re.MULTILINE)

    if "/mdn/" in md_file and content != updated_content:
        print(f"Skipping file: {md_file}")
        return content

    return updated_content

# Get all index.md files recursively
md_files = glob.glob(input_files_pattern, recursive=True)

# Process each index.md file
for md_file in md_files:
    # print(f"Processing file: {md_file}")

    # Read the input content from each index.md file
    with open(md_file, "r") as file:
        content = file.read()

    # Get the updated content with macros replaced
    updated_content = replace_macros(content, md_file)

    # # Write the updated content back to the same file
    with open(md_file, "w") as out_file:
        out_file.write(updated_content)

    # print(f"Updated content written to: {md_file}")
