# copy to root of content or translated-content and run

import re
import glob
import json
import os
import html

from lib import map_media

blocklist = [
]

# Directory to search for all index.md files
input_files_pattern = "./files/**/index.md"
meta_files_pattern = "../interactive-examples/live-examples/**/meta.json"

interactive_examples_folder = "../interactive-examples"

meta_files = glob.glob(meta_files_pattern, recursive=True)
meta_map = {}

for meta_file in meta_files:
    with open(meta_file, "r") as file:
        data = json.load(file)
        for value in data["pages"].values():
            if value["type"] == 'tabbed' and value["fileName"] not in blocklist:
                meta_map[value["fileName"]] = value

# Replace the macro with actual code blocks


def replace_macros(content, md_file):
    def replace_macro(match):
        built_path = match.group(1)
        if path_match := re.search(r"^pages\/tabbed\/(.*)$", built_path):
            filename = path_match.group(1)
            try:
                meta = meta_map[filename]
                example_code_path = os.path.join(interactive_examples_folder,
                                                 meta["exampleCode"])
            except KeyError:
                print(f"No such file: {filename}")
                return match.group(0)  # keep the macro unchanged

            if 'css-examples' not in example_code_path:
                return match.group(0)  # ignore HTML examples

            try:
                css_example_src_path = os.path.join(interactive_examples_folder,
                                                    meta["cssExampleSrc"])
            except KeyError:
                css_example_src_path = None
            try:
                js_example_src_path = os.path.join(interactive_examples_folder,
                                                   meta["jsExampleSrc"])
            except KeyError:
                js_example_src_path = None

            with open(example_code_path, "r") as file:
                example_code = file.read()
                example_code = map_media(example_code)

            if css_example_src_path:
                with open(css_example_src_path, "r") as file:
                    css_example_src = file.read()
                    if "url(" in css_example_src:
                        css_example_src = map_media(css_example_src)
            else:
                css_example_src = None

            if js_example_src_path:
                with open(js_example_src_path, "r") as file:
                    js_example_src = file.read()
                    js_example_src = map_media(js_example_src)
            else:
                js_example_src = None

            other_args = match.group(2).lstrip(",").strip()
            suffix = match.group(3).strip()
            result = f"""{{{{InteractiveExample("{html.escape(meta["title"].replace("HTML Demo:", "CSS Demo:"), quote=True)}"{f", {other_args}" if other_args else ""})}}}}

```css interactive-example
{css_example_src.rstrip()}
```

```html interactive-example
{example_code.rstrip()}
```

{f'''```js interactive-example
{js_example_src.rstrip()}
```''' if js_example_src else ""}{f'''

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
