import re

media_map = {
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
    "/media/examples/balloon-small.jpg": "/shared-assets/images/examples/balloon-small.jpg",
    "/media/examples/balloon.jpg": "/shared-assets/images/examples/balloon.jpg",
    "/media/examples/border-diamonds.png": "/shared-assets/images/examples/border-diamonds.png",
    "/media/examples/border-florid.svg": "/shared-assets/images/examples/border-florid.svg",
    "/media/examples/border-stars.png": "/shared-assets/images/examples/border-stars.png",
    "/media/examples/crosshair.svg": "/shared-assets/images/examples/crosshair.svg",
    "/media/examples/firefox-logo.svg": "/shared-assets/images/examples/firefox-logo.svg",
    "/media/examples/hand.jpg": "/shared-assets/images/examples/hand.jpg",
    "/media/examples/hummingbird.jpg": "/shared-assets/images/examples/hummingbird.jpg",
    "/media/examples/lizard.png": "/shared-assets/images/examples/lizard.png",
    "/media/examples/moon.jpg": "/shared-assets/images/examples/moon.jpg",
    "/media/examples/plumeria-146x200.jpg": "/shared-assets/images/examples/plumeria-146x200.jpg",
    "/media/examples/plumeria.jpg": "/shared-assets/images/examples/plumeria.jpg",
    "/media/examples/rocket.svg": "/shared-assets/images/examples/rocket.svg",
    "/media/examples/round-balloon.png": "/shared-assets/images/examples/round-balloon.png",
    "/media/examples/shadow.svg#element-id": "/shared-assets/images/examples/shadow.svg#element-id",
    "/media/examples/star.png": "/shared-assets/images/examples/star.png",
    "/media/examples/star2.png": "/shared-assets/images/examples/star2.png",
    "/media/fonts/AmstelvarAlpha-VF.ttf": "/shared-assets/fonts/AmstelvarAlpha-VF.ttf",
    "/media/fonts/FiraSans-Italic.woff2": "/shared-assets/fonts/FiraSans-Italic.woff2",
    "/media/fonts/FiraSans-Regular.woff2": "/shared-assets/fonts/FiraSans-Regular.woff2",
    "/media/fonts/LeagueMono-VF.ttf": "/shared-assets/fonts/LeagueMono-VF.ttf",
    # TODO: Add to shared-assets repo.
    "/media/warning.svg": "/shared-assets/images/examples/warning.svg",
    "/media/examples/fire.png": "/shared-assets/images/examples/fire.png",
}

def map_media(code):
    if "media/" not in code:
        return code

    def replace(match):
        old_media = match.group(1)
        old_media_normalized = old_media.removeprefix("../..")

        if new_media := media_map.get(old_media_normalized):
            return match.group(0).replace(old_media, new_media)

        print(old_media)
        return match.group(0)

    return re.sub(r"""([./]*\/media\/\S*)["']""", replace, code)
