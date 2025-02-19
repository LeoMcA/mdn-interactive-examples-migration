# copy to root of content or translated-content and run

import re
import glob
import json
import os
import html

# Directory to search for all index.md files
input_files_pattern = "./files/**/index.md"
meta_files_pattern = "../interactive-examples/live-examples/css-examples/**/meta.json"

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
        if path_match := re.search(r"^pages\/css\/(.*)$", built_path):
            filename = path_match.group(1)
            try:
                meta = meta_map[filename]
                example_code_path = os.path.join(interactive_examples_folder,
                                                 meta["exampleCode"])
            except KeyError:
                print(f"No such file: {filename}")
                return match.group(0)  # keep the macro unchanged

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
                    if "media/" in js_example_src or "interactive-examples.mdn.mozilla.net" in js_example_src:
                        js_example_src = map_media(js_example_src)
            else:
                js_example_src = None

            other_args = match.group(2).lstrip(",").strip()
            suffix = match.group(3).strip()
            return f"""{{{{InteractiveExample("{html.escape(meta["title"], quote=True)}"{f", {other_args}" if other_args else ""})}}}}

```html interactive-example-choice
{example_code.rstrip()}
```{f'''

```css interactive-example-choice
{css_example_src.rstrip()}
```''' if css_example_src else ""}{f'''

```js interactive-example-choice
{js_example_src.rstrip()}
```''' if js_example_src else ""}{f'''

{suffix}''' if suffix and "interactive-examples" not in suffix else ""}"""

        return match.group(0)  # keep the macro unchanged

    # Search for EmbedInteractiveExample macros and replace them
    updated_content = re.sub(
        r'^{{EmbedInteractiveExample\("([^"]+)"([^}]*)\)}}(.*)$', replace_macro, content, 0, re.MULTILINE)

    if "/mdn/" in md_file and content != updated_content:
        print(f"Skipping file: {md_file}")
        return content

    return updated_content


def map_media(code):
    def replace(match):
        mapping = {
            "/media/cc0-videos/flower.webm": "/shared-assets/videos/flower.webm",
            "/media/cc0-videos/flower.mp4": "/shared-assets/videos/flower.mp4",
            "/media/examples/mdn-info.png": "/shared-assets/images/examples/mdn-info.png",
            "/media/examples/leopard.jpg": "/shared-assets/images/examples/leopard.jpg",
            "/media/examples/mdn-info2.png": "/shared-assets/images/examples/mdn-info2.png",
            "/media/examples/mdn-info2.png": "/shared-assets/images/examples/mdn-info2.png",
            "/media/examples/In-CC0.pdf": "/shared-assets/misc/In-CC0.pdf",
            "/media/examples/login-button.png": "/shared-assets/images/examples/login-button.png",
            "/media/cc0-images/elephant-660-480.jpg": "/shared-assets/images/examples/elephant.jpg",
            "/media/cc0-audio/t-rex-roar.mp3": "/shared-assets/audio/t-rex-roar.mp3",
            "/media/cc0-images/grapefruit-slice-332-332.jpg": "/shared-assets/images/examples/grapefruit-slice.jpg",
            "/media/cc0-videos/friday.mp4": "/shared-assets/videos/friday.mp4",
            "/media/examples/friday.vtt": "/shared-assets/misc/friday.vtt",
            "/media/examples/link-element-example.css": "/shared-assets/misc/link-element-example.css",
            "/media/examples/rain.svg": "/shared-assets/images/examples/rain.svg",
            "/media/cc0-images/surfer-240-200.jpg": "/shared-assets/images/examples/surfer.jpg",
            "/media/cc0-images/painted-hand-298-332.jpg": "/shared-assets/images/examples/painted-hand.jpg",
            "/media/examples/puppy-header-logo.jpg": "/shared-assets/images/examples/puppy-header.jpg",
        }
        old_media = match.group(1)
        if new_media := mapping.get(old_media):
            return match.group(0).replace(old_media, new_media)

        print(old_media)
        return match.group(0)

    return re.sub(r"""(\/media\/\S*)["']""", replace, code)


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
